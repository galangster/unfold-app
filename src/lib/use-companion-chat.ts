/**
 * useCompanionChat — main hook for the AI companion chat.
 *
 * Phase 3: Real SSE streaming via /api/companion/chat.
 * Phase 4: Context-aware system prompt (devotional progress, streak,
 *           time of day, mood history, conversation memory).
 * Phase 5: Graceful fallback to non-streaming if SSE fails.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import {
  useCompanionChatStore,
  selectActiveMessages,
  CompanionMessage,
} from './companion-chat-store';
import { PRIMARY_BACKEND_URL, getAuthHeaders, sanitizeForPrompt } from '@/lib/api-config';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { parseDeepLinks } from './parse-deep-links';
import { generateConversationTitle } from './companion-service';
import { companionReplyAnnouncement } from '@/lib/companion-announcements';

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
 *  'error' — stream + fallback both failed with no usable response
 */
export type SendOutcome = 'sent' | 'noop' | 'error';

export { COMPANION_MESSAGE_MAX_CHARS } from '@/lib/companion-limits';
import { COMPANION_MESSAGE_MAX_CHARS } from '@/lib/companion-limits';
const STREAMING_UPDATE_INTERVAL_MS = 32; // ~30fps, matching the SDK 56 chat-template cadence.

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
  streakDays: number
) {
  return {
    userName: userName ?? undefined,
    companionName: companionName ?? undefined,
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
  const { onToken, onThinking, onDone, onError } = callbacks;

  const response = await expoFetch(url, {
    method: 'POST',
    headers: { ...headers, Accept: 'text/event-stream' },
    body,
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  // Attempt ReadableStream (RN 0.83+ with new architecture)
  const reader = response.body?.getReader();
  if (!reader) {
    // No streaming support — return false to trigger fallback
    return false;
  }

  const decoder = new TextDecoder();
  let sseBuffer = '';
  let sawDone = false;

  const processPayload = (json: string) => {
    try {
      const event = JSON.parse(json);
      if (event.thinking) {
        onThinking();
        return;
      }
      if (event.t) onToken(event.t);
      if (event.d) {
        sawDone = true;
        onDone(event.s || [], event.ct);
      }
      if (event.error) onError(event.error);
    } catch {
      // Skip malformed JSON
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        sseBuffer += decoder.decode();
        const flushed = extractSSEPayloads(sseBuffer, { flush: true });
        sseBuffer = flushed.remainder;
        for (const payload of flushed.payloads) {
          processPayload(payload);
        }
        break;
      }

      sseBuffer += decoder.decode(value, { stream: true });
      const parsed = extractSSEPayloads(sseBuffer);
      sseBuffer = parsed.remainder;

      for (const payload of parsed.payloads) {
        processPayload(payload);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return sawDone;
}

// ── Fallback: non-streaming request with progressive reveal ───────────────────

async function fallbackNonStreaming(
  headers: Record<string, string>,
  companionContext: Record<string, unknown>,
  chatMessages: { role: 'user' | 'assistant'; content: string }[],
  signal: AbortSignal,
  onWord: (revealed: string) => void
): Promise<{ responseText: string; suggestions: string[] }> {
  // Call companion/chat with stream:false — gets full JSON response
  // with the proper system prompt and companion personality.
  const response = await expoFetch(
    `${PRIMARY_BACKEND_URL}/api/companion/chat`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        context: companionContext,
        messages: chatMessages,
        stream: false,
      }),
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }

  const data = await response.json();
  const rawText = data?.content ?? data?.text ?? '';
  const suggestions: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];

  // Progressive reveal (~120 tokens/sec) for smooth UX
  const words = rawText.split(/(\s+)/);
  let revealed = '';
  for (let i = 0; i < words.length; i++) {
    if (signal.aborted) break;
    revealed += words[i];
    onWord(revealed);
    if (i % 2 === 0) {
      await new Promise<void>((r) => setTimeout(r, 8));
    }
  }

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
  const inFlightRef = useRef(new Map<string, { abort: AbortController; companionId: string }>());
  const [, setStreamVersion] = useState(0);
  const bumpStreamVersion = useCallback(() => setStreamVersion((v) => v + 1), []);
  const isStreaming = activeConversationId != null && inFlightRef.current.has(activeConversationId);

  // Phase 4: Gather user context
  const userName = useUnfoldStore((s) => s.user?.name ?? null);
  const companionName = useUnfoldStore((s) => s.companionName);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const streakDays = useUnfoldStore((s) => s.streakCurrent);

  const currentDevotional = currentDevotionalId
    ? devotionals.find((d) => d.id === currentDevotionalId) ?? null
    : null;

  // Auto-archive stale conversations (>24h inactive) on mount
  useEffect(() => {
    checkAndArchiveStale();
  }, [checkAndArchiveStale]);

  // ── Send message ───────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string): Promise<SendOutcome> => {
      const trimmedText = text.trim();
      if (!trimmedText) return 'noop';

      // Ensure an active conversation exists before sending
      if (!useCompanionChatStore.getState().activeConversationId) {
        useCompanionChatStore.getState().startNewConversation();
      }
      const streamConversationId = useCompanionChatStore.getState().activeConversationId!;
      if (inFlightRef.current.has(streamConversationId)) return 'noop';

      setError(null);
      setSuggestions([]);

      // User message
      const userMsg: CompanionMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        content: trimmedText,
        timestamp: Date.now(),
        status: 'sent',
      };
      addMessage(userMsg);

      // Companion placeholder
      const companionId = `${Date.now() + 1}-companion`;
      const companionMsg: CompanionMessage = {
        id: companionId,
        role: 'companion',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
      };
      addMessage(companionMsg);

      const abortController = new AbortController();
      inFlightRef.current.set(streamConversationId, { abort: abortController, companionId });
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

      try {
        // Build conversation context (last 10 messages)
        const currentMessages = selectActiveMessages(useCompanionChatStore.getState());
        const recentMessages = currentMessages
          .filter((m) => m.status === 'sent' || m.status === 'complete')
          .slice(-10)
          .map((m) => ({
            role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: sanitizeForPrompt(m.content),
          }));

        const chatMessages = [
          ...recentMessages,
          { role: 'user' as const, content: sanitizeForPrompt(trimmedText, COMPANION_MESSAGE_MAX_CHARS) },
        ];

        const companionContext = buildCompanionContext(
          userName,
          companionName,
          currentDevotional,
          streakDays ?? 0
        );
        const headers = await getAuthHeaders();

        // ── Try SSE streaming (Phase 3) ──────────────────────────────────

        let streamSucceeded = false;

        try {
          streamSucceeded = await consumeSSE(
            `${PRIMARY_BACKEND_URL}/api/companion/chat`,
            headers,
            JSON.stringify({
              messages: chatMessages,
              model: 'claude-haiku-4-5-20251001',
              conversationId: useCompanionChatStore.getState().activeConversationId,
              context: companionContext,
            }),
            abortController.signal,
            {
              onToken: (token) => {
                // Clear searching state on first real token. This must use a local
                // flag, not captured React state, because `onThinking` can run
                // after this callback has already closed over the initial value.
                if (!hasReceivedStreamingToken) {
                  hasReceivedStreamingToken = true;
                  setIsSearching(false);
                }
                accumulatedText += token;
                throttledUpdate(companionId, accumulatedText);
              },
              onThinking: () => {
                setIsSearching(true);
              },
              onDone: (sug, cleanText) => {
                cancelThrottle();
                setIsSearching(false);
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
                  deepLinks: deepLinks.length > 0 ? deepLinks : undefined,
                  status: 'complete',
                  suggestions: finalSuggestions,
                }, streamConversationId);
                setSuggestions(finalSuggestions);
                announceCompanionReply(cleanContent);
              },
              onError: (msg) => {
                throw new Error(msg);
              },
            }
          );
        } catch (sseErr: any) {
          if (sseErr.name === 'AbortError') throw sseErr;

          // SSE failed — fall back to non-streaming (Phase 5: graceful degradation)
          logger.warn('[CompanionChat] SSE failed, falling back:', sseErr.message);
          streamSucceeded = false;
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
            (revealed) => {
              throttledUpdate(companionId, revealed);
            }
          );

          // The fallback reveal may still have a delayed prefix write queued.
          // Cancel it before committing the authoritative full response, or a
          // stale prefix can overwrite a complete message after suggestions render.
          cancelThrottle();

          // Extract deep links from fallback response
          const { cleanContent: fallbackClean, deepLinks: fallbackLinks } = parseDeepLinks(result.responseText);

          updateMessage(companionId, {
            content: fallbackClean,
            deepLinks: fallbackLinks.length > 0 ? fallbackLinks : undefined,
            status: 'complete',
            suggestions: result.suggestions,
          }, streamConversationId);
          setSuggestions(result.suggestions);
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
          // User stopped — flush any buffered tokens before setting status
          if (accumulatedText) {
            updateMessage(companionId, { content: accumulatedText }, streamConversationId);
          }
          const streamConv = useCompanionChatStore.getState().conversations
            .find((c) => c.id === streamConversationId);
          const current = (streamConv?.messages ?? []).find((m) => m.id === companionId);
          updateMessage(companionId, {
            status: current?.content ? 'complete' : 'error',
          }, streamConversationId);
          return current?.content ? 'sent' : 'error';
        } else {
          logger.warn('[CompanionChat] Error:', err);
          setError('Something went wrong. Try again?');
          updateMessage(companionId, {
            status: 'error',
            content: 'Something went wrong. Tap to retry.',
          }, streamConversationId);
          AccessibilityInfo.announceForAccessibility('Companion reply failed. Something went wrong. Tap the message to retry.');
          return 'error';
        }
      } finally {
        inFlightRef.current.delete(streamConversationId);
        bumpStreamVersion();
      }
    },
    [
      isStreaming,
      addMessage,
      updateMessage,
      userName,
      companionName,
      currentDevotional,
      streakDays,
    ]
  );

  // ── Stop generation ────────────────────────────────────────────────────

  const stopGeneration = useCallback(() => {
    // Stop targets the conversation the user is looking at — never an
    // invisible background stream (WR-09).
    const active = useCompanionChatStore.getState().activeConversationId;
    if (active) inFlightRef.current.get(active)?.abort.abort();
  }, []);

  return {
    messages,
    isStreaming,
    isSearching,
    suggestions,
    error,
    sendMessage,
    stopGeneration,
    startNewConversation,
  };
}
