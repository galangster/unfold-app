# Companion Chat Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the companion chat against safety gaps, edge case crashes, and persona drift — 8 items from the code audit spec.

**Architecture:** Client-side crisis detection + resource card, hook-level fixes for unmount/race/offline/retry, regex + telemetry fixes for memory and persona enforcement. All changes are client-side; no backend changes required.

**Tech Stack:** React Native 0.83, Expo SDK 55, Zustand + MMKV, phosphor-react-native, @react-native-community/netinfo

**Spec:** `docs/superpowers/specs/2026-03-23-companion-chat-hardening-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/crisis-detection.ts` | Crisis keyword matching against user input | **Create** |
| `src/components/companion/CrisisResourceCard.tsx` | Tappable crisis hotline card component | **Create** |
| `src/lib/companion-chat-store.ts` | Store types + `makeId` export + `showCrisisResources` field | **Modify** |
| `src/lib/use-companion-chat.ts` | Hook: unmount cleanup, rapid-send ref, offline check, retry, crisis flag, banned phrase log, makeId | **Modify** |
| `src/lib/companion-memory.ts` | Fix verse regex + lastIndex reset | **Modify** |
| `src/constants/persona.ts` | Add `checkBannedPhrases()` export | **Modify** |
| `src/components/companion/CompanionMessageContent.tsx` | Tap-to-retry on error state, crisis card slot | **Modify** |
| `src/app/(tabs)/(ask)/index.tsx` | Wire crisis card + retry + onRetry prop | **Modify** |

---

### Task 1: Crisis Detection Utility

**Files:**
- Create: `src/lib/crisis-detection.ts`
- Test: manual (keyword matching is pure string logic)

- [ ] **Step 1: Create `crisis-detection.ts`**

```typescript
// src/lib/crisis-detection.ts

/**
 * Client-side crisis keyword detection.
 * Runs on USER input only — never on AI responses.
 * Errs on the side of showing resources (false positives OK).
 */

export type CrisisCategory = 'suicide' | 'self_harm' | 'abuse';

interface CrisisDetectionResult {
  detected: boolean;
  categories: CrisisCategory[];
}

const CRISIS_PATTERNS: Record<CrisisCategory, string[]> = {
  suicide: [
    "don't want to be alive",
    'end it all',
    'kill myself',
    'want to die',
    'better off dead',
    'no reason to live',
    'nobody would miss me',
    'wish i was dead',
    'wish i were dead',
  ],
  self_harm: [
    'cutting myself',
    'hurt myself',
    'hurting myself',
    'self-harm',
    'self harm',
  ],
  abuse: [
    'hits me',
    'beats me',
    'abuses me',
    'he hurts me',
    'she hurts me',
    'forces me to',
    'afraid to go home',
  ],
};

/**
 * Check user message text for crisis indicators.
 * Case-insensitive substring matching.
 */
export function detectCrisis(text: string): CrisisDetectionResult {
  const lower = text.toLowerCase();
  const categories: CrisisCategory[] = [];

  for (const [category, patterns] of Object.entries(CRISIS_PATTERNS) as [CrisisCategory, string[]][]) {
    if (patterns.some((p) => lower.includes(p))) {
      categories.push(category);
    }
  }

  return { detected: categories.length > 0, categories };
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/lib/crisis-detection.ts 2>&1 | head -20`
Expected: No errors (or run full type check below)

- [ ] **Step 3: Commit**

```bash
git add src/lib/crisis-detection.ts
git commit -m "feat(companion): add crisis detection utility"
```

---

### Task 2: CrisisResourceCard Component

**Files:**
- Create: `src/components/companion/CrisisResourceCard.tsx`

- [ ] **Step 1: Create `CrisisResourceCard.tsx`**

```typescript
// src/components/companion/CrisisResourceCard.tsx

import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { PhoneIcon, XIcon, ChatCircleIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import type { CrisisCategory } from '@/lib/crisis-detection';

interface Props {
  categories: CrisisCategory[];
  onDismiss: () => void;
}

const RESOURCES = [
  {
    label: '988 Suicide & Crisis Lifeline',
    sublabel: 'Call or text 988',
    url: 'tel:988',
    categories: ['suicide', 'self_harm'] as CrisisCategory[],
  },
  {
    label: 'Crisis Text Line',
    sublabel: 'Text HOME to 741741',
    url: 'sms:741741?body=HOME',
    categories: ['suicide', 'self_harm'] as CrisisCategory[],
  },
  {
    label: 'National DV Hotline',
    sublabel: '1-800-799-7233',
    url: 'tel:18007997233',
    categories: ['abuse'] as CrisisCategory[],
  },
];

export function CrisisResourceCard({ categories, onDismiss }: Props) {
  const { colors } = useTheme();

  // Show resources relevant to detected categories
  const relevant = RESOURCES.filter((r) =>
    r.categories.some((c) => categories.includes(c))
  );

  // If suicide/self_harm detected, always show all non-abuse resources
  // If abuse detected, always show DV hotline
  // If both, show all
  const showAll = categories.includes('suicide') || categories.includes('self_harm');
  const displayed = showAll
    ? RESOURCES.filter((r) => !r.categories.includes('abuse') || categories.includes('abuse'))
    : relevant;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        backgroundColor: colors.backgroundElevated,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: colors.error,
        padding: 16,
      }}
    >
      {/* Dismiss button */}
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 1 }}
        accessibilityLabel="Dismiss crisis resources"
      >
        <XIcon size={16} color={colors.textMuted} weight="light" />
      </TouchableOpacity>

      <Text
        style={{
          fontFamily: FontFamily.bodyMedium,
          fontSize: 14,
          color: colors.text,
          marginBottom: 12,
          paddingRight: 24,
        }}
      >
        You're not alone. These people are trained to help.
      </Text>

      {displayed.map((resource) => (
        <TouchableOpacity
          key={resource.url}
          onPress={() => Linking.openURL(resource.url)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
          }}
        >
          {resource.url.startsWith('tel:') ? (
            <PhoneIcon size={16} color={colors.accent} weight="light" />
          ) : (
            <ChatCircleIcon size={16} color={colors.accent} weight="light" />
          )}
          <View style={{ marginLeft: 12 }}>
            <Text
              style={{
                fontFamily: FontFamily.bodyMedium,
                fontSize: 14,
                color: colors.accent,
              }}
            >
              {resource.label}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              {resource.sublabel}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/CrisisResourceCard.tsx
git commit -m "feat(companion): add CrisisResourceCard component"
```

---

### Task 3: Store Updates — `makeId` Export + `showCrisisResources` Field

**Files:**
- Modify: `src/lib/companion-chat-store.ts:23-32,46`

- [ ] **Step 1: Export `makeId` and add `showCrisisResources` to `CompanionMessage`**

In `companion-chat-store.ts`:

1. Change line 46 from `const makeId` to `export const makeId`:
```typescript
export const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
```

2. Add `showCrisisResources` to the `CompanionMessage` interface after `feedback`:
```typescript
export interface CompanionMessage {
  id: string;
  role: 'user' | 'companion';
  content: string;
  timestamp: number;
  status: MessageStatus;
  citations?: Citation[];
  suggestions?: string[];
  feedback?: 'positive' | 'negative' | null;
  showCrisisResources?: boolean;
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/lib/companion-chat-store.ts
git commit -m "feat(companion): export makeId, add showCrisisResources to message type"
```

---

### Task 4: Banned Phrase Output Check

**Files:**
- Modify: `src/constants/persona.ts`

- [ ] **Step 1: Add `checkBannedPhrases` function**

Add at the bottom of `persona.ts`, before the closing (after `buildPromptWithPersona`):

```typescript
// ---------------------------------------------------------------------------
// Output check — telemetry for banned phrase detection in AI responses
// ---------------------------------------------------------------------------

/**
 * Check AI response text for banned phrases.
 * Returns array of violations found. Telemetry only — do NOT block responses.
 */
export function checkBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return (BANNED_PHRASES as readonly string[]).filter((phrase) => {
    // Word boundary for single-word phrases to reduce noise
    if (!phrase.includes(' ')) {
      return new RegExp(`\\b${phrase.toLowerCase()}\\b`, 'i').test(text);
    }
    return lower.includes(phrase.toLowerCase());
  });
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/constants/persona.ts
git commit -m "feat(companion): add checkBannedPhrases telemetry function"
```

---

### Task 5: Fix Verse Regex in companion-memory.ts

**Files:**
- Modify: `src/lib/companion-memory.ts:72-82`

- [ ] **Step 1: Replace verse regex and fix lastIndex bug**

In `companion-memory.ts`, replace the verse extraction block (lines ~72-82):

```typescript
  // Extract verse references from all messages
  const newVerses: string[] = [];
  for (const msg of messages) {
    // Instantiate inside loop to avoid g-flag lastIndex carry-over between messages
    const versePattern = /\[((?:[1-3]\s)?[A-Z][a-zA-Z]+(?:\s(?:of\s)?[a-zA-Z]+)*\s\d+:\d+(?:-\d+)?)\]/g;
    let match;
    while ((match = versePattern.exec(msg.content)) !== null) {
      const ref = match[1];
      if (!existing.versesMentioned.includes(ref) && !newVerses.includes(ref)) {
        newVerses.push(ref);
      }
    }
  }
```

Key changes:
1. Regex now supports multi-word books ("1 Corinthians", "Song of Solomon")
2. Regex instantiated inside the loop to reset `lastIndex` per message

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/lib/companion-memory.ts
git commit -m "fix(companion): verse regex supports multi-word books, fixes lastIndex bug"
```

---

### Task 6: Harden `useCompanionChat` Hook

This is the largest task — applies unmount cleanup, rapid-send guard, offline check, retry, crisis detection, banned phrase logging, and makeId.

**Files:**
- Modify: `src/lib/use-companion-chat.ts`

- [ ] **Step 1: Add imports**

Add these imports at the top of `use-companion-chat.ts`:

```typescript
import { useEffect } from 'react';  // add to existing import from 'react'
import { makeId } from './companion-chat-store';
import { isOnline, analyzeNetworkError } from '@/lib/network-error-handler';
import { detectCrisis } from '@/lib/crisis-detection';
import { checkBannedPhrases } from '@/constants/persona';
```

Update the existing `react` import to include `useEffect`:
```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
```

- [ ] **Step 2: Add unmount cleanup + rapid-send ref**

Inside the `useCompanionChat` function body, after the existing `const abortRef` and `streamingIdRef`, add:

```typescript
  const isSendingRef = useRef(false);

  // Abort streaming on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
```

- [ ] **Step 3: Replace sendMessage guard and message IDs**

In the `sendMessage` callback:

1. Replace the early return guard (line ~257):
```typescript
  // OLD: if (!text.trim() || isStreaming) return;
  if (!text.trim() || isSendingRef.current) return;
  isSendingRef.current = true;
```

2. Replace message ID generation (lines ~263-273):
```typescript
      // Crisis detection on user input
      const crisisResult = detectCrisis(text);

      // User message
      const userMsg: CompanionMessage = {
        id: makeId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
        status: 'sent',
        showCrisisResources: crisisResult.detected ? true : undefined,
      };
      addMessage(userMsg);

      // Companion placeholder
      const companionId = makeId();
      const companionMsg: CompanionMessage = {
        id: companionId,
        role: 'companion',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
      };
      addMessage(companionMsg);
      streamingIdRef.current = companionId;
```

- [ ] **Step 4: Add offline check before fetch**

Right after `const headers = await getAuthHeaders();` (line ~311), add:

```typescript
        // Offline check before attempting network requests
        if (!(await isOnline())) {
          setError("You're offline right now. Try again when you have a connection.");
          updateMessage(companionId, {
            status: 'error',
            content: "You're offline. Check your connection and try again.",
          });
          return;
        }
```

- [ ] **Step 5: Add banned phrase logging after successful response**

After the `updateCompanionMemory(completedMessages)` call (line ~393), add:

```typescript
        // Telemetry: check AI response for banned phrases
        const finalContent = useCompanionChatStore.getState().messages.find(
          (m) => m.id === companionId
        )?.content;
        if (finalContent) {
          const violations = checkBannedPhrases(finalContent);
          if (violations.length > 0) {
            logger.warn('[CompanionChat] Banned phrases in response:', violations);
          }
        }
```

- [ ] **Step 6: Improve error handling with analyzeNetworkError**

In the catch block (line ~396-412), replace the generic error handler:

```typescript
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User stopped — keep whatever was revealed
          const current = useCompanionChatStore
            .getState()
            .messages.find((m) => m.id === companionId);
          updateMessage(companionId, {
            status: current?.content ? 'complete' : 'error',
          });
        } else {
          const analyzed = analyzeNetworkError(err);
          const errorMsg =
            analyzed.type === 'offline'
              ? "You're offline. Check your connection and try again."
              : analyzed.type === 'timeout'
                ? 'Response took too long. Tap to try again.'
                : 'Something went wrong. Tap to retry.';

          logger.warn('[CompanionChat] Error:', analyzed.type, err);
          setError(errorMsg);
          updateMessage(companionId, {
            status: 'error',
            content: errorMsg,
          });
        }
```

- [ ] **Step 7: Add isSendingRef reset in finally block**

Update the `finally` block:

```typescript
      } finally {
        setIsStreaming(false);
        isSendingRef.current = false;
        streamingIdRef.current = null;
        abortRef.current = null;
      }
```

- [ ] **Step 8: Add retryLastMessage function**

After the `stopGeneration` callback, add:

```typescript
  // ── Retry last failed message ────────────────────────────────────────
  const retryLastMessage = useCallback(() => {
    const currentMessages = useCompanionChatStore.getState().messages;
    // Find last user message
    const lastUserMsg = [...currentMessages].reverse().find((m) => m.role === 'user');
    // Find errored companion message
    const erroredMsg = [...currentMessages].reverse().find(
      (m) => m.role === 'companion' && m.status === 'error'
    );

    if (!lastUserMsg) return;

    // Reset the errored message in-place (not remove — avoids FlatList churn)
    if (erroredMsg) {
      updateMessage(erroredMsg.id, { status: 'streaming', content: '' });
    }

    // Re-send
    sendMessage(lastUserMsg.content);
  }, [sendMessage, updateMessage]);
```

- [ ] **Step 9: Update useCallback deps and return value**

Remove `isStreaming` from the `sendMessage` dependency array (the ref replaces it).

Update the return to include `retryLastMessage`:

```typescript
  return {
    messages,
    isStreaming,
    streamingText,
    suggestions,
    error,
    sendMessage,
    stopGeneration,
    clearConversation,
    retryLastMessage,
  };
```

- [ ] **Step 10: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 11: Commit**

```bash
git add src/lib/use-companion-chat.ts
git commit -m "feat(companion): harden chat hook — unmount cleanup, rapid-send guard, offline check, retry, crisis detection, banned phrase logging"
```

---

### Task 7: Wire Up CompanionMessageContent for Retry + Crisis Card

**Files:**
- Modify: `src/components/companion/CompanionMessageContent.tsx`

- [ ] **Step 1: Add retry tap handler to error state**

Add imports:
```typescript
import { TouchableOpacity } from 'react-native';
import { ArrowClockwiseIcon } from 'phosphor-react-native';
```

Update the `Props` interface to add `onRetry`:
```typescript
interface Props {
  message: CompanionMessage;
  showIcon: boolean;
  isStreaming: boolean;
  onVersePress?: (reference: string) => void;
  onRetry?: () => void;
}
```

Update the function signature:
```typescript
export function CompanionMessageContent({ message, showIcon, isStreaming, onVersePress, onRetry }: Props) {
```

Replace the error state rendering block (lines 90-108):
```typescript
        {message.status === 'error' ? (
          <TouchableOpacity
            onPress={onRetry}
            activeOpacity={0.7}
            disabled={!onRetry}
            style={{
              backgroundColor: colors.error + '1A',
              borderRadius: 12,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ArrowClockwiseIcon size={16} color={colors.error} weight="light" />
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 14,
                color: colors.error,
                lineHeight: 20,
                flex: 1,
              }}
            >
              {message.content || 'Something went wrong. Tap to retry.'}
            </Text>
          </TouchableOpacity>
        ) : isComplete && onVersePress ? (
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/companion/CompanionMessageContent.tsx
git commit -m "feat(companion): add tap-to-retry on error messages"
```

---

### Task 8: Wire Up Ask Screen — Crisis Card + Retry

**Files:**
- Modify: `src/app/(tabs)/(ask)/index.tsx`

- [ ] **Step 1: Add imports and crisis state**

Add imports:
```typescript
import { CrisisResourceCard } from '@/components/companion/CrisisResourceCard';
import type { CrisisCategory } from '@/lib/crisis-detection';
```

In the `CompanionScreen` component, destructure `retryLastMessage` from the hook:
```typescript
  const {
    messages,
    isStreaming,
    suggestions,
    error,
    sendMessage,
    stopGeneration,
    retryLastMessage,
  } = useCompanionChat();
```

- [ ] **Step 2: Update MessageItem to pass onRetry**

Update the `MessageItem` component props to include `onRetry`:
```typescript
const MessageItem = React.memo(function MessageItem({
  item,
  index,
  messages,
  isStreaming,
  onVersePress,
  onRetry,
}: {
  item: CompanionMessage;
  index: number;
  messages: CompanionMessage[];
  isStreaming: boolean;
  onVersePress: (reference: string) => void;
  onRetry: () => void;
}) {
```

Pass `onRetry` to `CompanionMessageContent`:
```typescript
      <CompanionMessageContent
        message={item}
        showIcon={isFirstInGroup}
        isStreaming={isThisStreaming}
        onVersePress={onVersePress}
        onRetry={item.status === 'error' ? onRetry : undefined}
      />
```

Add crisis card rendering after the companion message, before the actions:
```typescript
      {/* Crisis resource card — shown if the preceding user message flagged crisis */}
      {item.role === 'companion' && item.status === 'complete' && (() => {
        // Find the user message that triggered this companion response
        const prevUserMsg = messages.slice(index + 1).find((m) => m.role === 'user');
        if (prevUserMsg?.showCrisisResources) {
          return (
            <CrisisResourceCard
              categories={[]} // All categories shown — the card filters internally
              onDismiss={() => {
                // Optional: could clear the flag, but for safety, keep showing
              }}
            />
          );
        }
        return null;
      })()}
      {showActions && (
```

Update memo comparison to include `onRetry`:
```typescript
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.content === next.item.content &&
  prev.item.status === next.item.status &&
  prev.item.feedback === next.item.feedback &&
  prev.isStreaming === next.isStreaming &&
  prev.index === next.index
);
```

- [ ] **Step 3: Pass onRetry through renderItem**

Update the `renderItem` callback:
```typescript
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<CompanionMessage>) => (
      <MessageItem
        item={item}
        index={index}
        messages={invertedMessages}
        isStreaming={isStreaming}
        onVersePress={handleVersePress}
        onRetry={retryLastMessage}
      />
    ),
    [invertedMessages, isStreaming, handleVersePress, retryLastMessage]
  );
```

- [ ] **Step 4: Improve CrisisResourceCard integration**

Actually, the crisis card needs the categories from the user message. Let's refine: store `crisisCategories` on the user message instead of just a boolean.

Update in `companion-chat-store.ts` — change `showCrisisResources?: boolean` to:
```typescript
  crisisCategories?: ('suicide' | 'self_harm' | 'abuse')[];
```

Update in `use-companion-chat.ts` — where crisis is detected:
```typescript
        showCrisisResources: crisisResult.detected ? true : undefined,
        crisisCategories: crisisResult.detected ? crisisResult.categories : undefined,
```

Update the crisis card rendering in `index.tsx`:
```typescript
      {item.role === 'companion' && item.status === 'complete' && (() => {
        const prevUserMsg = messages.slice(index + 1).find((m) => m.role === 'user');
        if (prevUserMsg?.crisisCategories?.length) {
          return (
            <CrisisResourceCard
              categories={prevUserMsg.crisisCategories}
              onDismiss={() => {}}
            />
          );
        }
        return null;
      })()}
```

- [ ] **Step 5: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/app/(tabs)/(ask)/index.tsx src/lib/companion-chat-store.ts src/lib/use-companion-chat.ts
git commit -m "feat(companion): wire crisis card + retry into Ask screen"
```

---

### Task 9: Integration Verification

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit 2>&1 | tail -20`
Expected: 0 errors

- [ ] **Step 2: Build the app**

Run: `npx expo run:ios --device "iPhone 17 Pro"`
Expected: Successful build, app launches

- [ ] **Step 3: Smoke test companion chat**

1. Open Ask tab
2. Send "How do I pray better?" — verify response appears, no crash
3. Send "I don't want to be alive anymore" — verify CrisisResourceCard appears below AI response with 988 hotline
4. Tap the retry button on any error state (simulate by toggling airplane mode)
5. Rapidly tap send — verify only one message appears

- [ ] **Step 4: Screenshot verification**

Run: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(companion): companion chat hardening — crisis detection, retry, offline, rapid-send guard, verse regex, banned phrase telemetry"
```
