/**
 * useCompanionChat — main hook for the AI companion chat.
 *
 * Phase 3: Real SSE streaming via /api/companion/chat.
 * Phase 4: Context-aware system prompt (devotional progress, streak,
 *           time of day, mood history, conversation memory).
 * Phase 5: Non-streaming retry after an explicit pre-provider rejection.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { v4 as uuidv4 } from 'uuid';
import {
  useCompanionChatStore,
  selectActiveMessages,
  CompanionMessage,
} from './companion-chat-store';
import { PRIMARY_BACKEND_URL, getAuthHeaders, sanitizeForPrompt } from '@/lib/api-config';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { analyzeNetworkError } from '@/lib/network-error-handler';
import { AiBudgetError, readAiBudgetError } from '@/lib/ai-budget-error';
import { parseDeepLinks } from './parse-deep-links';
import { generateConversationTitle } from './companion-service';
import { companionReplyAnnouncement } from '@/lib/companion-announcements';
import { pickRegenerateTarget } from './companion-regenerate';
import { buildCompanionRequestMessages } from './companion-chat-request';
import { resolveCompanionDisplayName } from '@/lib/support-clarity';
import { COMPANION_MESSAGE_MAX_CHARS } from '@/lib/companion-limits';
import { resolveCompanionPersonality, type CompanionPersonality } from '@/lib/companion-personality';

/**
 * WR-20: screen-reader users get no signal when a reply lands — the list
 * doesn't move accessibility focus. Announce organic completions (and
 * errors); user-initiated stops stay silent since the user caused them.
 */
function announceCompanionReply(content: string) {
  const announcement = companionReplyAnnouncement(content);
  if (announcement) {
    AccessibilityInfo.announceForAccessibility(announcement);
  }
}

/**
 * Outcome of a sendMessage call:
 *  'sent'  — a companion response was received (including a user-stopped partial)
 *  'noop'  — early return (empty text or already streaming)
 *  'error' — no usable companion response was received
 */
export type SendOutcome = 'sent' | 'noop' | 'error';

/**
 * A regenerate turn rewrites an existing companion reply under its own id
 * instead of adding a user turn and a new reply.
 */
interface RegenerateTurn {
  companionId: string;
  previousReply: string;
  originalMessage: CompanionMessage;
  reason?: string;
}

export { COMPANION_MESSAGE_MAX_CHARS } from '@/lib/companion-limits';
const STREAMING_UPDATE_INTERVAL_MS = 32; // ~30fps, matching the SDK 56 chat-template cadence.
// Inter-chunk idle timeout: a stream that goes silent this long is dead —
// abort it instead of hanging the send forever (companion-service.ts 10s
// request-timeout precedent; streams get longer grace between chunks).
const SSE_STALL_TIMEOUT_MS = 30000;

/** The stream went silent mid-response. Never falls back to the non-streaming
 * endpoint — the server already accepted the request (double-billing risk). */
class SSEStallError extends Error {
  constructor() {
    super('Companion stream stalled');
    this.name = 'SSEStallError';
  }
}

/** The backend accepted the request, but its SSE response could not complete.
 * Retrying through the non-streaming endpoint could duplicate provider work. */
class SSEIncompleteError extends Error {
  constructor(message = 'Companion stream ended before completion') {
    super(message);
    this.name = 'SSEIncompleteError';
  }
}

/** The backend rejected the streaming request before provider work began. */
class SSEPreAcceptError extends Error {
  constructor(status: number) {
    super(`Companion streaming request was rejected with HTTP ${status}`);
    this.name = 'SSEPreAcceptError';
  }
}

// ── Phase 4: Context-aware system prompt ──────────────────────────────────────

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// ── Build context payload for server-side prompt construction ────────────────

function buildCompanionContext(
  userName: string | null,
  companionName: string | null,
  devotional: { title?: string; currentDay?: number; totalDays?: number } | null,
  streakDays: number,
  companionPersonality: CompanionPersonality,
  regenerate?: RegenerateTurn
) {
  return {
    // The backend wraps these in its own regeneration instruction
    // (lib/companion-prompt.ts); here they are data only.
    regenerate: regenerate
      ? { reason: regenerate.reason, previousReply: regenerate.previousReply }
      : undefined,
    userName: userName ?? undefined,
    companionName: companionName ?? undefined,
    companionPersonality,
    devotionalTitle: devotional?.title ?? undefined,
    devotionalDay: devotional?.currentDay ?? undefined,
    devotionalTotal: devotional?.totalDays ?? undefined,
    streakDays: streakDays ?? 0,
    timeOfDay: getTimeOfDay(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
  };
}

// ── SSE consumer ──────────────────────────────────────────────────────────────

interface SSECallbacks {
  onToken: (text: string) => void;
  onThinking: () => void;
  onDone: (suggestions: string[], cleanText?: string) => void;
  onError: (message: string) => void;
  onActivity: () => void;
}

function companionAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(companionAbortError());
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);

    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function extractSSEPayloads(
  buffer: string,
  options: { flush?: boolean } = {}
): { payloads: string[]; remainder: string } {
  const payloads: string[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');

  const collectPayloads = (segment: string) => {
    for (const line of segment.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      payloads.push(payload);
    }
  };

  if (options.flush) {
    collectPayloads(normalized);
    return { payloads, remainder: '' };
  }

  const segments = normalized.split('\n\n');
  const remainder = segments.pop() ?? '';
  for (const segment of segments) {
    collectPayloads(segment);
  }

  return { payloads, remainder };
}

async function consumeSSE(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
  callbacks: SSECallbacks
): Promise<boolean> {
  const { onToken, onThinking, onDone, onError, onActivity } = callbacks;

  const response = await raceWithAbort(
    expoFetch(url, {
      method: 'POST',
      headers: { ...headers, Accept: 'text/event-stream' },
      body,
      signal,
    }),
    signal,
  );

  if (!response.ok) {
    // A daily AI budget 429 carries its own copy and must not be retried.
    const budgetError = await raceWithAbort(readAiBudgetError(response), signal);
    if (budgetError) throw budgetError;
    if (response.status >= 400 && response.status < 500) {
      throw new SSEPreAcceptError(response.status);
    }
    throw new SSEIncompleteError(`Companion streaming request failed with HTTP ${response.status}`);
  }

  // Attempt ReadableStream (RN 0.83+ with new architecture)
  const reader = response.body?.getReader();
  if (!reader) {
    throw new SSEIncompleteError('Companion response did not provide a readable stream');
  }

  const decoder = new TextDecoder();
  let sseBuffer = '';
  const processPayload = (json: string): 'done' | 'error' | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      // Skip malformed JSON
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const event = parsed as Record<string, unknown>;
    if (event.thinking) {
      onThinking();
      return null;
    }
    if (typeof event.t === 'string' && event.t) onToken(event.t);
    if (event.d) {
      onDone(
        Array.isArray(event.s) ? event.s.filter((item): item is string => typeof item === 'string') : [],
        typeof event.ct === 'string' ? event.ct : undefined,
      );
      return 'done';
    }
    if (event.error) {
      onError(typeof event.error === 'string' ? event.error : 'The companion ran into a problem answering.');
      return 'error';
    }
    return null;
  };

  const cancelReader = () => {
    try {
      const cancellation = reader.cancel();
      void cancellation.catch(() => {});
    } catch {
      // The stream is already closed or detached.
    }
  };

  // P0-2: race each read against an inter-chunk stall timer so a silently
  // dropped connection can't leave the message in 'streaming' forever.
  const readWithStallTimeout = async () => {
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const stall = new Promise<never>((_, reject) => {
      stallTimer = setTimeout(() => reject(new SSEStallError()), SSE_STALL_TIMEOUT_MS);
    });
    const read = reader.read();
    // If the stall wins the race, the losing read settles later with no
    // listener — attach a no-op handler so its rejection isn't unhandled.
    read.catch(() => {});
    try {
      return await raceWithAbort(Promise.race([read, stall]), signal);
    } finally {
      clearTimeout(stallTimer);
    }
  };

  try {
    while (true) {
      const { done, value } = await readWithStallTimeout();
      if (signal.aborted) throw companionAbortError();
      if (done) {
        sseBuffer += decoder.decode();
        const flushed = extractSSEPayloads(sseBuffer, { flush: true });
        sseBuffer = flushed.remainder;
        for (const payload of flushed.payloads) {
          const terminal = processPayload(payload);
          if (terminal) {
            cancelReader();
            return terminal === 'done';
          }
        }
        throw new SSEIncompleteError();
      }

      onActivity();
      sseBuffer += decoder.decode(value, { stream: true });
      const parsed = extractSSEPayloads(sseBuffer);
      sseBuffer = parsed.remainder;

      for (const payload of parsed.payloads) {
        const terminal = processPayload(payload);
        if (terminal) {
          cancelReader();
          return terminal === 'done';
        }
      }
    }
  } catch (err) {
    // Do not await cancellation. Some native readers never settle after an
    // interrupted request, and cancellation must still clear request state.
    cancelReader();
    if (
      err instanceof SSEIncompleteError ||
      err instanceof SSEStallError ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw err;
    }
    throw new SSEIncompleteError(
      err instanceof Error ? `Companion stream failed: ${err.message}` : undefined,
    );
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A pending native read can retain the lock until its own promise settles.
    }
  }
}

// ── Fallback: non-streaming request ────────────────────────────────────────────

async function fallbackNonStreaming(
  headers: Record<string, string>,
  companionContext: Record<string, unknown>,
  chatMessages: { role: 'user' | 'assistant'; content: string }[],
  signal: AbortSignal,
): Promise<{ responseText: string; suggestions: string[] }> {
  // Call companion/chat with stream:false — gets full JSON response
  // with the proper system prompt and companion personality.
  const response = await raceWithAbort(
    expoFetch(`${PRIMARY_BACKEND_URL}/api/companion/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        context: companionContext,
        messages: chatMessages,
        stream: false,
      }),
      signal,
    }),
    signal,
  );

  if (!response.ok) {
    throw (await raceWithAbort(readAiBudgetError(response), signal)) ??
      new Error(`Backend returned ${response.status}`);
  }

  const data = await raceWithAbort(response.json(), signal);
  const rawText = data?.content ?? data?.text ?? '';
  const suggestions: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];

  const fallbackSuggestions =
    suggestions.length > 0
      ? suggestions
      : ['Tell me more', 'How do I apply this?', 'Help me with a prayer'];

  return { responseText: rawText, suggestions: fallbackSuggestions };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useCompanionChat() {
  const messages = useCompanionChatStore(selectActiveMessages);
  const addMessage = useCompanionChatStore((s) => s.addMessage);
  const updateMessage = useCompanionChatStore((s) => s.updateMessage);
  const startNewConversation = useCompanionChatStore((s) => s.startNewConversation);
  const checkAndArchiveStale = useCompanionChatStore((s) => s.checkAndArchiveStale);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // WR-09: streams are keyed by conversation so switching mid-stream neither
  // orphans the reply nor blocks the newly-viewed conversation.
  const activeConversationId = useCompanionChatStore((s) => s.activeConversationId);
  const inFlightRef = useRef(new Map<string, {
    abort: AbortController;
    companionId: string;
    lastActivityAt: number;
    stoppedByUser: boolean;
  }>());
  const [, setStreamVersion] = useState(0);
  const bumpStreamVersion = useCallback(() => setStreamVersion((v) => v + 1), []);
  const isStreaming = activeConversationId != null && inFlightRef.current.has(activeConversationId);
  const activeRequestCompanionId = activeConversationId
    ? inFlightRef.current.get(activeConversationId)?.companionId ?? null
    : null;

  // Phase 4: Gather user context
  const userName = useUnfoldStore((s) => s.user?.name ?? null);
  const companionName = useUnfoldStore((s) =>
    resolveCompanionDisplayName(s.user?.companionName, s.companionName),
  );
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const companionPersonality = useUnfoldStore((s) => resolveCompanionPersonality(s.user?.companionPersonality));
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const streakDays = useUnfoldStore((s) => s.streakCurrent);

  const currentDevotional = currentDevotionalId
    ? devotionals.find((d) => d.id === currentDevotionalId) ?? null
    : null;

  // Auto-archive stale conversations (>24h inactive) on mount
  useEffect(() => {
    checkAndArchiveStale();
  }, [checkAndArchiveStale]);

  // P0-4: transient chrome (suggestions, error banner, searching indicator)
  // belongs to the conversation it came from — clear it on switch.
  //
  // Only a switch *between* conversations counts. The first send of a session
  // creates the conversation (null → id) while its own reply is already
  // streaming, so treating that as a switch would wipe the very chrome that
  // send just produced.
  const previousConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousConversationIdRef.current;
    previousConversationIdRef.current = activeConversationId ?? null;
    if (previous === null || previous === activeConversationId) return;
    setIsSearching(false);
    setSuggestions([]);
    setError(null);
  }, [activeConversationId]);

  // P1: on foreground resume, reconcile messages stuck in 'streaming' whose
  // conversation has no in-flight request (iOS suspended the JS runtime and
  // the stream died without its error path running) — mark them retryable.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      const { conversations, updateMessage: update } = useCompanionChatStore.getState();
      const now = Date.now();
      for (const conv of conversations ?? []) {
        const request = inFlightRef.current.get(conv.id);
        if (request) {
          // Preserve short suspensions. Once a request has shown no activity
          // for the same interval as an SSE stall, apply the same abort policy.
          if (now - request.lastActivityAt >= SSE_STALL_TIMEOUT_MS) {
            request.abort.abort();
          }
          continue;
        }
        for (const m of conv.messages ?? []) {
          if (m.status === 'streaming') {
            // `interrupted` keeps whatever partial text arrived rendering as
            // reply text; the other error paths store an error string in
            // `content` instead.
            update(m.id, { status: 'error', interrupted: true }, conv.id);
          }
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // ── Send message ───────────────────────────────────────────────────────

  const runTurn = useCallback(
    async (text: string, regenerate?: RegenerateTurn): Promise<SendOutcome> => {
      const trimmedText = text.trim();
      if (!trimmedText) return 'noop';

      // Companion requests require the profile that onboarding commits on its
      // final step. Read current store state so a reset blocks sends and
      // regenerations from an existing hook before auth or provider work.
      if (useUnfoldStore.getState().user?.hasCompletedOnboarding !== true) {
        return 'noop';
      }

      // A pulled delete can leave a stale active id. Only send into a row
      // that still exists; otherwise start a real conversation.
      const startingState = useCompanionChatStore.getState();
      const existingActive = startingState.conversations.find(
        (conversation) => conversation.id === startingState.activeConversationId,
      );
      if (!existingActive) {
        startingState.startNewConversation();
      }
      const streamConversationId = useCompanionChatStore.getState().activeConversationId!;
      if (inFlightRef.current.has(streamConversationId)) return 'noop';

      setError(null);
      setSuggestions([]);

      let companionId: string;
      if (regenerate) {
        // Regenerate in place: the user turn already exists and the reply is
        // rewritten under its own id, so nothing is deleted and sync sees an
        // update rather than a new row.
        companionId = regenerate.companionId;
        updateMessage(companionId, {
          content: '',
          status: 'streaming',
          feedback: null,
          feedbackReason: null,
          citations: [],
          suggestions: [],
          deepLinks: [],
          interrupted: false,
        }, streamConversationId);
      } else {
        // User message — uuid ids: Date.now() collides when two messages land
        // in the same millisecond (retry taps, chip + send race).
        const userMsg: CompanionMessage = {
          id: uuidv4(),
          role: 'user',
          content: trimmedText,
          timestamp: Date.now(),
          status: 'sent',
        };
        addMessage(userMsg);

        // Companion placeholder
        companionId = uuidv4();
        const companionMsg: CompanionMessage = {
          id: companionId,
          role: 'companion',
          content: '',
          timestamp: Date.now(),
          status: 'streaming',
        };
        addMessage(companionMsg);
      }

      const abortController = new AbortController();
      const inFlightRequest = {
        abort: abortController,
        companionId,
        lastActivityAt: Date.now(),
        stoppedByUser: false,
      };
      inFlightRef.current.set(streamConversationId, inFlightRequest);
      bumpStreamVersion();

      // Throttled store updates — batch token updates to reduce re-renders while
      // always flushing the newest text, not the first token in the throttle window.
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingUpdate: { id: string; text: string } | null = null;
      const flushPendingUpdate = () => {
        if (!pendingUpdate) return;
        const { id, text: nextText } = pendingUpdate;
        pendingUpdate = null;
        updateMessage(id, { content: nextText }, streamConversationId);
      };
      const throttledUpdate = (id: string, text: string) => {
        pendingUpdate = { id, text };
        if (!throttleTimer) {
          throttleTimer = setTimeout(() => {
            throttleTimer = null;
            flushPendingUpdate();
          }, STREAMING_UPDATE_INTERVAL_MS);
        }
      };
      const cancelThrottle = () => {
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        pendingUpdate = null;
      };
      let accumulatedText = '';
      let hasReceivedStreamingToken = false;
      // True while the "Looking something up…" indicator is on. Cleared by the
      // next token — including the first token of a post-tool-call round, which
      // used to leave the indicator on until the stream finished.
      let searchingIndicatorOn = false;

      // P0-4: transient UI state (suggestions banner, error banner, searching
      // indicator) belongs to the visible conversation — a background stream
      // finishing must not repaint chrome over whatever the user switched to.
      const isStreamConversationVisible = () =>
        useCompanionChatStore.getState().activeConversationId === streamConversationId;

      try {
        const streamConversation = useCompanionChatStore.getState().conversations
          .find((conversation) => conversation.id === streamConversationId);
        const chatMessages = buildCompanionRequestMessages(streamConversation?.messages ?? [], {
          userText: trimmedText,
          rewriteCompanionId: regenerate ? companionId : undefined,
          sanitize: sanitizeForPrompt,
          maxChars: COMPANION_MESSAGE_MAX_CHARS,
        });

        const companionContext = buildCompanionContext(
          userName,
          companionName,
          currentDevotional,
          streakDays ?? 0,
          companionPersonality,
          regenerate
        );
        const headers = await raceWithAbort(getAuthHeaders(), abortController.signal);

        // ── Try SSE streaming (Phase 3) ──────────────────────────────────

        let streamSucceeded = false;
        // P0-3: a server-sent {error} event means the backend answered — it
        // must surface as an error (keeping any partial text), never as a
        // silent retry through the non-streaming endpoint (double-billed
        // request + visible answer rewind).
        let serverErrorMessage: string | null = null;

        try {
          streamSucceeded = await consumeSSE(
            `${PRIMARY_BACKEND_URL}/api/companion/chat`,
            headers,
            JSON.stringify({
              messages: chatMessages,
              model: 'claude-haiku-4-5-20251001',
              conversationId: streamConversationId,
              context: companionContext,
            }),
            abortController.signal,
            {
              onActivity: () => {
                const activeRequest = inFlightRef.current.get(streamConversationId);
                if (activeRequest === inFlightRequest) activeRequest.lastActivityAt = Date.now();
              },
              onToken: (token) => {
                // Clear the searching indicator on the first real token and on the
                // first token after any `onThinking`. Local flags, not captured
                // React state: `onThinking` can run after this callback has
                // already closed over the initial value.
                if (!hasReceivedStreamingToken || searchingIndicatorOn) {
                  hasReceivedStreamingToken = true;
                  searchingIndicatorOn = false;
                  if (isStreamConversationVisible()) setIsSearching(false);
                }
                accumulatedText += token;
                throttledUpdate(companionId, accumulatedText);
              },
              onThinking: () => {
                searchingIndicatorOn = true;
                if (isStreamConversationVisible()) setIsSearching(true);
              },
              onDone: (sug, cleanText) => {
                cancelThrottle();
                if (isStreamConversationVisible()) setIsSearching(false);
                const rawText = cleanText || accumulatedText;
                const finalSuggestions =
                  sug.length > 0
                    ? sug
                    : [
                        'Tell me more',
                        'How do I apply this?',
                        'Help me with a prayer',
                      ];

                // Extract deep links from response
                const { cleanContent, deepLinks } = parseDeepLinks(rawText);

                updateMessage(companionId, {
                  content: cleanContent,
                  deepLinks,
                  status: 'complete',
                  suggestions: finalSuggestions,
                }, streamConversationId);
                if (isStreamConversationVisible()) setSuggestions(finalSuggestions);
                announceCompanionReply(cleanContent);
              },
              onError: (msg) => {
                serverErrorMessage = msg || 'The companion ran into a problem answering.';
              },
            }
          );
        } catch (sseErr: any) {
          if (sseErr.name === 'AbortError') throw sseErr;

          // The daily AI budget is used up: the non-streaming endpoint would
          // answer the same 429, so surface the budget copy instead of
          // retrying into the generic failure.
          if (sseErr instanceof AiBudgetError) throw sseErr;

          // Only an explicit client-error response proves the streaming
          // request was rejected before provider work began.
          if (!(sseErr instanceof SSEPreAcceptError)) throw sseErr;

          // This rejected request can safely retry through the non-streaming endpoint.
          logger.warn('[CompanionChat] SSE failed, falling back:', sseErr.message);
          streamSucceeded = false;
        }

        // ── Server {error} event: surface, never fall back (P0-3) ────────

        if (!streamSucceeded && serverErrorMessage !== null) {
          cancelThrottle();
          if (isStreamConversationVisible()) setIsSearching(false);
          if (accumulatedText) {
            // Preserve the partial text and its interruption state across launches.
            updateMessage(companionId, {
              content: accumulatedText,
              status: 'error',
              interrupted: true,
            }, streamConversationId);
            if (isStreamConversationVisible()) {
              setError(`${serverErrorMessage} Your reply may be incomplete.`);
            }
            AccessibilityInfo.announceForAccessibility(
              `Companion reply interrupted. ${serverErrorMessage}`,
            );
            return 'sent';
          }
          updateMessage(companionId, {
            status: 'error',
            content: serverErrorMessage,
          }, streamConversationId);
          if (isStreamConversationVisible()) setError(serverErrorMessage);
          AccessibilityInfo.announceForAccessibility(
            `Companion reply failed. ${serverErrorMessage}`,
          );
          return 'error';
        }

        // ── Stream ended without `d` after partial content (P0-3) ────────

        if (!streamSucceeded && hasReceivedStreamingToken) {
          // Preserve partial text without issuing a second provider request.
          cancelThrottle();
          if (isStreamConversationVisible()) setIsSearching(false);
          updateMessage(companionId, {
            content: accumulatedText,
            status: 'error',
            interrupted: true,
          }, streamConversationId);
          if (isStreamConversationVisible()) {
            setError('The connection dropped mid-reply. Your reply may be incomplete.');
          }
          announceCompanionReply(accumulatedText);
          streamSucceeded = true; // partial kept — skip the fallback below
        }

        // ── Fallback: non-streaming ──────────────────────────────────────

        if (!streamSucceeded) {
          // If the SSE attempt produced partial tokens but never emitted `done`,
          // do not let its pending throttled write race the full fallback answer.
          cancelThrottle();

          const result = await fallbackNonStreaming(
            headers,
            companionContext,
            chatMessages,
            abortController.signal,
          );
          cancelThrottle();

          // Extract deep links from fallback response
          const { cleanContent: fallbackClean, deepLinks: fallbackLinks } = parseDeepLinks(result.responseText);

          updateMessage(companionId, {
            content: fallbackClean,
            deepLinks: fallbackLinks,
            status: 'complete',
            suggestions: result.suggestions,
          }, streamConversationId);
          if (isStreamConversationVisible()) setSuggestions(result.suggestions);
          announceCompanionReply(fallbackClean);
        }

        // Generate title after first exchange (user + companion) — scoped to
        // the stream's conversation, not whatever is active at completion.
        const convId = streamConversationId;
        const conv = useCompanionChatStore.getState().conversations.find(c => c.id === convId);
        const convMessages = conv?.messages ?? [];
        const userMessages = convMessages.filter(m => m.role === 'user' && (m.status === 'sent' || m.status === 'complete'));
        const companionMessages = convMessages.filter(m => m.role === 'companion' && m.status === 'complete');

        // Only generate title once — on the first complete exchange, and only if no title yet
        if (userMessages.length === 1 && companionMessages.length === 1 && !conv?.title) {
          // Fire and forget — don't await, don't block
          generateConversationTitle(
            userMessages[0].content,
            companionMessages[0].content,
          ).then((title) => {
            if (title && convId) {
              useCompanionChatStore.getState().updateConversation(convId, { title });
            }
          }).catch(() => {
            // Silent failure — title is a nice-to-have
          });
        }

        return 'sent';
      } catch (err: any) {
        cancelThrottle();
        if (err.name === 'AbortError') {
          // An explicit Stop before any text should not become a red failure
          // bubble. New placeholders were never durable, so remove only that
          // local row. A stopped regeneration restores its original reply.
          if (inFlightRequest.stoppedByUser && !accumulatedText) {
            if (regenerate) {
              updateMessage(companionId, regenerate.originalMessage, streamConversationId);
            } else {
              useCompanionChatStore.setState((state) => ({
                conversations: state.conversations.map((conversation) => {
                  if (conversation.id !== streamConversationId) return conversation;
                  const currentMessages = conversation.messages ?? [];
                  const messagesWithoutPendingReply = currentMessages.filter((message) => !(
                    message.id === companionId &&
                    message.role === 'companion' &&
                    message.status === 'streaming' &&
                    message.content === ''
                  ));
                  return messagesWithoutPendingReply.length === currentMessages.length
                    ? conversation
                    : { ...conversation, messages: messagesWithoutPendingReply };
                }),
              }));
            }
            return 'error';
          }

          // Preserve any buffered text for explicit stops and other aborts.
          if (accumulatedText) {
            updateMessage(companionId, { content: accumulatedText }, streamConversationId);
          }
          const streamConv = useCompanionChatStore.getState().conversations
            .find((c) => c.id === streamConversationId);
          const current = (streamConv?.messages ?? []).find((m) => m.id === companionId);
          updateMessage(companionId, {
            status: 'error',
            interrupted: Boolean(current?.content),
          }, streamConversationId);
          return current?.content ? 'sent' : 'error';
        } else {
          const analyzed = analyzeNetworkError(err);
          // The budget copy (with its reset estimate) beats the generic classifier.
          const userFriendlyMessage =
            err instanceof AiBudgetError ? err.message : analyzed.userFriendlyMessage;
          logger.warn('[CompanionChat] Error:', err, analyzed.type);
          if (accumulatedText) {
            // Preserve partial text with a durable interruption flag and retry control.
            updateMessage(companionId, {
              content: accumulatedText,
              status: 'error',
              interrupted: true,
            }, streamConversationId);
            if (isStreamConversationVisible()) {
              setError(`${userFriendlyMessage} Your reply may be incomplete.`);
            }
            AccessibilityInfo.announceForAccessibility(
              `Connection interrupted. ${userFriendlyMessage} Your reply may be incomplete.`,
            );
            return 'sent';
          }
          if (isStreamConversationVisible()) setError(userFriendlyMessage);
          updateMessage(companionId, {
            status: 'error',
            content: userFriendlyMessage,
          }, streamConversationId);
          AccessibilityInfo.announceForAccessibility(
            `Companion reply failed. ${userFriendlyMessage}`,
          );
          return 'error';
        }
      } finally {
        // The stream is over one way or another — never leave the searching
        // indicator on for the conversation the user is looking at.
        if (isStreamConversationVisible()) setIsSearching(false);
        if (inFlightRef.current.get(streamConversationId) === inFlightRequest) {
          inFlightRef.current.delete(streamConversationId);
          bumpStreamVersion();
        }
      }
    },
    [
      addMessage,
      updateMessage,
      userName,
      companionName,
      companionPersonality,
      currentDevotional,
      streakDays,
      bumpStreamVersion,
    ]
  );

  const sendMessage = useCallback(
    (text: string): Promise<SendOutcome> => runTurn(text),
    [runTurn]
  );

  // Rewrite one finished reply in place. Same quota rules as a send: the
  // screen charges a free message on 'sent'. An explicit companionId retries
  // that row (including an older error) instead of the latest reply.
  const regenerateReply = useCallback(
    async (options?: { reason?: string; companionId?: string }): Promise<SendOutcome> => {
      const state = useCompanionChatStore.getState();
      const conversationId = state.activeConversationId;
      if (!conversationId || inFlightRef.current.has(conversationId)) return 'noop';
      const target = pickRegenerateTarget(selectActiveMessages(state), options?.companionId);
      if (!target) return 'noop';
      if (options?.companionId && target.companionMessage.id !== options.companionId) return 'noop';
      const { companionMessage } = target;
      // An error row stores an app-authored error string unless it was an
      // interrupted partial; only real reply text is worth quoting back.
      const previousReply =
        companionMessage.status === 'complete' || companionMessage.interrupted
          ? companionMessage.content
          : '';
      return runTurn(target.userMessage.content, {
        companionId: companionMessage.id,
        previousReply,
        originalMessage: companionMessage,
        reason: options?.reason,
      });
    },
    [runTurn]
  );

  // ── Stop generation ────────────────────────────────────────────────────

  const stopGeneration = useCallback(() => {
    // Stop targets the conversation the user is looking at — never an
    // invisible background stream (WR-09).
    const active = useCompanionChatStore.getState().activeConversationId;
    const request = active ? inFlightRef.current.get(active) : undefined;
    if (request) {
      request.stoppedByUser = true;
      request.abort.abort();
    }
  }, []);

  return {
    messages,
    isStreaming,
    activeRequestCompanionId,
    isSearching,
    suggestions,
    error,
    sendMessage,
    regenerateReply,
    stopGeneration,
    startNewConversation,
  };
}
