/**
 * Companion Chat Store
 * Persists conversation messages via Zustand + MMKV.
 * Separate from the main store to keep concerns isolated.
 *
 * v2: Multi-conversation model — conversations[], auto-archive, summaries.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkv-storage';

import { getTopicTags } from './companion-memory';

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
}

export interface Conversation {
  id: string;
  messages: CompanionMessage[];
  createdAt: number;
  lastMessageAt: number;
  summary: string | null;
  topicTags: string[];
  archived: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Cap stored messages per conversation to prevent unbounded growth in MMKV
const MAX_STORED_MESSAGES = 200;
const MAX_CONVERSATIONS = 50;
const INACTIVITY_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Summary helper ────────────────────────────────────────────────────────

function generateSummary(conversation: Conversation): string {
  // Primary: use topic tags if available
  if (conversation.topicTags.length > 0) {
    const topics = conversation.topicTags.slice(0, 3).join(', ');
    return topics.charAt(0).toUpperCase() + topics.slice(1);
  }

  // Fallback: first user message, truncated
  const firstUserMsg = conversation.messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const text = firstUserMsg.content.slice(0, 80);
    return text.length < firstUserMsg.content.length ? `${text}...` : text;
  }

  return 'Conversation';
}

// ── External selectors (proper Zustand subscription tracking) ─────────────

export const selectActiveConversation = (s: CompanionChatState): Conversation | null =>
  s.conversations.find(c => c.id === s.activeConversationId) ?? null;

const EMPTY_MESSAGES: CompanionMessage[] = [];
export const selectActiveMessages = (s: CompanionChatState): CompanionMessage[] =>
  s.conversations.find(c => c.id === s.activeConversationId)?.messages ?? EMPTY_MESSAGES;

export const selectArchivedConversations = (s: CompanionChatState): Conversation[] =>
  s.conversations.filter(c => c.archived && c.messages.length > 0);

// ── Store ──────────────────────────────────────────────────────────────────

interface CompanionChatState {
  conversations: Conversation[];
  activeConversationId: string | null;

  // Actions
  addMessage: (msg: CompanionMessage) => void;
  updateMessage: (id: string, updates: Partial<CompanionMessage>) => void;
  setFeedback: (id: string, feedback: 'positive' | 'negative') => void;
  startNewConversation: () => void;
  archiveActiveConversation: (summary?: string, topicTags?: string[]) => void;
  checkAndArchiveStale: () => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;
}

export const useCompanionChatStore = create<CompanionChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,

      addMessage: (msg) =>
        set((s) => {
          // Auto-create conversation if none active
          if (!s.activeConversationId) {
            const newConv: Conversation = {
              id: makeId(),
              messages: [msg],
              createdAt: Date.now(),
              lastMessageAt: Date.now(),
              summary: null,
              topicTags: [],
              archived: false,
            };
            return {
              conversations: [...s.conversations, newConv],
              activeConversationId: newConv.id,
            };
          }

          return {
            conversations: s.conversations.map(c => {
              if (c.id !== s.activeConversationId) return c;
              const updated = [...c.messages, msg];
              return {
                ...c,
                messages: updated.length > MAX_STORED_MESSAGES
                  ? updated.slice(-MAX_STORED_MESSAGES)
                  : updated,
                lastMessageAt: Date.now(),
              };
            }),
          };
        }),

      updateMessage: (id, updates) =>
        set((s) => {
          // Scope to active conversation for performance
          const activeId = s.activeConversationId;
          return {
            conversations: s.conversations.map(c => {
              if (c.id !== activeId) return c;
              return {
                ...c,
                messages: c.messages.map(m =>
                  m.id === id ? { ...m, ...updates } : m
                ),
              };
            }),
          };
        }),

      setFeedback: (id, feedback) =>
        set((s) => {
          const activeId = s.activeConversationId;
          return {
            conversations: s.conversations.map(c => {
              if (c.id !== activeId) return c;
              return {
                ...c,
                messages: c.messages.map(m =>
                  m.id === id ? { ...m, feedback } : m
                ),
              };
            }),
          };
        }),

      startNewConversation: () =>
        set((s) => {
          const active = s.conversations.find(c => c.id === s.activeConversationId);
          let conversations = s.conversations;

          // Archive current if it has messages
          if (active && active.messages.length > 0) {
            const tags = getTopicTags();
            conversations = conversations.map(c =>
              c.id === active.id
                ? { ...c, archived: true, topicTags: tags, summary: generateSummary({ ...c, topicTags: tags }) }
                : c
            );
          } else if (active && active.messages.length === 0) {
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
            summary: null,
            topicTags: [],
            archived: false,
          };

          return {
            conversations: [...conversations, newConv],
            activeConversationId: newConv.id,
          };
        }),

      archiveActiveConversation: (summary, topicTags) =>
        set((s) => ({
          conversations: s.conversations.map(c =>
            c.id === s.activeConversationId
              ? {
                  ...c,
                  archived: true,
                  summary: summary ?? generateSummary(c),
                  topicTags: topicTags ?? c.topicTags,
                }
              : c
          ),
          activeConversationId: null,
        })),

      checkAndArchiveStale: () => {
        const active = selectActiveConversation(get());
        if (!active || active.messages.length === 0) return;

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
    }),
    {
      name: 'unfold-companion-chat',
      storage: createJSONStorage(() => mmkvStorage),
      version: 2,
      // Skip persisting streaming message content to avoid expensive serialization during SSE
      partialize: (state) => ({
        ...state,
        conversations: state.conversations.map(c => ({
          ...c,
          messages: c.messages.map(m =>
            m.status === 'streaming'
              ? { ...m, content: '' }
              : m
          ),
        })),
      }),
      migrate: (persisted: any, version: number) => {
        if (version === 1) {
          // v1 → v2: wrap flat messages[] into a single Conversation
          const oldMessages = persisted.messages || [];
          const oldConvId = persisted.conversationId || makeId();
          const conversation: Conversation = {
            id: oldConvId,
            messages: oldMessages,
            createdAt: oldMessages[0]?.timestamp ?? Date.now(),
            lastMessageAt: oldMessages[oldMessages.length - 1]?.timestamp ?? Date.now(),
            summary: null,
            topicTags: [],
            archived: false,
          };
          return {
            conversations: oldMessages.length > 0 ? [conversation] : [],
            activeConversationId: oldMessages.length > 0 ? oldConvId : null,
          };
        }
        return persisted as any;
      },
    }
  )
);
