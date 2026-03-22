/**
 * Companion Chat Store
 * Persists conversation messages via Zustand + MMKV.
 * Separate from the main store to keep concerns isolated.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkv-storage';

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

// ── Store ──────────────────────────────────────────────────────────────────

interface CompanionChatState {
  messages: CompanionMessage[];
  conversationId: string;

  addMessage: (msg: CompanionMessage) => void;
  updateMessage: (id: string, updates: Partial<CompanionMessage>) => void;
  setFeedback: (id: string, feedback: 'positive' | 'negative') => void;
  clearConversation: () => void;
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Cap stored messages to prevent unbounded growth in MMKV
const MAX_STORED_MESSAGES = 200;

export const useCompanionChatStore = create<CompanionChatState>()(
  persist(
    (set) => ({
      messages: [],
      conversationId: makeId(),

      addMessage: (msg) =>
        set((s) => {
          const updated = [...s.messages, msg];
          // Trim oldest messages when exceeding cap
          return { messages: updated.length > MAX_STORED_MESSAGES
            ? updated.slice(-MAX_STORED_MESSAGES)
            : updated };
        }),

      updateMessage: (id, updates) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),

      setFeedback: (id, feedback) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, feedback } : m
          ),
        })),

      clearConversation: () =>
        set({ messages: [], conversationId: makeId() }),
    }),
    {
      name: 'unfold-companion-chat',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
    }
  )
);
