# Companion Chat Hardening — Design Spec

**Date:** 2026-03-23
**Status:** Draft (Rev 2 — reviewer fixes applied)
**Goal:** Harden the companion chat feature against safety gaps, edge case crashes, theological errors, and persona drift based on comprehensive code audit + live stress test.

---

## Context

The companion chat ("Ask" tab) is Unfold's AI conversational feature — a faith-focused companion that responds to user questions, provides scripture references, and offers encouragement. It uses Claude Haiku for chat and Grok 4.1 Fast for check-in responses.

A code audit identified 10 edge-case/crash issues, 5 theological safety gaps, and 3 voice enforcement gaps. This spec addresses the P0 and P1 items.

### Priority Key
- **P0** — Ship blocker, implement first
- **P1** — Should fix soon, implement after P0s

---

## 1. Crisis Detection & Safety Response [P0]

### Problem
Users sharing suicidal thoughts, self-harm, or abuse situations get a normal AI response with no crisis resources. This is a critical safety gap for a faith app where people share deep struggles.

### Design

**Client-side keyword detection on user input only** (never on AI responses — the AI may echo crisis language as part of an empathetic acknowledgment):

```
CRISIS_PATTERNS (matched case-insensitively):
  suicide:  "don't want to be alive", "end it all", "kill myself", "want to die",
            "better off dead", "no reason to live", "nobody would miss me"
  self_harm: "cutting myself", "hurt myself", "self-harm", "self harm"
  abuse:    "hits me", "beats me", "abuses me", "he hurts me", "she hurts me",
            "forces me to", "afraid to go home"
```

**Matching rules:** Case-insensitive substring match against user message text. Some patterns like "end it all" may false-positive on benign sentences — this is an accepted trade-off. Better to show resources unnecessarily than miss someone in crisis.

**When detected:**
1. Still send the message to the AI (the user deserves a compassionate response)
2. Set a `showCrisisResources: true` flag on the user's `CompanionMessage` in the store (new boolean field on the `CompanionMessage` type — persists across app restarts via MMKV)
3. Show a **CrisisResourceCard** component below the AI response — not a modal, not blocking
4. The card includes:
   - 988 Suicide & Crisis Lifeline — tappable via `Linking.openURL('tel:988')`
   - Crisis Text Line (text HOME to 741741) — tappable via `Linking.openURL('sms:741741?body=HOME')`
   - National Domestic Violence Hotline — tappable via `Linking.openURL('tel:18007997233')`
   - "You're not alone. These people are trained to help." — short, non-preachy copy
5. Card uses `colors.backgroundElevated` background, subtle `colors.error` left border (4px), standard body font. No alarm iconography — keep it calm.
6. Card is dismissible (X button) but persists in the message thread on re-render thanks to the stored flag
7. The AI system prompt should already handle this well (Claude has safety training), but the resource card is the guardrail

**Where it lives:** New utility `src/lib/crisis-detection.ts` + new component `src/components/companion/CrisisResourceCard.tsx`

**Store change:** Add `showCrisisResources?: boolean` to `CompanionMessage` interface in `companion-chat-store.ts`.

---

## 2. Unmount Cleanup (Memory Leak Fix) [P0]

### Problem
If the user navigates away from the Ask tab while streaming, the fetch continues and `setStreamingText` fires on an unmounted component.

### Design
Add abort cleanup in `useCompanionChat`:

```typescript
// In the hook body, add:
useEffect(() => {
  return () => {
    abortRef.current?.abort();
  };
}, []);
```

**Note:** Implement together with Section 6 (rapid-send guard). The abort triggers the catch/finally path which calls `setIsStreaming(false)` — after Section 6 replaces the `isStreaming` early-return with a ref, this is harmless. But if implemented alone, the state update on unmount may warn. Bundling both changes prevents this.

---

## 3. Verse Regex Fix [P1]

### Problem
Current pattern: `/\[([A-Z1-3][a-z]+ \d+:\d+(?:-\d+)?)\]/g`

Misses: "1 Corinthians 13:4", "Song of Solomon 2:1", "2 Timothy 1:7", "Acts 2:38"

### Design
Replace with: `/\[((?:[1-3]\s)?[A-Z][a-zA-Z]+(?:\s(?:of\s)?[a-zA-Z]+)*\s\d+:\d+(?:-\d+)?)\]/g`

This captures:
- Single-word books: `[Romans 5:8]`
- Numbered books: `[1 Corinthians 13:4]`, `[2 Timothy 1:7]`
- Multi-word books: `[Song of Solomon 2:1]`
- Verse ranges: `[Psalm 23:1-6]`

Update in `companion-memory.ts:72`.

**Important: Reset `lastIndex` between messages.** The `g` flag on a regex causes `exec()` to carry `lastIndex` state across calls. When iterating messages in a loop, the `lastIndex` from a match in message N carries into message N+1, skipping early matches. Fix: instantiate the regex inside the per-message loop body, or reset `versePattern.lastIndex = 0` before each message iteration.

---

## 4. Banned Phrase Output Check [P1]

### Problem
The 40+ `BANNED_PHRASES` in `persona.ts` are prompt-only instructions. The AI can still slip them into responses (especially Grok).

### Design
Add `checkBannedPhrases()` in `persona.ts`:

```typescript
export function checkBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter(phrase => {
    // Use word boundary for single-word phrases to reduce noise
    // ("truly" shouldn't match "untruly" but should match "truly,")
    if (!phrase.includes(' ')) {
      return new RegExp(`\\b${phrase}\\b`, 'i').test(text);
    }
    return lower.includes(phrase.toLowerCase());
  });
}
```

Usage in `use-companion-chat.ts` — after receiving the final response:
- Call `checkBannedPhrases(finalText)`
- If violations found, `logger.warn('[CompanionChat] Banned phrases in response:', violations)`
- Do NOT block the response (the phrases are cringy, not harmful)
- Track violation frequency for future model tuning

This is telemetry, not blocking. Users see the response either way. Expect some noise initially from high-frequency single-word matches — review hit rates after first week and tune the list.

---

## 5. Fix "Tap to Retry" Error UX [P1]

### Problem
Error state sets message content to "Something went wrong. Tap to retry." but there's no tap handler on companion message bubbles.

### Design
Two changes:

**A.** In `CompanionMessageContent`, wrap error-state messages in a `TouchableOpacity` that calls a new `onRetry` callback. Show a small `ArrowClockwiseIcon` (phosphor) next to the error text.

**B.** In `useCompanionChat`, add a `retryLastMessage` function:
- Find the last user message
- Update the errored companion message in-place: reset `status` to `'streaming'`, clear `content` to `''` (do NOT remove the message — avoids needing a new `removeMessage` store method and prevents FlatList key churn)
- Re-send with the last user message content

**Store note:** No new store methods needed. The existing `updateMessage` handles resetting the errored message in-place.

---

## 6. Rapid-Send Guard [P0]

### Problem
`isStreaming` is checked via `useState` which is async. Rapid taps can slip through.

### Design
Add a synchronous ref guard:

```typescript
const isSendingRef = useRef(false);

const sendMessage = useCallback(async (text: string) => {
  if (!text.trim() || isSendingRef.current) return;
  isSendingRef.current = true;
  // ... existing logic ...
  // In finally block:
  isSendingRef.current = false;
}, [/* deps minus isStreaming */]);
```

Remove `isStreaming` from the early return (the ref replaces it). Keep `isStreaming` state for UI (input bar appearance).

**Implement together with Section 2** (unmount cleanup) — see note there.

---

## 7. Offline Detection [P1]

### Problem
Generic "Something went wrong" for all failures. No offline-specific messaging.

### Design
The project already has `src/lib/network-error-handler.ts` which exports `isOnline()` and `analyzeNetworkError()`. Use this existing module instead of raw NetInfo:

```typescript
import { isOnline, analyzeNetworkError } from '@/lib/network-error-handler';

// Before fetch:
if (!(await isOnline())) {
  setError("You're offline. Connect to the internet to chat.");
  updateMessage(companionId, {
    status: 'error',
    content: "You're offline right now. Try again when you have a connection.",
  });
  return;
}
```

In the catch block, use `analyzeNetworkError(err)` to distinguish:
- **Offline**: "You're offline right now."
- **429 rate limit**: "You're sending messages too quickly. Wait a moment and try again."
- **Timeout**: "Response took too long. Try again?"
- **Other**: "Something went wrong. Tap to retry." (existing message)

---

## 8. Message ID Robustness [P1]

### Problem
`Date.now()` can collide on rapid sends.

### Design
The companion chat store already has a `makeId()` function at `companion-chat-store.ts:46`:

```typescript
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
```

Export this function and use it in `use-companion-chat.ts` for user and companion message IDs:

```typescript
import { makeId } from './companion-chat-store';

// Replace:
const userMsg = { id: `${Date.now()}-user`, ... };
const companionId = `${Date.now() + 1}-companion`;

// With:
const userMsg = { id: makeId(), ... };
const companionId = makeId();
```

**Note:** `crypto.randomUUID()` is NOT available in Hermes (RN's JS engine). Do not use it. The existing `makeId()` pattern is sufficient — the `Math.random()` suffix makes collisions astronomically unlikely even within the same millisecond.

---

## Out of Scope

- **Server-side prompt changes** — The backend builds the system prompt; changes there are a separate task
- **Model switching** — Replacing Grok with Claude for check-ins is a cost/quality decision, not a hardening task
- **Verse accuracy verification** — Would require a Bible lookup API call per cited verse; too expensive per-message
- **200-message truncation UX** — Low priority, users unlikely to hit 200 messages
- **FlatList performance optimization** — Low priority, current perf is acceptable

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/lib/crisis-detection.ts` | **NEW** — Crisis keyword detection utility |
| `src/components/companion/CrisisResourceCard.tsx` | **NEW** — Crisis resource card component |
| `src/lib/use-companion-chat.ts` | Unmount cleanup, rapid-send guard, offline check, retry, message IDs, banned phrase logging |
| `src/lib/companion-memory.ts` | Fix verse regex |
| `src/constants/persona.ts` | Add `checkBannedPhrases()` export |
| `src/components/companion/CompanionMessageContent.tsx` | Tap-to-retry on error messages |
| `src/app/(tabs)/(ask)/index.tsx` | Wire up CrisisResourceCard + retry handler |

---

## Testing Checklist

- [ ] Send "I don't want to be alive anymore" — verify CrisisResourceCard appears
- [ ] Send "my husband hits me" — verify crisis card with DV hotline
- [ ] Navigate away during streaming — verify no React warnings, streaming stops
- [ ] Rapid-tap send button — verify only one message sent
- [ ] Turn airplane mode on, send message — verify offline error
- [ ] Trigger an error — verify "tap to retry" works
- [ ] Send message mentioning "1 Corinthians 13:4" — verify verse extracted to memory
- [ ] Check logs after AI response — verify banned phrase detection logging
