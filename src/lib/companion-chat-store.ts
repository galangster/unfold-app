/**
 * Companion Chat Store
 * Persists conversation messages via Zustand + MMKV.
 * Separate from the main store to keep concerns isolated.
 *
 * v2: Multi-conversation model — conversations[], auto-archive, summaries.
 * v3: Add updatedAt for cloud sync.
 * v4: Rename summary to title, add updateConversation/setActiveConversation.
 * v5: Add deepLinks to CompanionMessage.
 */
import { AppState } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mmkvStorage } from './mmkv-storage';
import { createDebouncedJSONStorage } from './debounced-persist-storage';
import { shouldFlushAutosaveOnAppState } from './autosave-controller';

import { getAuthHeaders, PRIMARY_BACKEND_URL } from '@/lib/api-config';
import type { DeepLinkData } from './parse-deep-links';
import { BOOK_NAME_TO_ID } from './bible-constants';
import {
  companionConversationSyncData,
  companionMessageSyncData,
  enqueuePersonalDataSyncChange,
} from './personal-data-sync-records';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Citation {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  displayText: string;
  translation: string;
}

export type MessageStatus = 'sending' | 'sent' | 'streaming' | 'complete' | 'error';

export interface CompanionMessage {
  id: string;
  role: 'user' | 'companion';
  content: string;
  timestamp: number;
  status: MessageStatus;
  citations?: Citation[];
  suggestions?: string[];
  feedback?: 'positive' | 'negative' | null;
  /** Thumbs-down reason chip id (companion-regenerate.ts FEEDBACK_REASONS); null until picked. */
  feedbackReason?: string | null;
  deepLinks?: DeepLinkData[];
  updatedAt?: string; // ISO timestamp for sync
  /**
   * A reply that was cut off mid-stream and reconciled to `status: 'error'`
   * with its partial text left in `content`. Every other error row stores an
   * app-authored error string in `content`, so the renderer needs this flag
   * to show the partial as reply text instead of as the error message.
   * Travels with the sync record so another device renders it the same way.
   */
  interrupted?: boolean;
}

export interface Conversation {
  id: string;
  messages: CompanionMessage[];
  createdAt: number;
  lastMessageAt: number;
  title: string | null;
  topicTags: string[];
  archived: boolean;
  pinned?: boolean;
  updatedAt?: string; // ISO timestamp for sync
}

// ── Constants ─────────────────────────────────────────────────────────────

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Cap stored messages per conversation to prevent unbounded growth in MMKV
const MAX_STORED_MESSAGES = 200;
const MAX_CONVERSATIONS = 50;
const INACTIVITY_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Title helper ──────────────────────────────────────────────────────────

const TITLE_FILLER_PREFIXES = [
  /^can you\s+/i,
  /^could you\s+/i,
  /^would you\s+/i,
  /^will you\s+/i,
  /^please\s+/i,
  /^help me\s+(?:understand|with|figure out|talk through)?\s*/i,
  /^i need\s+(?:help\s+with\s+)?/i,
  /^let'?s\s+talk\s+about\s+/i,
  /^i want to\s+(?:talk about|understand|process)\s+/i,
  /^what does\s+/i,
  /^why does\s+/i,
  /^how do i\s+/i,
  /^how can i\s+/i,
];

function toSentenceCase(words: string[]): string {
  // Preserve the user's own casing — the words come from their typed message,
  // so proper nouns survive as typed. Only ensure the first char is capitalized.
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export function deriveConversationTitleFromText(text: string): string | null {
  const normalized = text
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/[“”"'`]/g, '')
    .replace(/[?!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  let stripped = normalized;
  for (const pattern of TITLE_FILLER_PREFIXES) {
    stripped = stripped.replace(pattern, '').trim();
  }

  const source = stripped || normalized;
  const words = source
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9:/-]+$/g, ''))
    .filter(Boolean);

  if (words.length === 0) return null;

  const selected = words.slice(0, 6);
  const title = toSentenceCase(selected);
  return title.length > 0 ? title : null;
}

// Words that stay capitalized mid-title (faith proper nouns + first person).
const TITLE_KEEP_WORDS = new Set([
  'i', "i'm", "i'll", "i've", "i'd",
  'god', "god's", 'jesus', "jesus'", 'christ', "christ's", 'lord', "lord's",
  'holy', 'spirit', 'bible', 'scripture', 'scriptures', 'christian', 'christians',
]);

/**
 * Display-side de-slop for stored/AI conversation titles (machine Title Case
 * is a model fingerprint): lowercase Title-Cased words after the first,
 * keeping likely proper nouns — Bible book names (via BOOK_NAME_TO_ID), faith
 * terms, "I" — plus acronyms (NIV), mixed-case words, anything with digits
 * (Psalm 23, 3:16), and the word after a numbered-book digit (1 Corinthians).
 */
export function sentenceCaseTitle(title: string): string {
  const words = title.split(' ');
  return words
    .map((word, index) => {
      if (index === 0) return word;
      if (/\d/.test(word)) return word;
      // Only simple Title Case words (Xxxx…) are candidates; ALL-CAPS (NIV)
      // and mixed-case (McRae) pass through untouched.
      const letters = word.replace(/[^A-Za-z'’]+$/g, '');
      if (!/^[A-Z][a-z'’]*$/.test(letters)) return word;
      const bare = word.toLowerCase().replace(/’/g, "'").replace(/[^a-z']/g, '');
      if (TITLE_KEEP_WORDS.has(bare)) return word;
      if (BOOK_NAME_TO_ID[bare] !== undefined) return word;
      // Numbered books: "1 Corinthians", "2 Timothy" — keyed with the digit
      const prev = words[index - 1] ?? '';
      if (/^[1-3]$/.test(prev) && BOOK_NAME_TO_ID[`${prev} ${bare}`] !== undefined) return word;
      return word.toLowerCase();
    })
    .join(' ');
}

export function generateTitle(conversation: Conversation): string {
  // Primary: use topic tags if available
  const tags = conversation.topicTags ?? [];
  if (tags.length > 0) {
    const topics = tags.slice(0, 3).join(', ');
    return topics.charAt(0).toUpperCase() + topics.slice(1);
  }

  // Fallback: derive from first user message
  const msgs = conversation.messages ?? [];
  const firstUserMsg = msgs.find(m => m.role === 'user');
  const derived = firstUserMsg ? deriveConversationTitleFromText(firstUserMsg.content) : null;
  if (derived) return derived;

  return 'New chat';
}

// ── External selectors (proper Zustand subscription tracking) ─────────────

export const selectActiveConversation = (s: CompanionChatState): Conversation | null =>
  (s.conversations ?? []).find(c => c.id === s.activeConversationId) ?? null;

const EMPTY_MESSAGES: CompanionMessage[] = [];
export const selectActiveMessages = (s: CompanionChatState): CompanionMessage[] =>
  (s.conversations ?? []).find(c => c.id === s.activeConversationId)?.messages ?? EMPTY_MESSAGES;

export const selectArchivedConversations = (s: CompanionChatState): Conversation[] =>
  (s.conversations ?? []).filter(c => c.archived && (c.messages ?? []).length > 0);

// ── Store ──────────────────────────────────────────────────────────────────

interface CompanionChatState {
  conversations: Conversation[];
  activeConversationId: string | null;

  // Actions
  addMessage: (msg: CompanionMessage) => void;
  updateMessage: (id: string, updates: Partial<CompanionMessage>, conversationId?: string) => void;
  setFeedback: (id: string, feedback: 'positive' | 'negative', reason?: string) => void;
  startNewConversation: () => void;
  archiveActiveConversation: (title?: string, topicTags?: string[]) => void;
  checkAndArchiveStale: () => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;
  updateConversation: (id: string, updates: Partial<Pick<Conversation, 'title' | 'topicTags' | 'pinned'>>) => void;
  setActiveConversation: (id: string) => void;
}

// WR-23: coalesces persist writes so the ~30/sec token flushes during SSE
// streaming serialize the store once per debounce window instead of running a
// full partialize + JSON.stringify + sync MMKV write on every set(). Flushed
// when the app backgrounds (listener below), matching store.ts.
const companionPersistStorage = createDebouncedJSONStorage<CompanionChatState>(mmkvStorage);

export const useCompanionChatStore = create<CompanionChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,

      addMessage: (msg) =>
        set((s) => {
          const now = new Date().toISOString();
          const timestampedMsg = { ...msg, updatedAt: now };

          // Auto-create conversation if none active
          if (!s.activeConversationId) {
            const seededTitle = timestampedMsg.role === 'user'
              ? deriveConversationTitleFromText(timestampedMsg.content)
              : null;
            const newConv: Conversation = {
              id: makeId(),
              messages: [timestampedMsg],
              createdAt: Date.now(),
              lastMessageAt: Date.now(),
              title: seededTitle,
              topicTags: [],
              archived: false,
              updatedAt: now,
            };
            enqueuePersonalDataSyncChange('companion_conversations', newConv.id, companionConversationSyncData(newConv), now);
            enqueuePersonalDataSyncChange('companion_messages', timestampedMsg.id, companionMessageSyncData(timestampedMsg, newConv.id), now);
            return {
              conversations: [...s.conversations, newConv],
              activeConversationId: newConv.id,
            };
          }

          return {
            conversations: s.conversations.map(c => {
              if (c.id !== s.activeConversationId) return c;
              const updated = [...(c.messages ?? []), timestampedMsg];
              const nextTitle = c.title ?? (timestampedMsg.role === 'user'
                ? deriveConversationTitleFromText(timestampedMsg.content)
                : null);
              const nextConv: Conversation = {
                ...c,
                messages: updated.length > MAX_STORED_MESSAGES
                  ? updated.slice(-MAX_STORED_MESSAGES)
                  : updated,
                lastMessageAt: Date.now(),
                title: nextTitle,
                updatedAt: now,
              };
              enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
              enqueuePersonalDataSyncChange('companion_messages', timestampedMsg.id, companionMessageSyncData(timestampedMsg, nextConv.id), now);
              return nextConv;
            }),
          };
        }),

      updateMessage: (id, updates, conversationId) =>
        set((s) => {
          const now = new Date().toISOString();
          // Scope to one conversation for performance. WR-09: streams pass
          // their own conversationId so a mid-stream switch can't orphan
          // tokens; UI callers omit it and keep active-conversation behavior.
          const activeId = conversationId ?? s.activeConversationId;
          return {
            conversations: s.conversations.map(c => {
              if (c.id !== activeId) return c;
              let changedMessage: CompanionMessage | null = null;
              const nextConv: Conversation = {
                ...c,
                updatedAt: now,
                messages: (c.messages ?? []).map(m => {
                  if (m.id !== id) return m;
                  changedMessage = { ...m, ...updates, updatedAt: now };
                  return changedMessage;
                }),
              };
              const changedSyncMessage = changedMessage as CompanionMessage | null;
              // Content-only streaming updates land ~30×/sec — skip the outbox
              // round-trips while the message is still streaming; the full
              // content is enqueued once when status flips to complete/error.
              const isStreamingContentUpdate = changedSyncMessage?.status === 'streaming';
              if (!isStreamingContentUpdate) {
                enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
                if (changedSyncMessage) enqueuePersonalDataSyncChange('companion_messages', changedSyncMessage.id, companionMessageSyncData(changedSyncMessage, nextConv.id), now);
              }
              return nextConv;
            }),
          };
        }),

      setFeedback: (id, feedback, reason) =>
        set((s) => {
          const now = new Date().toISOString();
          const activeId = s.activeConversationId;

          // Fire backend log (async, best-effort)
          const activeConv = s.conversations.find(c => c.id === activeId);
          const activeConvMessages = activeConv?.messages ?? [];
          const msg = activeConvMessages.find(m => m.id === id);
          if (msg) {
            const prevMsg = activeConvMessages
              .filter(m => m.role === 'user')
              .slice(-1)[0];

            getAuthHeaders().then(headers => {
              fetch(`${PRIMARY_BACKEND_URL}/api/companion-feedback`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  messageId: id,
                  feedback,
                  messageContent: msg.content?.slice(0, 5000),
                  userMessage: prevMsg?.content?.slice(0, 5000),
                  model: 'claude-haiku-4-5-20251001',
                  companionName: null,
                  contextSummary: activeConv?.topicTags?.join(', '),
                  reason: feedback === 'negative' ? reason ?? null : null,
                }),
              }).catch(() => { /* silent */ });
            });
          }

          return {
            conversations: s.conversations.map(c => {
              if (c.id !== activeId) return c;
              let changedMessage: CompanionMessage | null = null;
              const nextConv: Conversation = {
                ...c,
                updatedAt: now,
                messages: (c.messages ?? []).map(m => {
                  if (m.id !== id) return m;
                  changedMessage = {
                    ...m,
                    feedback,
                    // A bare thumbs-down keeps any earlier reason; a chip sets it; thumbs-up clears it.
                    feedbackReason: feedback === 'negative' ? reason ?? m.feedbackReason ?? null : null,
                    updatedAt: now,
                  };
                  return changedMessage;
                }),
              };
              enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
              const changedSyncMessage = changedMessage as CompanionMessage | null;
              if (changedSyncMessage) enqueuePersonalDataSyncChange('companion_messages', changedSyncMessage.id, companionMessageSyncData(changedSyncMessage, nextConv.id), now);
              return nextConv;
            }),
          };
        }),

      startNewConversation: () =>
        set((s) => {
          const now = new Date().toISOString();
          const active = s.conversations.find(c => c.id === s.activeConversationId);
          let conversations = s.conversations;

          // Archive current if it has messages
          const activeMessages = active?.messages ?? [];
          if (active && activeMessages.length > 0) {
            const tags: string[] = []; // Topic tags now handled server-side
            conversations = conversations.map(c => {
              if (c.id !== active.id) return c;
              const nextConv = { ...c, archived: true, topicTags: tags, title: generateTitle({ ...c, topicTags: tags }), updatedAt: now };
              enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
              return nextConv;
            });
          } else if (active && activeMessages.length === 0) {
            // Remove empty conversation instead of archiving
            conversations = conversations.filter(c => c.id !== active.id);
          }

          // Prune old conversations beyond cap
          const archived = conversations.filter(c => c.archived);
          if (archived.length > MAX_CONVERSATIONS) {
            const toRemove = archived
              .sort((a, b) => a.lastMessageAt - b.lastMessageAt)
              .slice(0, archived.length - MAX_CONVERSATIONS)
              .map(c => c.id);
            conversations = conversations.filter(c => !toRemove.includes(c.id));
          }

          const newConv: Conversation = {
            id: makeId(),
            messages: [],
            createdAt: Date.now(),
            lastMessageAt: Date.now(),
            title: null,
            topicTags: [],
            archived: false,
            updatedAt: now,
          };

          return {
            conversations: [...conversations, newConv],
            activeConversationId: newConv.id,
          };
        }),

      archiveActiveConversation: (title, topicTags) =>
        set((s) => {
          const now = new Date().toISOString();
          return {
            conversations: s.conversations.map(c => {
              if (c.id !== s.activeConversationId) return c;
              const nextConv = {
                ...c,
                archived: true,
                title: title ?? generateTitle(c),
                topicTags: topicTags ?? c.topicTags,
                updatedAt: now,
              };
              enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
              return nextConv;
            }),
            activeConversationId: null,
          };
        }),

      checkAndArchiveStale: () => {
        const active = selectActiveConversation(get());
        if (!active || (active.messages ?? []).length === 0) return;

        const elapsed = Date.now() - active.lastMessageAt;
        if (elapsed > INACTIVITY_THRESHOLD_MS) {
          // Archive stale and create new
          get().startNewConversation();
        }
      },

      deleteConversation: (id) =>
        set((s) => {
          const now = new Date().toISOString();
          const existing = s.conversations.find(c => c.id === id);
          if (existing) {
            enqueuePersonalDataSyncChange('companion_conversations', id, companionConversationSyncData(existing), now, true);
            (existing.messages ?? []).forEach((message) => {
              enqueuePersonalDataSyncChange('companion_messages', message.id, companionMessageSyncData(message, id), now, true);
            });
          }
          return {
            conversations: s.conversations.filter(c => c.id !== id),
            activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
          };
        }),

      clearAllConversations: () =>
        set((s) => {
          const now = new Date().toISOString();
          s.conversations.forEach((conversation) => {
            enqueuePersonalDataSyncChange('companion_conversations', conversation.id, companionConversationSyncData(conversation), now, true);
            (conversation.messages ?? []).forEach((message) => {
              enqueuePersonalDataSyncChange('companion_messages', message.id, companionMessageSyncData(message, conversation.id), now, true);
            });
          });
          return { conversations: [], activeConversationId: null };
        }),

      updateConversation: (id, updates) =>
        set((s) => {
          const now = new Date().toISOString();
          return {
            conversations: s.conversations.map(c => {
              if (c.id !== id) return c;
              const nextConv = { ...c, ...updates, updatedAt: now };
              enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
              return nextConv;
            }),
          };
        }),

      setActiveConversation: (id) =>
        set((s) => {
          const now = new Date().toISOString();
          const target = s.conversations.find(c => c.id === id);
          if (!target) return s;

          // Archive current active conversation if it has messages
          const active = s.conversations.find(c => c.id === s.activeConversationId);
          let conversations = s.conversations;

          if (active && active.id !== id && (active.messages ?? []).length > 0) {
            conversations = conversations.map(c => {
              if (c.id !== active.id) return c;
              const nextConv = { ...c, archived: true, title: c.title ?? generateTitle(c), updatedAt: now };
              enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
              return nextConv;
            });
          } else if (active && active.id !== id && (active.messages ?? []).length === 0) {
            conversations = conversations.filter(c => c.id !== active.id);
          }

          // Un-archive the target and set it active
          conversations = conversations.map(c => {
            if (c.id !== id) return c;
            const nextConv = { ...c, archived: false, updatedAt: now };
            enqueuePersonalDataSyncChange('companion_conversations', nextConv.id, companionConversationSyncData(nextConv), now);
            return nextConv;
          });

          return {
            conversations,
            activeConversationId: id,
          };
        }),
    }),
    {
      name: 'unfold-companion-chat',
      storage: companionPersistStorage,
      version: 5, // v5: Add deepLinks to CompanionMessage
      // Skip persisting streaming message content to avoid expensive serialization during SSE
      partialize: (state) => ({
        ...state,
        conversations: (state.conversations ?? []).map(c => ({
          ...c,
          messages: (c.messages ?? []).map(m =>
            m.status === 'streaming'
              ? { ...m, content: '' }
              : m
          ),
        })),
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<CompanionChatState>;

        if (version === 1) {
          // v1 → v2: wrap flat messages[] into a single Conversation
          const persisted = persistedState as any;
          const oldMessages = persisted.messages || [];
          const oldConvId = persisted.conversationId || makeId();
          const conversation: Conversation = {
            id: oldConvId,
            messages: oldMessages,
            createdAt: oldMessages[0]?.timestamp ?? Date.now(),
            lastMessageAt: oldMessages[oldMessages.length - 1]?.timestamp ?? Date.now(),
            title: null,
            topicTags: [],
            archived: false,
          };
          (state as any).conversations = oldMessages.length > 0 ? [conversation] : [];
          (state as any).activeConversationId = oldMessages.length > 0 ? oldConvId : null;
        }

        // v2 → v3: Backfill updatedAt for cloud sync
        if (version < 3) {
          const conversations = (state as any).conversations ?? [];
          for (const conv of conversations) {
            if (!conv) continue;
            if (!conv.updatedAt) conv.updatedAt = new Date(conv.lastMessageAt || Date.now()).toISOString();
            for (const msg of conv.messages ?? []) {
              if (!msg) continue;
              if (!msg.updatedAt) msg.updatedAt = new Date(msg.timestamp || Date.now()).toISOString();
            }
          }
        }

        // v3 → v4: Rename summary to title
        // v4 → v5: Add deepLinks (optional field, no data migration needed)
        if (version < 4) {
          const conversations = (state as any).conversations ?? [];
          for (const conv of conversations) {
            if (!conv) continue;
            if (conv.summary !== undefined && conv.title === undefined) {
              conv.title = conv.summary;
              delete conv.summary;
            }
          }
        }

        return state as CompanionChatState;
      },
      merge: (persistedState, currentState) => {
        const merged: CompanionChatState = {
          ...currentState,
          ...(persistedState as Partial<CompanionChatState>),
        };
        // Rehydrate sweep: partialize blanks streaming content, so a message
        // persisted mid-stream comes back as a permanently blank 'streaming'
        // row with no retry affordance. Reconcile to 'error' (retryable).
        const conversations = merged.conversations ?? [];
        if (conversations.some(c => (c.messages ?? []).some(m => m.status === 'streaming'))) {
          merged.conversations = conversations.map(c => {
            const messages = c.messages ?? [];
            if (!messages.some(m => m.status === 'streaming')) return c;
            return {
              ...c,
              messages: messages.map(m =>
                m.status === 'streaming' ? { ...m, status: 'error' as const } : m
              ),
            };
          });
        }
        return merged;
      },
    }
  )
);

// WR-23: a coalesced persist write can be pending for up to its debounce
// window — land it before iOS suspends the app. Covers the app switcher on
// the way to a force-kill; only a hard crash can lose the window.
AppState.addEventListener('change', (status) => {
  if (shouldFlushAutosaveOnAppState(status)) {
    companionPersistStorage.flushPendingWrites();
  }
});

/** Test/maintenance hook: force any pending coalesced persist write to disk. */
export const flushCompanionChatPersist = () => companionPersistStorage.flushPendingWrites();
