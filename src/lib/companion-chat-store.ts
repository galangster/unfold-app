/**
 * Companion Chat Store
 * Persists conversation messages via Zustand + MMKV.
 * Separate from the main store to keep concerns isolated.
 *
 * v2: Multi-conversation model — conversations[], auto-archive, summaries.
 * v3: Add updatedAt for cloud sync.
 * v4: Rename summary to title, add updateConversation/setActiveConversation.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkv-storage';

import { getTopicTags } from './companion-memory';
import { getAuthHeaders, PRIMARY_BACKEND_URL } from '@/lib/api-config';

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
  updatedAt?: string; // ISO timestamp for sync
}

export interface Conversation {
  id: string;
  messages: CompanionMessage[];
  createdAt: number;
  lastMessageAt: number;
  title: string | null;
  topicTags: string[];
  archived: boolean;
  updatedAt?: string; // ISO timestamp for sync
}

// ── Constants ─────────────────────────────────────────────────────────────

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Cap stored messages per conversation to prevent unbounded growth in MMKV
const MAX_STORED_MESSAGES = 200;
const MAX_CONVERSATIONS = 50;
const INACTIVITY_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Title helper ──────────────────────────────────────────────────────────

export function generateTitle(conversation: Conversation): string {
  // Primary: use topic tags if available
  const tags = conversation.topicTags ?? [];
  if (tags.length > 0) {
    const topics = tags.slice(0, 3).join(', ');
    return topics.charAt(0).toUpperCase() + topics.slice(1);
  }

  // Fallback: first user message, truncated
  const msgs = conversation.messages ?? [];
  const firstUserMsg = msgs.find(m => m.role === 'user');
  if (firstUserMsg) {
    const text = firstUserMsg.content.slice(0, 80);
    return text.length < firstUserMsg.content.length ? `${text}...` : text;
  }

  return 'Conversation';
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
  updateMessage: (id: string, updates: Partial<CompanionMessage>) => void;
  setFeedback: (id: string, feedback: 'positive' | 'negative') => void;
  startNewConversation: () => void;
  archiveActiveConversation: (title?: string, topicTags?: string[]) => void;
  checkAndArchiveStale: () => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;
  updateConversation: (id: string, updates: Partial<Pick<Conversation, 'title' | 'topicTags'>>) => void;
  setActiveConversation: (id: string) => void;
}

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
            const newConv: Conversation = {
              id: makeId(),
              messages: [timestampedMsg],
              createdAt: Date.now(),
              lastMessageAt: Date.now(),
              title: null,
              topicTags: [],
              archived: false,
              updatedAt: now,
            };
            return {
              conversations: [...s.conversations, newConv],
              activeConversationId: newConv.id,
            };
          }

          return {
            conversations: s.conversations.map(c => {
              if (c.id !== s.activeConversationId) return c;
              const updated = [...(c.messages ?? []), timestampedMsg];
              return {
                ...c,
                messages: updated.length > MAX_STORED_MESSAGES
                  ? updated.slice(-MAX_STORED_MESSAGES)
                  : updated,
                lastMessageAt: Date.now(),
                updatedAt: now,
              };
            }),
          };
        }),

      updateMessage: (id, updates) =>
        set((s) => {
          const now = new Date().toISOString();
          // Scope to active conversation for performance
          const activeId = s.activeConversationId;
          return {
            conversations: s.conversations.map(c => {
              if (c.id !== activeId) return c;
              return {
                ...c,
                updatedAt: now,
                messages: (c.messages ?? []).map(m =>
                  m.id === id ? { ...m, ...updates, updatedAt: now } : m
                ),
              };
            }),
          };
        }),

      setFeedback: (id, feedback) =>
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
                }),
              }).catch(() => { /* silent */ });
            });
          }

          return {
            conversations: s.conversations.map(c => {
              if (c.id !== activeId) return c;
              return {
                ...c,
                updatedAt: now,
                messages: (c.messages ?? []).map(m =>
                  m.id === id ? { ...m, feedback, updatedAt: now } : m
                ),
              };
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
            const tags = getTopicTags();
            conversations = conversations.map(c =>
              c.id === active.id
                ? { ...c, archived: true, topicTags: tags, title: generateTitle({ ...c, topicTags: tags }), updatedAt: now }
                : c
            );
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
        set((s) => ({
          conversations: s.conversations.map(c =>
            c.id === s.activeConversationId
              ? {
                  ...c,
                  archived: true,
                  title: title ?? generateTitle(c),
                  topicTags: topicTags ?? c.topicTags,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
          activeConversationId: null,
        })),

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
        set((s) => ({
          conversations: s.conversations.filter(c => c.id !== id),
          activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
        })),

      clearAllConversations: () =>
        set({ conversations: [], activeConversationId: null }),

      updateConversation: (id, updates) =>
        set((s) => ({
          conversations: s.conversations.map(c =>
            c.id === id
              ? { ...c, ...updates, updatedAt: new Date().toISOString() }
              : c
          ),
        })),

      setActiveConversation: (id) =>
        set((s) => {
          const now = new Date().toISOString();
          const target = s.conversations.find(c => c.id === id);
          if (!target) return s;

          // Archive current active conversation if it has messages
          const active = s.conversations.find(c => c.id === s.activeConversationId);
          let conversations = s.conversations;

          if (active && active.id !== id && (active.messages ?? []).length > 0) {
            conversations = conversations.map(c =>
              c.id === active.id
                ? { ...c, archived: true, title: c.title ?? generateTitle(c), updatedAt: now }
                : c
            );
          } else if (active && active.id !== id && (active.messages ?? []).length === 0) {
            conversations = conversations.filter(c => c.id !== active.id);
          }

          // Un-archive the target and set it active
          conversations = conversations.map(c =>
            c.id === id ? { ...c, archived: false, updatedAt: now } : c
          );

          return {
            conversations,
            activeConversationId: id,
          };
        }),
    }),
    {
      name: 'unfold-companion-chat',
      storage: createJSONStorage(() => mmkvStorage),
      version: 4, // v4: Rename summary to title, add updateConversation/setActiveConversation
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
    }
  )
);
