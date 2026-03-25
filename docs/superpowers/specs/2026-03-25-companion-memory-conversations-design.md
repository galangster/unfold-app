# Companion Memory & Conversation History — Design Spec

**Date:** 2026-03-25
**Goal:** Give the companion selective memory with natural session boundaries, and let users browse past conversations via a history sheet.
**Architecture:** Client-side memory with TTL-based chat expiry, extracted long-term memory (topics/prayers), conversation history stored in Zustand/MMKV, history sheet accessible from companion header.
**Tech Stack:** Zustand, MMKV, React Native bottom sheet, existing companion chat infrastructure

---

## 1. Selective Memory Model

### Current State
- 200 messages stored forever (no TTL, no session boundary)
- Last 10 messages sent as AI context each request
- Extracted memory (topics, verses, prayers) persists indefinitely
- No UI to clear conversation or start a new one
- No concept of separate "conversations"

### New Model: Two-Tier Memory

**Tier 1 — Short-term (chat messages)**
- Messages within a conversation are kept for the active session
- A conversation auto-closes after **24 hours of inactivity** (no new messages)
- Closed conversations are archived (read-only, browsable in history)
- Archived conversations count toward a **50-conversation cap** (oldest purged beyond cap)
- AI context window: last 10 messages from the **active** conversation only

**Tier 2 — Long-term (extracted memory)**
- Topics, verses mentioned, and prayer requests persist across conversations
- **30-day rolling window** — entries older than 30 days are pruned on app launch
- Prayer requests get a `resolvedAt` timestamp (future: user can mark as resolved)
- Long-term memory is always included in AI context regardless of conversation boundaries
- Caps remain: 20 topics, 15 verses, 5 active prayer requests

### Session Boundary Logic

```
On app open:
  1. Check active conversation's lastMessageAt
  2. If > 24 hours ago → archive it, create new conversation
  3. If ≤ 24 hours → resume active conversation

On "New Conversation" tap:
  1. Archive current conversation immediately
  2. Create new conversation with fresh ID
  3. Long-term memory carries over (topics, prayers)
```

---

## 2. Conversation Data Model

### Store Changes (`companion-chat-store.ts`)

```typescript
interface Conversation {
  id: string;                    // UUID
  messages: CompanionMessage[];  // Full message array
  createdAt: number;             // First message timestamp
  lastMessageAt: number;         // Most recent message timestamp
  summary: string | null;        // Auto-generated 1-line summary
  topicTags: string[];           // Extracted from companion-memory
  archived: boolean;             // false = active, true = read-only
}

// Store shape changes:
interface CompanionChatStore {
  // Replace flat messages array:
  conversations: Conversation[];
  activeConversationId: string | null;

  // Actions:
  getActiveConversation(): Conversation | null;
  startNewConversation(): void;
  archiveConversation(id: string): void;
  pruneOldConversations(): void;  // Enforce 50-conversation cap
}
```

### Migration Path
- Current `messages[]` array becomes the first `Conversation` entry
- Bump store version (v2 for companion-chat store)
- Migration: wrap existing messages in a Conversation object with `archived: false`

---

## 3. Conversation Summary Generation

Summaries appear in the history sheet as preview text. Generated **locally, no AI call**.

### Strategy
1. **Primary:** Use extracted `topicTags` from companion-memory (e.g., "Anxiety, Psalm 46, prayer for patience")
2. **Fallback:** First user message, truncated to 80 chars
3. **Timing:** Generated when conversation is archived (not on every message)

### Example Summaries
- "Talked about grief, Psalm 13, and trusting God's timing"
- "Prayer for my friend's surgery"
- "Questions about baptism and salvation"
- "How to forgive someone who hurt me"

---

## 4. Conversation History Sheet

### Trigger
- Small **clock/history icon** in the companion screen header (next to companion name)
- Opens a bottom sheet (60% snap, full-screen drag)

### Layout

```
┌─────────────────────────────────┐
│  Conversations          [Done]  │
│─────────────────────────────────│
│  This Week                      │
│  ┌─────────────────────────────┐│
│  │ Mar 24 · Grief and Psalm 13││
│  │ 8 messages                  ││
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ Mar 22 · Prayer for surgery ││
│  │ 5 messages                  ││
│  └─────────────────────────────┘│
│                                 │
│  Last Week                      │
│  ┌─────────────────────────────┐│
│  │ Mar 18 · Baptism questions  ││
│  │ 12 messages                 ││
│  └─────────────────────────────┘│
│                                 │
│  Earlier                        │
│  ┌─────────────────────────────┐│
│  │ Mar 10 · Forgiveness        ││
│  │ 6 messages                  ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
```

### Behavior
- **Tap a conversation:** Opens it in a read-only view (same chat UI, input disabled, "This conversation has ended" footer)
- **Swipe left to delete:** Removes archived conversation permanently
- **Active conversation:** Not shown in history (it's already on screen)
- **Empty state:** "Your conversation history will appear here"
- **Grouped by:** This Week / Last Week / Earlier (relative date headers)

### Styling
- Matches existing sheet patterns (Sheet.tsx component)
- Conversation rows: date (muted) + summary (primary text) + message count (muted)
- No accent colors, no icons per row — keep it minimal
- Dark theme compatible via existing color tokens

---

## 5. "New Conversation" Button

### Placement
- In companion screen header, **left of the history icon**
- Icon: `PlusCircle` from phosphor-react-native, weight="light"
- Or: text button "New" if icon feels ambiguous

### Behavior
1. If current conversation has messages: archive it, show brief toast "Conversation saved"
2. Create new conversation
3. Chat area clears, ready for new input
4. Long-term memory persists (companion still "knows" user)

### Edge Cases
- If current conversation is empty (0 messages), don't archive — just keep it
- If user taps "New" immediately after opening a past conversation, return to active (or create new)

---

## 6. Long-Term Memory Pruning

### On App Launch (`companion-memory.ts`)

```typescript
function pruneExpiredMemory(memory: CompanionMemory): CompanionMemory {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  return {
    ...memory,
    topics: memory.topics.filter(t => t.addedAt > thirtyDaysAgo),
    versesMentioned: memory.versesMentioned.filter(v => v.addedAt > thirtyDaysAgo),
    prayerRequests: memory.prayerRequests.filter(p =>
      p.addedAt > thirtyDaysAgo || !p.resolvedAt  // Keep unresolved prayers
    ),
    lastUpdated: Date.now(),
  };
}
```

**Note:** This requires adding `addedAt` timestamps to topic and verse entries. Current model stores them as plain strings — migration needed to `{ text: string, addedAt: number }`.

---

## 7. Files to Change

| File | Change |
|------|--------|
| `src/lib/companion-chat-store.ts` | New `Conversation` model, multi-conversation state, archive/prune actions |
| `src/lib/companion-memory.ts` | Add `addedAt` timestamps, 30-day pruning, memory format migration |
| `src/lib/use-companion-chat.ts` | Work with active conversation, auto-archive on 24h inactivity |
| `src/app/(tabs)/(companion)/index.tsx` | Add header icons (New + History), wire up sheet |
| **New:** `src/components/companion/ConversationHistorySheet.tsx` | History sheet UI |
| **New:** `src/components/companion/ArchivedConversationView.tsx` | Read-only past conversation viewer |

### Files That Don't Change
- `src/lib/mmkv-storage.ts` — Storage layer unchanged
- Backend `companion.ts` / `companion-prompt.ts` — Stateless, no changes needed
- `CompanionMessageBubble.tsx` — Renders individual messages, unchanged

---

## 8. What This Does NOT Include

- Server-side conversation storage (everything stays on-device)
- AI-generated conversation summaries (too expensive, local extraction is sufficient)
- Search across past conversations (future enhancement)
- Export/share conversation feature
- Prayer request "resolved" UI (data model supports it, UI is future)
- Conversation pinning or favorites
