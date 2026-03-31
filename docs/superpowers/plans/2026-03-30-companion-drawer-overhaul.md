# Companion Drawer Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom-sheet conversation history with a ChatGPT/Claude-style left drawer, add AI-generated conversation titles.

**Architecture:** The companion screen gets a left-edge gesture-driven overlay drawer built with Reanimated + Gesture Handler. The existing Zustand multi-conversation model already supports this — the change is primarily UI (drawer replaces sheet) plus a lightweight backend endpoint for AI title generation. The `summary` field is renamed to `title` with a v4 store migration.

**Tech Stack:** React Native, Reanimated 4.x, Gesture Handler v2, Zustand + MMKV, FlashList, Express (backend), Claude Haiku (title generation)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/companion-chat-store.ts` | Modify | Rename `summary` → `title`, add `updateConversation()` + `setActiveConversation()`, v4 migration |
| `backend/src/routes/companion.ts` | Modify | Add `POST /api/companion/title` endpoint |
| `src/lib/companion-service.ts` | Modify | Add `generateConversationTitle()` client function |
| `src/lib/use-companion-chat.ts` | Modify | Fire title generation after first exchange completes |
| `src/components/companion/CompanionDrawer.tsx` | Create | Left-edge overlay drawer with gesture, scrim, conversation list |
| `src/app/(tabs)/(ask)/index.tsx` | Modify | Replace sheet+archived view with drawer, update header, gesture composition |
| `src/components/companion/ConversationHistorySheet.tsx` | Delete | Replaced by CompanionDrawer |
| `src/components/companion/ArchivedConversationView.tsx` | Delete | No longer needed |

---

### Task 1: Store — Rename `summary` to `title`, add actions, bump to v4

**Files:**
- Modify: `src/lib/companion-chat-store.ts`

This task modifies the Zustand store to support the drawer. Three changes: rename the field, add two new actions, update the migration.

- [ ] **Step 1: Rename `summary` to `title` in the Conversation interface**

In `src/lib/companion-chat-store.ts`, change the `Conversation` interface:

```typescript
// Before
summary: string | null;

// After
title: string | null;
```

Then find-and-replace all references to `summary` within the file:
- `generateSummary` function: rename to `generateTitle`, change return assignments
- `archiveActiveConversation`: `summary` param → `title` param, `summary:` → `title:`
- `startNewConversation`: `summary: generateSummary(...)` → `title: generateTitle(...)`
- New conversation creation in `addMessage`: `summary: null` → `title: null`

- [ ] **Step 2: Add `updateConversation` action**

Add to the `CompanionChatState` interface:

```typescript
updateConversation: (id: string, updates: Partial<Pick<Conversation, 'title' | 'topicTags'>>) => void;
```

Implement in the store:

```typescript
updateConversation: (id, updates) =>
  set((s) => ({
    conversations: s.conversations.map(c =>
      c.id === id
        ? { ...c, ...updates, updatedAt: new Date().toISOString() }
        : c
    ),
  })),
```

- [ ] **Step 3: Add `setActiveConversation` action**

This action sets a conversation (including archived ones) as the active conversation, un-archiving it. Needed for the drawer's "tap to load" behavior.

Add to the `CompanionChatState` interface:

```typescript
setActiveConversation: (id: string) => void;
```

Implement:

```typescript
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
      // Remove empty active conversation
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
```

- [ ] **Step 4: Bump store version to 4 with migration**

Change `version: 3` to `version: 4` in the persist config.

Add migration case in the `migrate` function, after the `if (version < 3)` block:

```typescript
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
```

- [ ] **Step 5: Update selectors and exports**

Update `selectArchivedConversations` — no change needed (it doesn't reference `summary`).

Export the `generateTitle` function (renamed from `generateSummary`) since `use-companion-chat.ts` may need it as a fallback.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -40`

There will be errors in files that reference `conv.summary` (ConversationHistorySheet, ArchivedConversationView, index.tsx). That's expected — those files change in later tasks. Only verify that companion-chat-store.ts itself has no internal errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/companion-chat-store.ts
git commit -m "feat(companion): rename summary to title, add updateConversation/setActiveConversation, bump store to v4"
```

---

### Task 2: Backend — Add `POST /api/companion/title` endpoint

**Files:**
- Modify: `backend/src/routes/companion.ts`

Adds a lightweight non-streaming endpoint that uses Claude Haiku to generate a 3-6 word conversation title from the first exchange.

- [ ] **Step 1: Add the title endpoint before the `export default router` line**

In `backend/src/routes/companion.ts`, add this route after the existing `/chat` route:

```typescript
// ─── Title generation ────────────────────────────────────────────────────────

router.post("/title", async (req: Request, res: Response) => {
  const { messages } = req.body;

  // Validate: need at least one user + one assistant message
  if (
    !messages ||
    !Array.isArray(messages) ||
    messages.length < 2 ||
    !messages.some((m: any) => m.role === "user") ||
    !messages.some((m: any) => m.role === "assistant")
  ) {
    return res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "Need at least one user and one assistant message" },
    });
  }

  // Truncate to first exchange only (first user + first assistant)
  const firstUser = messages.find((m: any) => m.role === "user");
  const firstAssistant = messages.find((m: any) => m.role === "assistant");

  const truncatedMessages = [
    { role: "user" as const, content: String(firstUser.content).slice(0, 500) },
    { role: "assistant" as const, content: String(firstAssistant.content).slice(0, 200) },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        temperature: 0.3,
        system: "Generate a 3-6 word title summarizing this conversation. Return ONLY the title text, nothing else. No quotes, no punctuation unless part of the title.",
        messages: truncatedMessages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.warn(`[Companion] Title generation failed: ${upstream.status} ${errText.slice(0, 100)}`);
      return res.status(502).json({ error: { code: "AI_ERROR", message: "Title generation failed" } });
    }

    const data = await upstream.json() as any;
    const title = data.content?.[0]?.text?.trim();

    if (!title) {
      return res.status(502).json({ error: { code: "AI_ERROR", message: "Empty title response" } });
    }

    // Log token usage
    const usage = data.usage;
    if (usage) {
      console.log(
        `[Companion] title uid=${req.uid} in=${usage.input_tokens} out=${usage.output_tokens}`
      );
    }

    return res.json({ title });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.warn(`[Companion] Title generation timed out (3s)`);
      return res.status(504).json({ error: { code: "TIMEOUT", message: "Title generation timed out" } });
    }
    console.error(`[Companion] Title error:`, err.message);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Title generation failed" } });
  }
});
```

- [ ] **Step 2: Verify backend compiles**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/routes/companion.ts
git commit -m "feat(companion): add POST /api/companion/title endpoint using Haiku"
```

---

### Task 3: Client — Add `generateConversationTitle()` to companion-service + hook

**Files:**
- Modify: `src/lib/companion-service.ts`
- Modify: `src/lib/use-companion-chat.ts`

Adds the client-side function that calls the title endpoint, and wires it into the chat hook so titles are generated after the first exchange.

- [ ] **Step 1: Add `generateConversationTitle` to companion-service.ts**

Add this function at the end of `src/lib/companion-service.ts`:

```typescript
/**
 * Generate an AI title for a conversation.
 * Non-blocking, fire-and-forget. Returns null on any failure.
 */
export async function generateConversationTitle(
  firstUserMessage: string,
  firstAssistantMessage: string,
): Promise<string | null> {
  try {
    const backendCandidates = getBackendCandidates();
    const headers = await getAuthHeaders();

    for (let i = 0; i < backendCandidates.length; i++) {
      const backendUrl = backendCandidates[i];
      const hasAnotherCandidate = i < backendCandidates.length - 1;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s client timeout (server has 3s)

      try {
        const response = await fetch(`${backendUrl}/api/companion/title`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: [
              { role: 'user', content: firstUserMessage },
              { role: 'assistant', content: firstAssistantMessage },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok && hasAnotherCandidate) {
          logger.warn(`[CompanionTitle] Backend ${backendUrl} returned ${response.status}; trying fallback`);
          continue;
        }

        if (!response.ok) {
          logger.warn(`[CompanionTitle] Backend returned ${response.status}`);
          return null;
        }

        const data = await response.json();
        if (data.title && typeof data.title === 'string') {
          logger.log(`[CompanionTitle] Generated: "${data.title}"`);
          return data.title;
        }

        return null;
      } catch (error) {
        clearTimeout(timeoutId);
        if (hasAnotherCandidate) {
          logger.warn(`[CompanionTitle] Backend ${backendUrl} failed; trying fallback`);
          continue;
        }
        throw error;
      }
    }

    return null;
  } catch (error) {
    logger.warn('[CompanionTitle] Error:', error instanceof Error ? error.message : error);
    return null;
  }
}
```

- [ ] **Step 2: Wire title generation into use-companion-chat.ts**

Import the new function at the top of `src/lib/use-companion-chat.ts`:

```typescript
import { generateConversationTitle } from './companion-service';
```

In the `sendMessage` callback, after the `updateCompanionMemory(completedMessages)` call (around line 433), add title generation logic:

```typescript
// Generate title after first exchange (user + companion)
const convId = useCompanionChatStore.getState().activeConversationId;
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep -E "companion-service|use-companion-chat" | head -20`

Expected: No errors in these two files (other files may still error due to `summary` → `title` rename).

- [ ] **Step 4: Commit**

```bash
git add src/lib/companion-service.ts src/lib/use-companion-chat.ts
git commit -m "feat(companion): add AI title generation after first exchange"
```

---

### Task 4: CompanionDrawer component

**Files:**
- Create: `src/components/companion/CompanionDrawer.tsx`

The core new component — a left-edge overlay drawer with gesture handling, scrim, conversation list with time-based grouping, swipe-to-delete, and new chat button.

- [ ] **Step 1: Create CompanionDrawer.tsx**

Create `src/components/companion/CompanionDrawer.tsx`:

```typescript
/**
 * CompanionDrawer — left-edge overlay drawer for conversation history.
 * Matches ChatGPT/Claude mobile chat pattern.
 *
 * Gesture-driven via Reanimated + Gesture Handler.
 * - Swipe right from left edge to open
 * - Swipe left or tap scrim to close
 * - Velocity-based snap decisions
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Alert,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable'; // Legacy Swipeable — NOT ReanimatedSwipeable (has measure.ts null crash on RN 0.83)
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PlusCircleIcon,
  TrashIcon,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { alpha } from '@/components/ui';
import {
  useCompanionChatStore,
  type Conversation,
} from '@/lib/companion-chat-store';

// ── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.80, 320);

const SPRING_CONFIG = { duration: 300, dampingRatio: 1 }; // Critically damped, no bounce

const EDGE_WIDTH = 36;           // Edge activation zone (pt)
const ACTIVE_OFFSET_X = 5;      // Horizontal threshold before activation
const FAIL_OFFSET_Y = 15;       // Fails if finger moves this far vertically
const MIN_SWIPE_DISTANCE = 60;  // Minimum swipe to register
const VELOCITY_THRESHOLD = 500; // Instant snap above this velocity
const VELOCITY_PROJECTION = 0.05; // Projection multiplier

// ── Time grouping ────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

type FlatItem =
  | { type: 'header'; title: string; id: string }
  | { type: 'conversation'; conversation: Conversation; id: string };

function groupConversations(conversations: Conversation[]): FlatItem[] {
  const now = Date.now();
  const today: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const conv of conversations) {
    const age = now - conv.createdAt;
    if (age < ONE_DAY_MS) today.push(conv);
    else if (age < ONE_WEEK_MS) thisWeek.push(conv);
    else earlier.push(conv);
  }

  const items: FlatItem[] = [];
  if (today.length > 0) {
    items.push({ type: 'header', title: 'Today', id: 'h-today' });
    for (const c of today) items.push({ type: 'conversation', conversation: c, id: `c-${c.id}` });
  }
  if (thisWeek.length > 0) {
    items.push({ type: 'header', title: 'This Week', id: 'h-week' });
    for (const c of thisWeek) items.push({ type: 'conversation', conversation: c, id: `c-${c.id}` });
  }
  if (earlier.length > 0) {
    items.push({ type: 'header', title: 'Earlier', id: 'h-earlier' });
    for (const c of earlier) items.push({ type: 'conversation', conversation: c, id: `c-${c.id}` });
  }
  return items;
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < ONE_DAY_MS) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    if (hours < 1) return 'Just now';
    return `${hours}h ago`;
  }
  if (diff < ONE_WEEK_MS) {
    const days = Math.floor(diff / ONE_DAY_MS);
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CompanionDrawerProps {
  translateX: Animated.SharedValue<number>;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNewChat: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CompanionDrawer({
  translateX,
  isOpen,
  onOpen,
  onClose,
  onNewChat,
}: CompanionDrawerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const activeId = useCompanionChatStore((s) => s.activeConversationId);
  const allWithMessages = useCompanionChatStore(
    useShallow((s) => (s.conversations ?? []).filter(c => (c.messages ?? []).length > 0))
  );
  const deleteConversation = useCompanionChatStore((s) => s.deleteConversation);
  const setActiveConversation = useCompanionChatStore((s) => s.setActiveConversation);

  const sortedConversations = useMemo(
    () => [...allWithMessages].sort((a, b) => b.lastMessageAt - a.lastMessageAt),
    [allWithMessages]
  );

  const flatData = useMemo(
    () => groupConversations(sortedConversations),
    [sortedConversations]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      if (conv.id === activeId) {
        onClose();
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveConversation(conv.id);
      onClose();
    },
    [activeId, onClose, setActiveConversation]
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete Conversation',
        'This conversation will be permanently removed.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              deleteConversation(id);
            },
          },
        ],
      );
    },
    [deleteConversation]
  );

  const handleNewChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNewChat();
    onClose();
  }, [onNewChat, onClose]);

  // ── Animated styles ──────────────────────────────────────────────────────

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-DRAWER_WIDTH, 0],
      [0, 0.5]
    ),
    pointerEvents: isOpen ? 'auto' as const : 'none' as const,
  }));

  // ── Render items ─────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: FlatItem }) => {
      if (item.type === 'header') {
        return (
          <Text
            style={[
              styles.sectionHeader,
              { color: colors.textMuted },
            ]}
          >
            {item.title}
          </Text>
        );
      }

      const conv = item.conversation;
      const isCurrent = conv.id === activeId;
      const displayTitle = conv.title || conv.messages?.[0]?.content?.slice(0, 40) || 'Conversation';

      const row = (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleSelectConversation(conv)}
          style={[
            styles.conversationRow,
            {
              backgroundColor: isCurrent
                ? alpha(colors.accent, 0.10)
                : 'transparent',
              borderLeftWidth: isCurrent ? 3 : 0,
              borderLeftColor: isCurrent ? colors.accent : 'transparent',
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${displayTitle}, ${formatRelativeDate(conv.lastMessageAt)}`}
        >
          <Text
            style={[
              styles.rowTitle,
              { color: isCurrent ? colors.accent : colors.text },
            ]}
            numberOfLines={1}
          >
            {displayTitle}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
            {formatRelativeDate(conv.lastMessageAt)}
          </Text>
        </TouchableOpacity>
      );

      // No swipe-to-delete on the current conversation
      if (isCurrent) return row;

      return (
        <Swipeable
          overshootRight={false}
          renderRightActions={() => (
            <TouchableOpacity
              onPress={() => handleDelete(conv.id)}
              activeOpacity={0.7}
              style={styles.deleteAction}
              accessibilityRole="button"
              accessibilityLabel="Delete conversation"
            >
              <TrashIcon size={18} color="#fff" weight="light" />
            </TouchableOpacity>
          )}
        >
          {row}
        </Swipeable>
      );
    },
    [colors, activeId, handleSelectConversation, handleDelete]
  );

  const keyExtractor = useCallback((item: FlatItem) => item.id, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Scrim */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'black', zIndex: 98 },
          scrimStyle,
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close drawer"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            backgroundColor: colors.backgroundElevated,
            paddingTop: insets.top + Spacing['2'],
          },
          drawerStyle,
        ]}
        accessibilityViewIsModal={isOpen}
      >
        {/* New Chat button */}
        <View style={styles.newChatContainer}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNewChat}
            style={[
              styles.newChatButton,
              {
                backgroundColor: alpha(colors.accent, 0.12),
                borderColor: alpha(colors.accent, 0.20),
              },
            ]}
          >
            <PlusCircleIcon size={18} color={colors.accent} weight="light" />
            <Text style={[styles.newChatText, { color: colors.accent }]}>
              New Chat
            </Text>
          </TouchableOpacity>
        </View>

        {/* Conversation list */}
        {sortedConversations.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Your conversations will appear here
            </Text>
          </View>
        ) : (
          <FlashList
            data={flatData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            estimatedItemSize={60}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          />
        )}
      </Animated.View>
    </>
  );
}

// ── Gesture hook — used by the companion screen ──────────────────────────────

export function useDrawerGesture(
  translateX: Animated.SharedValue<number>,
  isOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
) {
  const startX = useSharedValue(0);
  const isEdgeSwipe = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
    .failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
    .onStart((e) => {
      startX.value = translateX.value;
      // Edge detection: when closed, only activate if touch started within EDGE_WIDTH of left edge
      // When open, activate from anywhere (to allow close gesture)
      isEdgeSwipe.value = isOpen || e.absoluteX <= EDGE_WIDTH;
    })
    .onUpdate((e) => {
      if (!isEdgeSwipe.value) return; // Ignore non-edge swipes when closed
      // Clamp between -DRAWER_WIDTH (closed) and 0 (open)
      const newX = Math.max(-DRAWER_WIDTH, Math.min(0, startX.value + e.translationX));
      translateX.value = newX;
    })
    .onEnd((e) => {
      if (!isEdgeSwipe.value) return; // Ignore non-edge swipes when closed

      const distance = Math.abs(e.translationX);

      // Ignore gestures shorter than minimum distance
      if (distance < MIN_SWIPE_DISTANCE) {
        // Snap back to current state
        translateX.value = withSpring(isOpen ? 0 : -DRAWER_WIDTH, SPRING_CONFIG);
        return;
      }

      // Velocity-based instant snap
      if (Math.abs(e.velocityX) > VELOCITY_THRESHOLD) {
        if (e.velocityX > 0) {
          // Swiping right → open
          translateX.value = withSpring(0, SPRING_CONFIG);
          runOnJS(onOpen)();
        } else {
          // Swiping left → close
          translateX.value = withSpring(-DRAWER_WIDTH, SPRING_CONFIG);
          runOnJS(onClose)();
        }
        return;
      }

      // Position-based snap with velocity projection
      const projected = translateX.value + VELOCITY_PROJECTION * e.velocityX;
      const threshold = -DRAWER_WIDTH * 0.5; // 50% of drawer width

      if (projected > threshold) {
        // Open
        translateX.value = withSpring(0, SPRING_CONFIG);
        runOnJS(onOpen)();
      } else {
        // Close
        translateX.value = withSpring(-DRAWER_WIDTH, SPRING_CONFIG);
        runOnJS(onClose)();
      }
    });

  return panGesture;
}

// ── Exports ──────────────────────────────────────────────────────────────────

export { DRAWER_WIDTH };

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -DRAWER_WIDTH, // Start off-screen; translateX animates to 0 when open
    zIndex: 99,
  },
  newChatContainer: {
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  newChatText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
  },
  sectionHeader: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['2'],
  },
  conversationRow: {
    paddingVertical: 12,
    paddingHorizontal: Spacing['4'],
  },
  rowTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    marginBottom: 2,
  },
  rowMeta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
  },
  deleteAction: {
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['8'],
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles for the new file**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep "CompanionDrawer" | head -10`

Expected: No errors in CompanionDrawer.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/CompanionDrawer.tsx
git commit -m "feat(companion): add CompanionDrawer with gesture, scrim, conversation list"
```

---

### Task 5: Integrate drawer into companion screen, delete old components

**Files:**
- Modify: `src/app/(tabs)/(ask)/index.tsx`
- Delete: `src/components/companion/ConversationHistorySheet.tsx`
- Delete: `src/components/companion/ArchivedConversationView.tsx`

This is the final integration task. Replaces the bottom sheet and archived overlay with the drawer, updates header icons, and composes the tap gesture for keyboard dismiss.

- [ ] **Step 1: Update imports in index.tsx**

Replace the old imports:

```typescript
// REMOVE these imports:
import { ConversationHistorySheet } from '@/components/companion/ConversationHistorySheet';
import { ArchivedConversationView } from '@/components/companion/ArchivedConversationView';
import type { CompanionMessage, Conversation } from '@/lib/companion-chat-store';

// ADD these imports:
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  ListIcon,
  PencilSimpleLineIcon,
} from 'phosphor-react-native';
import type { CompanionMessage } from '@/lib/companion-chat-store';
import {
  CompanionDrawer,
  useDrawerGesture,
  DRAWER_WIDTH,
} from '@/components/companion/CompanionDrawer';
```

Also remove the `ClockCounterClockwiseIcon` and `PlusCircleIcon` imports since the header icons change.

- [ ] **Step 2: Add drawer state and gesture setup**

Inside `CompanionScreen()`, after the existing state declarations, add:

```typescript
// Drawer state
const [drawerOpen, setDrawerOpen] = useState(false);
const drawerTranslateX = useSharedValue(-DRAWER_WIDTH);

const handleDrawerOpen = useCallback(() => {
  setDrawerOpen(true);
  drawerTranslateX.value = withSpring(0, { duration: 300, dampingRatio: 1 });
}, [drawerTranslateX]);

const handleDrawerClose = useCallback(() => {
  setDrawerOpen(false);
  drawerTranslateX.value = withSpring(-DRAWER_WIDTH, { duration: 300, dampingRatio: 1 });
}, [drawerTranslateX]);

const panGesture = useDrawerGesture(
  drawerTranslateX,
  drawerOpen,
  () => setDrawerOpen(true),
  () => setDrawerOpen(false),
);

// Tap gesture for keyboard dismiss (replaces the TouchableOpacity wrapper)
const tapGesture = Gesture.Tap().onEnd(() => {
  runOnJS(Keyboard.dismiss)();
});

const composedGesture = Gesture.Simultaneous(panGesture, tapGesture);
```

Import `withSpring`, `runOnJS`, and `useSharedValue` from reanimated (add to existing import at line 24-29).

Remove the old state:

```typescript
// REMOVE these lines:
const [showHistory, setShowHistory] = useState(false);
const [viewingArchived, setViewingArchived] = useState<Conversation | null>(null);
```

- [ ] **Step 3: Update the header**

Replace the entire header `<View>` block with:

```typescript
{/* Header — drawer / orb + name / new chat */}
<View
  style={{
    paddingTop: insets.top + 4,
    paddingBottom: 8,
    paddingHorizontal: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  }}
>
  <TouchableOpacity
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      handleDrawerOpen();
    }}
    hitSlop={8}
    activeOpacity={0.7}
    accessibilityLabel="Open conversation history"
    accessibilityRole="button"
  >
    <ListIcon size={24} color={colors.textMuted} weight="light" />
  </TouchableOpacity>

  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <CompanionOrb
      accentColor={colors.accent}
      size={32}
      isActive={isStreaming}
    />
    <Text
      style={{
        fontFamily: FontFamily.uiMedium,
        fontSize: FontSize.base,
        color: colors.text,
      }}
    >
      Companion
    </Text>
  </View>

  <TouchableOpacity
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      startNewConversation();
    }}
    hitSlop={8}
    activeOpacity={0.7}
    accessibilityLabel="New conversation"
    accessibilityRole="button"
  >
    <PencilSimpleLineIcon size={22} color={colors.textMuted} weight="light" />
  </TouchableOpacity>
</View>
```

- [ ] **Step 4: Wrap message area with GestureDetector, remove TouchableOpacity wrapper**

Replace the `<TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} style={{ flex: 1 }}>` wrapper (and its closing `</TouchableOpacity>`) with:

```typescript
<GestureDetector gesture={composedGesture}>
  <Animated.View style={{ flex: 1 }}>
    {/* ... existing isEmpty / FlatList / scroll button code stays identical ... */}
  </Animated.View>
</GestureDetector>
```

The inner content (empty state, FlatList, error banner, scroll button) stays exactly the same.

- [ ] **Step 5: Replace ConversationHistorySheet and ArchivedConversationView with CompanionDrawer**

Remove the entire `<ConversationHistorySheet>` JSX block and the entire `{viewingArchived && ...}` block.

Add the CompanionDrawer before the `</KeyboardAvoidingView>` closing tag:

```typescript
{/* Companion Drawer */}
<CompanionDrawer
  translateX={drawerTranslateX}
  isOpen={drawerOpen}
  onOpen={handleDrawerOpen}
  onClose={handleDrawerClose}
  onNewChat={startNewConversation}
/>
```

- [ ] **Step 6: Delete old component files**

Delete:
- `src/components/companion/ConversationHistorySheet.tsx`
- `src/components/companion/ArchivedConversationView.tsx`

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -40`

Fix any remaining `summary` → `title` references in other files (grep for `.summary` across the codebase).

Expected: Clean compile (excluding pre-existing errors in playwright, sync-service, etc.).

- [ ] **Step 8: Build and verify on simulator**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx expo start --clear --port 8081`

Test:
1. Open the Ask tab — header should show hamburger (left), orb + "Companion" (center), pencil (right)
2. Swipe from left edge — drawer should slide in with scrim
3. Tap scrim — drawer should close
4. Tap hamburger icon — drawer should open
5. Start a conversation — after first exchange, title should appear in drawer within a few seconds
6. Tap "New Chat" in drawer — should archive current and start fresh
7. Tap an old conversation — should load it as the active conversation
8. Swipe left on a conversation row — should show delete button

Take screenshot: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(companion): integrate drawer, update header, remove old sheet/archived view"
```

---

## Testing Checklist

After all tasks are complete, verify end-to-end:

- [ ] Fresh install: v4 migration creates title field correctly for new conversations
- [ ] Existing user: v3→v4 migration copies `summary` into `title` for all existing conversations
- [ ] Drawer gesture: opens from left edge, closes on swipe left or scrim tap
- [ ] Drawer doesn't conflict with message list scrolling (failOffsetY handles this)
- [ ] Keyboard dismiss works when tapping message area (tap gesture composition)
- [ ] New Chat button in drawer archives current and starts fresh
- [ ] Pencil icon in header does the same
- [ ] Title generation fires after first user+companion exchange
- [ ] Title updates in drawer asynchronously
- [ ] If title generation fails, fallback shows first user message truncated
- [ ] Swipe-to-delete works on non-current conversations
- [ ] Tapping current conversation just closes drawer
- [ ] Tapping archived conversation loads it and closes drawer
- [ ] Conversation grouping: Today / This Week / Earlier
- [ ] Backend `/api/companion/title` returns proper title, respects 3s timeout
- [ ] No TypeScript errors introduced
