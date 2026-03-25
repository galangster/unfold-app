# Companion Memory & Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the companion selective two-tier memory (24h chat sessions + 30-day long-term memory) and a conversation history sheet so users can browse past conversations.

**Architecture:** Refactor the flat `messages[]` array in `companion-chat-store.ts` into a multi-conversation model with `Conversation[]`. Add auto-archival on 24h inactivity, long-term memory pruning with `addedAt` timestamps, a history sheet triggered from the companion header, and a "New Conversation" button. Backend is stateless — no server changes needed.

**Tech Stack:** Zustand + MMKV (existing), React Native FlatList, existing Sheet.tsx component, phosphor-react-native icons

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/lib/companion-chat-store.ts` | Multi-conversation Zustand store with archive/prune actions | Modify |
| `src/lib/companion-memory.ts` | Add `addedAt` timestamps to topics/verses, 30-day pruning | Modify |
| `src/lib/use-companion-chat.ts` | Work with active conversation, auto-archive on mount | Modify |
| `src/components/companion/ConversationHistorySheet.tsx` | History sheet UI with grouped list | Create |
| `src/components/companion/ArchivedConversationView.tsx` | Read-only past conversation viewer | Create |
| `src/app/(tabs)/(ask)/index.tsx` | Header icons (New + History), wire up sheets | Modify |

---

### Task 1: Refactor companion-chat-store for multi-conversation model

**Files:**
- Modify: `src/lib/companion-chat-store.ts`

This is the foundation — everything else depends on this store shape change.

- [ ] **Step 1: Add Conversation interface and update store types**

Add the `Conversation` interface above `CompanionChatState`. Update state to use `conversations[]` + `activeConversationId` instead of flat `messages[]`. Keep backward-compatible selectors. Also add `import { getTopicTags } from './companion-memory';` at the top of the file (used by `startNewConversation` to populate topic tags at archive time).

```typescript
// Add above CompanionChatState:
export interface Conversation {
  id: string;
  messages: CompanionMessage[];
  createdAt: number;
  lastMessageAt: number;
  summary: string | null;
  topicTags: string[];
  archived: boolean;
}

const MAX_CONVERSATIONS = 50;
const INACTIVITY_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── External selectors (proper Zustand subscription tracking) ─────────
export const selectActiveConversation = (s: CompanionChatState): Conversation | null =>
  s.conversations.find(c => c.id === s.activeConversationId) ?? null;

export const selectActiveMessages = (s: CompanionChatState): CompanionMessage[] =>
  s.conversations.find(c => c.id === s.activeConversationId)?.messages ?? [];

export const selectArchivedConversations = (s: CompanionChatState): Conversation[] =>
  s.conversations.filter(c => c.archived && c.messages.length > 0);

interface CompanionChatState {
  conversations: Conversation[];
  activeConversationId: string | null;

  // Actions:
  addMessage: (msg: CompanionMessage) => void;
  updateMessage: (id: string, updates: Partial<CompanionMessage>) => void;
  setFeedback: (id: string, feedback: 'positive' | 'negative') => void;
  startNewConversation: () => void;
  archiveActiveConversation: (summary?: string, topicTags?: string[]) => void;
  checkAndArchiveStale: () => void; // Auto-archive if >24h inactive
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;
}
```

- [ ] **Step 2: Implement store actions**

Replace the existing `create<CompanionChatState>()` body with multi-conversation logic. Key behaviors:

- `addMessage`: finds active conversation, appends message, updates `lastMessageAt`, trims to 200 messages per conversation
- `startNewConversation`: creates new `Conversation` with `makeId()`, sets as active, does NOT archive current if empty (0 messages)
- `archiveActiveConversation`: sets `archived: true`, generates summary, prunes beyond `MAX_CONVERSATIONS`
- `checkAndArchiveStale`: checks `lastMessageAt` against `INACTIVITY_THRESHOLD_MS`, archives if stale, creates new active conversation
- `getActiveMessages`: returns `conversations.find(c => c.id === activeConversationId)?.messages ?? []`

```typescript
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
            // getTopicTags imported at top of file from ./companion-memory
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
        })),

      clearAllConversations: () =>
        set({ conversations: [], activeConversationId: null }),
    }),
    {
      name: 'unfold-companion-chat',
      storage: createJSONStorage(() => mmkvStorage),
      version: 2,
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
```

- [ ] **Step 3: Add summary generation helper**

Add above the store definition. Pure function, no AI call.

```typescript
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
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v showcase.spec`
Expected: No errors from companion-chat-store.ts

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion-chat-store.ts
git commit -m "refactor: multi-conversation model for companion chat store

Conversation[] replaces flat messages[]. Auto-archive on 24h inactivity,
50-conversation cap, summary generation, v1→v2 migration."
```

---

### Task 2: Add timestamps to companion-memory and 30-day pruning

**Files:**
- Modify: `src/lib/companion-memory.ts`

- [ ] **Step 1: Update types to include `addedAt` on topics and verses**

Change `CompanionMemory` interface — topics and verses become `{ text: string; addedAt: number }[]` instead of `string[]`. Keep backward compat with the existing `string` format in prayerRequests (already supported).

```typescript
interface TimestampedEntry {
  text: string;
  addedAt: number;
}

interface CompanionMemory {
  topics: (string | TimestampedEntry)[];       // supports legacy string format
  versesMentioned: (string | TimestampedEntry)[];  // supports legacy string format
  prayerRequests: (string | PrayerRequest)[];  // already supports legacy
  lastUpdated: number;
}
```

- [ ] **Step 2: Add helper to normalize entries**

```typescript
function normalizeEntry(entry: string | TimestampedEntry): TimestampedEntry {
  if (typeof entry === 'string') return { text: entry, addedAt: Date.now() };
  return entry;
}

function entryText(entry: string | TimestampedEntry): string {
  return typeof entry === 'string' ? entry : entry.text;
}
```

- [ ] **Step 3: Add pruneExpiredMemory function**

```typescript
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function pruneExpiredMemory(): void {
  const memory = getCompanionMemory();
  if (!memory) return;

  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const pruned: CompanionMemory = {
    topics: memory.topics
      .map(normalizeEntry)
      .filter(t => t.addedAt > cutoff),
    versesMentioned: memory.versesMentioned
      .map(normalizeEntry)
      .filter(v => v.addedAt > cutoff),
    prayerRequests: memory.prayerRequests
      .map(p => typeof p === 'string' ? { text: p, addedAt: Date.now() } : p)
      .filter(p => p.addedAt > cutoff || !p.resolvedAt),  // Keep unresolved prayers
    lastUpdated: Date.now(),
  };

  mmkvStorage.setItem(MEMORY_KEY, JSON.stringify(pruned));
}
```

- [ ] **Step 4: Update `updateCompanionMemory` to use `TimestampedEntry`**

In the existing function, change how topics and verses are stored:

- Topics: instead of `newTopics.push(keyword)`, push `{ text: keyword, addedAt: Date.now() }`
- Verses: instead of `newVerses.push(ref)`, push `{ text: ref, addedAt: Date.now() }`
- Comparison logic: use `entryText()` for deduplication checks

- [ ] **Step 5: Export `getTopicTags` helper for summary generation**

```typescript
/** Returns plain string array of current topics (for conversation summaries). */
export function getTopicTags(): string[] {
  const memory = getCompanionMemory();
  if (!memory) return [];
  return memory.topics.map(entryText);
}
```

- [ ] **Step 6: Update `buildCompanionContext` in use-companion-chat.ts**

The context builder reads `memory.topics` and `memory.versesMentioned` as string arrays. Now they might be `TimestampedEntry[]`. Update the mapping:

```typescript
// In buildCompanionContext:
conversationMemory: memory
  ? {
      topics: memory.topics.map(t => typeof t === 'string' ? t : t.text),
      versesMentioned: memory.versesMentioned.map(v => typeof v === 'string' ? v : v.text),
      prayerRequests: memory.prayerRequests.map(p => typeof p === 'string' ? p : p.text),
    }
  : undefined,
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v showcase.spec`

- [ ] **Step 8: Commit**

```bash
git add src/lib/companion-memory.ts src/lib/use-companion-chat.ts
git commit -m "feat: add timestamps and 30-day pruning to companion memory

Topics and verses now store addedAt timestamps. pruneExpiredMemory()
removes entries older than 30 days. Backward compatible with legacy
string format."
```

---

### Task 3: Update use-companion-chat hook for multi-conversation model

**Files:**
- Modify: `src/lib/use-companion-chat.ts`

- [ ] **Step 1: Update store selectors to use new shape**

Replace direct `messages` selector with active conversation messages. Add `checkAndArchiveStale` call on mount.

```typescript
import { selectActiveMessages } from './companion-chat-store';

export function useCompanionChat() {
  // Replace: const messages = useCompanionChatStore((s) => s.messages);
  const messages = useCompanionChatStore(selectActiveMessages);
  const addMessage = useCompanionChatStore((s) => s.addMessage);
  const updateMessage = useCompanionChatStore((s) => s.updateMessage);
  const startNewConversation = useCompanionChatStore((s) => s.startNewConversation);
  const checkAndArchiveStale = useCompanionChatStore((s) => s.checkAndArchiveStale);
  const activeConversationId = useCompanionChatStore((s) => s.activeConversationId);

  // Remove: const conversationId = useCompanionChatStore((s) => s.conversationId);
  // Remove: const clearConversation = useCompanionChatStore((s) => s.clearConversation);
```

- [ ] **Step 2: Add auto-archive check on mount**

```typescript
import { useEffect } from 'react';
// Add to existing imports: useEffect

// Inside useCompanionChat, before sendMessage:
useEffect(() => {
  checkAndArchiveStale();
}, [checkAndArchiveStale]);
```

- [ ] **Step 3: Update sendMessage to use activeConversationId**

Replace `conversationId` with `activeConversationId` in the SSE request body. Also ensure a conversation exists before sending:

```typescript
// At the start of sendMessage callback, after the early return:
if (!activeConversationId) {
  // Auto-create if somehow missing
  useCompanionChatStore.getState().startNewConversation();
}

// In the SSE body and elsewhere, replace:
// conversationId → useCompanionChatStore.getState().activeConversationId
```

- [ ] **Step 4: Update memory extraction to use active conversation messages**

Replace all `useCompanionChatStore.getState().messages` with `selectActiveMessages(useCompanionChatStore.getState())` in `sendMessage`:

- The context-building call (reads last 10 messages for AI context)
- The memory update call after send (reads all messages for topic/verse extraction)

Import at top: `import { selectActiveMessages } from './companion-chat-store';`

No need to manually update `topicTags` on the active conversation — this is already handled in Task 1's `startNewConversation`, which calls `getTopicTags()` at archive time to populate topic tags before generating the summary.

- [ ] **Step 5: Update return value**

```typescript
return {
  messages,
  isStreaming,
  streamingText,
  suggestions,
  error,
  sendMessage,
  stopGeneration,
  startNewConversation, // replaces clearConversation
};
```

- [ ] **Step 6: Add pruneExpiredMemory call on mount**

```typescript
import { pruneExpiredMemory } from './companion-memory';

// Inside useCompanionChat, alongside checkAndArchiveStale:
useEffect(() => {
  pruneExpiredMemory();
}, []);
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v showcase.spec`

- [ ] **Step 8: Commit**

```bash
git add src/lib/use-companion-chat.ts
git commit -m "feat: wire useCompanionChat to multi-conversation store

Auto-archive stale conversations on mount, prune expired memory,
use active conversation messages for context window."
```

---

### Task 4: Create ConversationHistorySheet component

**Files:**
- Create: `src/components/companion/ConversationHistorySheet.tsx`

- [ ] **Step 1: Create the sheet component**

Uses the existing Sheet.tsx pattern. Groups conversations by "This Week" / "Last Week" / "Earlier". Shows date, summary, message count per row. Swipe-to-delete via Swipeable from react-native-gesture-handler.

```typescript
import React, { useMemo, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { TrashIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Sheet } from '@/components/ui/Sheet';
import { useCompanionChatStore, selectArchivedConversations, Conversation } from '@/lib/companion-chat-store';
import { alpha } from '@/components/ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectConversation: (conversation: Conversation) => void;
}

type GroupedSection = {
  title: string;
  data: Conversation[];
};

function groupConversations(conversations: Conversation[]): GroupedSection[] {
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const thisWeek: Conversation[] = [];
  const lastWeek: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const conv of conversations) {
    if (conv.lastMessageAt > oneWeekAgo) thisWeek.push(conv);
    else if (conv.lastMessageAt > twoWeeksAgo) lastWeek.push(conv);
    else earlier.push(conv);
  }

  const sections: GroupedSection[] = [];
  if (thisWeek.length) sections.push({ title: 'This Week', data: thisWeek });
  if (lastWeek.length) sections.push({ title: 'Last Week', data: lastWeek });
  if (earlier.length) sections.push({ title: 'Earlier', data: earlier });
  return sections;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ConversationHistorySheet({ visible, onClose, onSelectConversation }: Props) {
  const { colors } = useTheme();
  const archivedRaw = useCompanionChatStore(selectArchivedConversations);
  const deleteConversation = useCompanionChatStore((s) => s.deleteConversation);

  const archivedConversations = useMemo(
    () => [...archivedRaw].sort((a, b) => b.lastMessageAt - a.lastMessageAt),
    [archivedRaw]
  );

  const sections = useMemo(
    () => groupConversations(archivedConversations),
    [archivedConversations]
  );

  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      'Delete Conversation',
      'This conversation will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(id) },
      ]
    );
  }, [deleteConversation]);

  // Flatten sections into a single list with headers
  const flatData = useMemo(() => {
    const items: Array<{ type: 'header'; title: string } | { type: 'conversation'; conversation: Conversation }> = [];
    for (const section of sections) {
      items.push({ type: 'header', title: section.title });
      for (const conv of section.data) {
        items.push({ type: 'conversation', conversation: conv });
      }
    }
    return items;
  }, [sections]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: Spacing['4'],
          paddingBottom: Spacing['3'],
        }}>
          <Text style={{
            fontFamily: FontFamily.heading,
            fontSize: FontSize.lg,
            color: colors.text,
          }}>
            Conversations
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.base,
              color: colors.accent,
            }}>
              Done
            </Text>
          </TouchableOpacity>
        </View>

        {archivedConversations.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['8'] }}>
            <Text style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.base,
              color: colors.textMuted,
              textAlign: 'center',
            }}>
              Your conversation history will appear here
            </Text>
          </View>
        ) : (
          <FlatList
            data={flatData}
            keyExtractor={(item, i) => item.type === 'header' ? `h-${item.title}` : `c-${item.conversation.id}`}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <Text style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: FontSize.xs,
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    paddingHorizontal: Spacing['4'],
                    paddingTop: Spacing['4'],
                    paddingBottom: Spacing['2'],
                  }}>
                    {item.title}
                  </Text>
                );
              }

              const conv = item.conversation;
              const msgCount = conv.messages.length;
              const summary = conv.summary || 'Conversation';

              return (
                <Swipeable
                  renderRightActions={() => (
                    <TouchableOpacity
                      onPress={() => handleDelete(conv.id)}
                      style={{
                        backgroundColor: '#E53E3E',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: 72,
                        marginBottom: Spacing['2'],
                        borderRadius: Radius.md,
                      }}
                    >
                      <TrashIcon size={20} color="#fff" weight="light" />
                    </TouchableOpacity>
                  )}
                >
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => onSelectConversation(conv)}
                    style={{
                      marginHorizontal: Spacing['4'],
                      marginBottom: Spacing['2'],
                      padding: Spacing['3'],
                      backgroundColor: alpha(colors.backgroundElevated, 0.6),
                      borderRadius: Radius.md,
                    }}
                  >
                    <Text style={{
                      fontFamily: FontFamily.body,
                      fontSize: FontSize.base,
                      color: colors.text,
                      marginBottom: 2,
                    }} numberOfLines={1}>
                      {summary}
                    </Text>
                    <Text style={{
                      fontFamily: FontFamily.body,
                      fontSize: FontSize.sm,
                      color: colors.textMuted,
                    }}>
                      {formatDate(conv.lastMessageAt)} · {msgCount} message{msgCount !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                </Swipeable>
              );
            }}
          />
        )}
      </View>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v showcase.spec`

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/ConversationHistorySheet.tsx
git commit -m "feat: add ConversationHistorySheet component

Grouped list (This Week / Last Week / Earlier) with date, summary,
message count. Long-press to delete. Empty state."
```

---

### Task 5: Create ArchivedConversationView component

**Files:**
- Create: `src/components/companion/ArchivedConversationView.tsx`

- [ ] **Step 1: Create read-only conversation viewer**

Reuses the same message rendering as the main companion screen (MessageItem pattern) but with input disabled and an "ended" footer.

```typescript
import React, { useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import type { Conversation, CompanionMessage } from '@/lib/companion-chat-store';
import { UserMessageBubble } from './UserMessageBubble';
import { CompanionMessageContent } from './CompanionMessageContent';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

function formatDateFull(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function ArchivedConversationView({ conversation, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const invertedMessages = useMemo(
    () => [...conversation.messages].reverse(),
    [conversation.messages]
  );

  // No-op for verse press in read-only mode
  const handleVersePress = useCallback(() => {}, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 4,
        paddingBottom: 8,
        paddingHorizontal: Spacing['4'],
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing['3'],
      }}>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <ArrowLeftIcon size={22} color={colors.text} weight="light" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontFamily: FontFamily.heading,
            fontSize: FontSize.base,
            color: colors.text,
          }} numberOfLines={1}>
            {conversation.summary || 'Conversation'}
          </Text>
          <Text style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.xs,
            color: colors.textMuted,
          }}>
            {formatDateFull(conversation.createdAt)}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        data={invertedMessages}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const prevMsg = index < invertedMessages.length - 1 ? invertedMessages[index + 1] : null;
          const isFirstInGroup = !prevMsg || prevMsg.role !== item.role;
          const gapStyle = isFirstInGroup ? { marginTop: 16 } : { marginTop: 6 };

          if (item.role === 'user') {
            return (
              <View style={gapStyle}>
                <UserMessageBubble message={item} />
              </View>
            );
          }

          return (
            <View style={gapStyle}>
              <CompanionMessageContent
                message={item}
                showIcon={isFirstInGroup}
                isStreaming={false}
                onVersePress={handleVersePress}
              />
            </View>
          );
        }}
        contentContainerStyle={{ paddingVertical: Spacing['2'] }}
        ListHeaderComponent={
          <View style={{
            paddingVertical: Spacing['4'],
            alignItems: 'center',
          }}>
            <Text style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.sm,
              color: colors.textMuted,
              fontStyle: 'italic',
            }}>
              This conversation has ended
            </Text>
          </View>
        }
      />
    </View>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v showcase.spec`

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/ArchivedConversationView.tsx
git commit -m "feat: add ArchivedConversationView for read-only past conversations

Reuses existing message components. Back button, date header,
'This conversation has ended' footer."
```

---

### Task 6: Wire everything into the Companion screen

**Files:**
- Modify: `src/app/(tabs)/(ask)/index.tsx`

- [ ] **Step 1: Add header icons and state**

Add "New Conversation" (PlusCircle) and "History" (ClockCounterClockwise) icons to the header alongside the CompanionOrb. Add state for history sheet and archived conversation viewer.

```typescript
// New imports:
import { PlusCircleIcon, ClockCounterClockwiseIcon } from 'phosphor-react-native';
import { ConversationHistorySheet } from '@/components/companion/ConversationHistorySheet';
import { ArchivedConversationView } from '@/components/companion/ArchivedConversationView';
import { useCompanionChatStore, Conversation } from '@/lib/companion-chat-store';
import * as Haptics from 'expo-haptics';

// Inside CompanionScreen:
const [showHistory, setShowHistory] = useState(false);
const [viewingArchived, setViewingArchived] = useState<Conversation | null>(null);
const startNewConversation = useCompanionChatStore((s) => s.startNewConversation);
```

- [ ] **Step 2: Update the header layout**

Replace the centered CompanionOrb-only header with a row: orb center, new conversation icon left, history icon right.

```typescript
{/* Header */}
<View style={{
  paddingTop: insets.top + 4,
  paddingBottom: 8,
  paddingHorizontal: Spacing['4'],
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
}}>
  <TouchableOpacity
    onPress={() => {
      const active = useCompanionChatStore.getState().getActiveConversation();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      startNewConversation();
      if (active && active.messages.length > 0) {
        // Show brief toast confirming archive (use existing toast or Alert)
      }
    }}
    hitSlop={8}
    activeOpacity={0.7}
  >
    <PlusCircleIcon size={24} color={colors.textMuted} weight="light" />
  </TouchableOpacity>

  <CompanionOrb accentColor={colors.accent} size={32} isActive={isStreaming} />

  <TouchableOpacity
    onPress={() => setShowHistory(true)}
    hitSlop={8}
    activeOpacity={0.7}
  >
    <ClockCounterClockwiseIcon size={24} color={colors.textMuted} weight="light" />
  </TouchableOpacity>
</View>
```

- [ ] **Step 3: Add history sheet and archived viewer**

Add at the end of the component, before the closing `</KeyboardAvoidingView>`:

```typescript
{/* Conversation History Sheet */}
<ConversationHistorySheet
  visible={showHistory}
  onClose={() => setShowHistory(false)}
  onSelectConversation={(conv) => {
    setShowHistory(false);
    setViewingArchived(conv);
  }}
/>

{/* Archived Conversation Viewer — full screen overlay */}
{viewingArchived && (
  <View style={{
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.background,
    zIndex: 100,
  }}>
    <ArchivedConversationView
      conversation={viewingArchived}
      onClose={() => setViewingArchived(null)}
    />
  </View>
)}
```

- [ ] **Step 4: Update useCompanionChat usage**

Replace `clearConversation` with `startNewConversation` in the destructured hook return. Remove the old `clearConversation` reference if it was used anywhere.

- [ ] **Step 5: Remove unused imports**

Remove `GearSixIcon` from phosphor imports if no longer used in the header.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v showcase.spec`

- [ ] **Step 7: Commit**

```bash
git add src/app/(tabs)/(ask)/index.tsx
git commit -m "feat: add New Conversation + History buttons to companion header

PlusCircle starts a new conversation (archives current).
ClockCounterClockwise opens history sheet. Tapping a past
conversation opens read-only ArchivedConversationView overlay."
```

---

### Task 7: Build verification and visual testing

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v showcase.spec`
Expected: No errors

- [ ] **Step 2: Build the app**

Run: `npx expo run:ios --device "iPhone 17 Pro"`
Expected: Build succeeds

- [ ] **Step 3: Take screenshot of companion screen**

```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

Verify:
- Header shows PlusCircle (left), CompanionOrb (center), ClockCounterClockwise (right)
- Chat area works normally (empty state or messages)
- Tapping history icon opens sheet
- Tapping "New" archives current and clears

- [ ] **Step 4: Test conversation archival**

1. Send a message in the companion
2. Tap the PlusCircle "New" button
3. Verify: chat clears, new empty state shows
4. Tap history icon
5. Verify: previous conversation appears in "This Week" section with summary

- [ ] **Step 5: Test archived conversation view**

1. In history sheet, tap a past conversation
2. Verify: full-screen overlay shows with back button, messages, "This conversation has ended" footer
3. Tap back arrow
4. Verify: returns to main companion screen

- [ ] **Step 6: Commit any fixes**

```bash
# Stage only files modified during testing fixes
git add src/lib/companion-chat-store.ts src/lib/companion-memory.ts src/lib/use-companion-chat.ts src/components/companion/ src/app/(tabs)/(ask)/index.tsx
git commit -m "fix: companion memory visual/functional adjustments from testing"
```
