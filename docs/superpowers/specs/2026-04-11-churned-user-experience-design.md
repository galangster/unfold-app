# Churned-User Experience & Retention Offers

**Date:** 2026-04-11
**Status:** Draft — awaiting Codex review + user approval
**Scope:** Backend premium gating, mobile surgical creation gates, two retention offer surfaces

---

## Problem

Churned (non-premium) users currently experience two issues:

1. **Backend waste:** The midnight generation cron and push notification system process ALL users regardless of premium status. Non-premium users get "your devotional is ready" notifications for content they can't access — misleading and costly (~$0.60–$2.50/mo per user in generation COGS).

2. **Aggressive mobile UX:** `TrialExpiredOverlay` blocks entire tabs (Today, Companion, Journal) with a full-screen paywall. Users who built up devotionals, journal entries, and notes can't even read their own content. No graceful degradation, no retention pathway.

## Solution: Four Pillars

### Pillar 1: Backend Premium Filter

**Files:** `backend/src/lib/cron.ts`, `backend/src/lib/push-notifications.ts`

**Change:** Before processing each user in `processUserCron()`, join against `syncUsers` to check `isPremium`. Skip generation + notification for non-premium users.

**Implementation:**

In `midnightGenerationCron()` (cron.ts:67), after fetching `configs` from `userGenerationConfig`, look up each user's premium status:

```typescript
// Inside processUserCron(), before finding active devotional:
const [user] = await db
  .select({ isPremium: schema.syncUsers.isPremium })
  .from(schema.syncUsers)
  .where(eq(schema.syncUsers.clerkUserId, config.userId))
  .limit(1);

if (!user?.isPremium) {
  // Non-premium user — skip generation entirely
  return;
}
```

This is a single indexed query per user per cron tick (60s). The `sync_users_clerk_idx` index already exists on `clerkUserId`.

**Notification gating:** `sendGenerationCompleteNotification()` (push-notifications.ts:122) is called from the generation worker after content is produced. Since we skip generation for non-premium users, notifications are implicitly gated. No separate notification check needed — if we don't generate, we don't notify.

**Edge case — re-subscription:** When a churned user resubscribes, the mobile client syncs `isPremium: true` to the backend via the normal sync flow. The next cron tick picks them up and resumes generation. No manual intervention needed.

### Pillar 2: Surgical Creation Gates (Mobile)

**Goal:** Replace tab-level blocking with per-action gates. Churned users can browse ALL existing content but cannot create anything new.

#### What Gets Gated (CREATION actions)

Every action below triggers the `ExclusiveOfferSheet` (if not yet seen) or navigates to `/paywall` (if already seen):

| Action | File | Store Method |
|---|---|---|
| New devotional series | `(today)/index.tsx:444` | `addDevotional()` |
| New journal entry | `(today)/journal.tsx:323` | `addJournalEntry()` |
| Update journal/SOAP/questions | `(today)/journal.tsx` (multiple) | `updateJournalEntry()`, `updateSoapResponse()`, `updateQuestionResponse()` |
| New prayer request | `(today)/journal.tsx:515` | `addPrayerRequest()` |
| Set deeper questions | `(today)/journal.tsx:750` | `setDeeperQuestions()` |
| New note | `(journal)/note-detail.tsx:481` | `addNote()` |
| Edit existing note | `(journal)/note-detail.tsx:475,540,591` | `updateNote()` (content/title changes) |
| New folder | `(journal)/index.tsx:824`, `CreateFolderSheet` | `addFolder()` |
| Rename/edit folder | `(journal)/index.tsx:844` | `updateFolder()` |
| New companion message | `(ask)/index.tsx:208` | `handleSend()` |
| New conversation | `(ask)/index.tsx:336` | `startNewConversation()` |
| Midday check-in | `(today)/index.tsx:480`, `CheckInSheet` | `addCheckIn()` |
| Evening wind-down | `(today)/evening-wind-down.tsx:270` | `addCheckIn()` |
| Inline reflection auto-save | `components/reading/InlineReflectionJournal.tsx:102` | `updateQuestionResponse()` (debounced) |

#### What Stays Free (READ / ANNOTATE actions)

| Action | Why |
|---|---|
| View all past devotionals, days, content | Core read-only promise |
| View all past journal entries and notes | Reading own content |
| View all past companion conversations | Reading own content |
| Highlight in Bible | Bible tab is always free |
| Bible highlight notes | Annotation on free content |
| Bookmark Bible passages | Free tab |
| Highlight in old devotional readings | Annotating existing content (not creating new) |
| Bookmark old devotional readings | Annotating existing content |
| Remove highlights/bookmarks | Cleanup, not creation |
| Delete notes/folders/conversations | Cleanup, not creation |
| Toggle note favorite | Organizing existing content |
| Bible reader settings | Display preferences |
| Check-in schedule settings | Preferences (won't fire without premium anyway) |
| Theme toggle | Display preferences |
| Profile viewing | Always free |

#### Implementation: `useCreationGate` Hook

Central hook in `src/hooks/useCreationGate.ts`:

```typescript
import { useUnfoldStore } from '@/lib/store';
import { useCallback, useState } from 'react';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useRouter } from 'expo-router';

const EXCLUSIVE_OFFER_SEEN_KEY = '@unfold_exclusive_offer_seen';

export function useCreationGate() {
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const router = useRouter();

  const hasSeenOffer = mmkvStorage.getItem(EXCLUSIVE_OFFER_SEEN_KEY) === 'true';

  const gate = useCallback((): boolean => {
    if (isPremium) return true; // allowed
    if (!hasSeenOffer) {
      setShowExclusiveOffer(true);
      return false;
    }
    router.push('/paywall');
    return false;
  }, [isPremium, hasSeenOffer, router]);

  const markOfferSeen = useCallback(() => {
    mmkvStorage.setItem(EXCLUSIVE_OFFER_SEEN_KEY, 'true');
    setShowExclusiveOffer(false);
  }, []);

  const dismissOffer = useCallback(() => {
    markOfferSeen();
    setShowExclusiveOffer(false);
  }, [markOfferSeen]);

  return {
    isPremium,
    gate,
    showExclusiveOffer,
    dismissOffer,
    markOfferSeen,
  };
}
```

**Usage at each gate point:**

```typescript
const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();

const handleCreateNote = () => {
  if (!gate()) return;
  addNote(...);
};

// In JSX:
<ExclusiveOfferSheet
  visible={showExclusiveOffer}
  onDismiss={dismissOffer}
  context="churned"
/>
```

#### Removing TrialExpiredOverlay

In `src/app/(tabs)/_layout.tsx:312-313`, remove the `TrialExpiredOverlay` render and the `FREE_TABS` gating logic. All tabs become accessible. The `TrialExpiredOverlay` component file can be deleted after migration is complete.

### Pillar 3: Exclusive Offer Sheet (Retention Paywall)

**File:** New component at `src/components/ExclusiveOfferSheet.tsx`

**Two contexts, one component:**

| Context | Trigger | Offer | Product |
|---|---|---|---|
| `"onboarding"` | User cancels Apple Pay during onboarding checkout | $59.99/yr (existing `$rc_annual`) framed as "50% OFF" vs monthly ($9.99/mo × 12 = $119.88) | Existing SKU |
| `"churned"` | Non-premium user taps any creation action | $44.99/yr (new `unfold_yearly_winback` product) framed as "25% OFF" vs standard annual ($59.99) | New SKU in ASC + RC |

**One-time enforcement:**
- MMKV key `@unfold_exclusive_offer_seen` — once the sheet is shown (regardless of whether they purchase), it never appears again
- Subsequent creation gates navigate to the standard `/paywall` screen instead
- The onboarding cancellation offer uses a SEPARATE key `@unfold_onboarding_offer_seen` so both offers can fire independently

**Design (forked from TrialExpiredOverlay):**

```
┌─────────────────────────────────┐
│                                 │
│         🎁 (gift icon)          │
│                                 │
│      Exclusive Offer            │  ← Instrument Serif, 4xl
│                                 │
│  Don't miss out on personalized │  ← Body text, textMuted
│  devotionals and AI-powered     │
│  spiritual growth.              │
│                                 │
│  You will not see this          │  ← Urgent, textSubtle, italic
│  offer again.                   │
│                                 │
│  ┌─────────────────────────┐    │
│  │  ◆ 25% OFF              │    │  ← Badge, top-right corner
│  │  Yearly      $44.99     │    │  ← Single plan pill
│  └─────────────────────────────┘│
│                                 │
│  ✓ Cancel anytime               │  ← Reassurance row
│                                 │
│  ┌─────────────────────────┐    │
│  │     Accept Offer         │    │  ← Gold CTA button
│  └─────────────────────────┘    │
│                                 │
│       Restore purchases         │  ← Subtle text link
│                                 │
│     Terms  ·  Privacy           │  ← Legal footer
│                                 │
└─────────────────────────────────┘
```

**Key design decisions:**
- **Solid background** — no transparency (Nick's explicit requirement)
- **No ember particles** — cleaner, more focused. The urgency IS the visual hook.
- **Gift icon** at top (similar to Glowly reference image)
- **Single plan pill** — not a plan selector. One offer, take it or leave it.
- **"25% OFF" badge** (churned) or "50% OFF" badge (onboarding) — top-right of plan pill
- **"You will not see this offer again"** — urgency line, not aggressive but clear
- **"Accept Offer" CTA** — not "Subscribe" or "Start Trial"
- **Restore purchases** link stays (required by Apple)

**Component props:**

```typescript
interface ExclusiveOfferSheetProps {
  visible: boolean;
  onDismiss: () => void;
  context: 'onboarding' | 'churned';
}
```

**RevenueCat integration:**
- `context === 'onboarding'`: Purchase existing `$rc_annual` package from current offering
- `context === 'churned'`: Fetch a separate "winback" offering from RC containing the $44.99/yr product
- Both grant the same "Unfold Premium" entitlement

### Pillar 4: Onboarding Apple Pay Cancellation Flow

**File:** Modify `src/components/onboarding/ThreeStepPaywall.tsx` and/or `src/app/paywall.tsx`

**Trigger:** When `purchasePackage()` rejects with `userCancelled: true`

**Current behavior:** Purchase cancellation is silently swallowed (cron.ts TrialExpiredOverlay line 129: `if (result.reason === 'user_cancelled') { return; }`). User stays on the paywall.

**New behavior:**
1. User taps "Subscribe" or "Start Free Trial" on the paywall
2. Apple Pay sheet appears
3. User taps X to dismiss Apple Pay
4. Check `@unfold_onboarding_offer_seen` in MMKV
5. If NOT seen → show `ExclusiveOfferSheet` with `context="onboarding"` (50% OFF framing)
6. If already seen → return to paywall as before (no change)

**Implementation in paywall purchase handler:**

```typescript
// In the purchase mutation's onSuccess/handling:
if (result.reason === 'user_cancelled') {
  const hasSeenOnboardingOffer =
    mmkvStorage.getItem('@unfold_onboarding_offer_seen') === 'true';
  if (!hasSeenOnboardingOffer) {
    setShowExclusiveOffer(true);
    mmkvStorage.setItem('@unfold_onboarding_offer_seen', 'true');
  }
  return;
}
```

---

## RevenueCat Setup Required

### New Product in App Store Connect

| Field | Value |
|---|---|
| Reference Name | Unfold Premium Yearly Win-Back |
| Product ID | `unfold_yearly_winback` |
| Price | $44.99/yr |
| Subscription Group | Same group as existing products |
| Intro Offer | None (this IS the discount) |

### New Offering in RevenueCat

| Field | Value |
|---|---|
| Offering ID | `winback` |
| Description | Discounted annual for churned user retention |
| Package | `$rc_annual_winback` → maps to `unfold_yearly_winback` ASC product |

### Entitlement

Same "Unfold Premium" entitlement as all other products. No separate entitlement tier — a subscriber is a subscriber.

---

## Debug Tooling

### New Debug Toggles (in Dev Tools, `(you)/index.tsx`)

1. **"Simulate Win-back Offer (Dev)"** — sets `debugForceWinbackOffer` in `ui-state.ts`, shows `ExclusiveOfferSheet` with `context="churned"` on next creation gate tap
2. **"Reset Exclusive Offers (Dev)"** — clears both MMKV keys (`@unfold_exclusive_offer_seen` and `@unfold_onboarding_offer_seen`) so offers can be re-tested
3. **Existing "Simulate Trial Expired Overlay" toggle** — will be repurposed to "Simulate Churned User (Dev)" which sets `isPremium: false` in the store for testing creation gates without a real subscription change

### New UI State Fields

```typescript
// In ui-state.ts:
debugForceWinbackOffer: boolean;
setDebugForceWinbackOffer: (value: boolean) => void;
```

---

## File Change Summary

| File | Change |
|---|---|
| `backend/src/lib/cron.ts` | Add `isPremium` check in `processUserCron()` |
| `backend/src/lib/push-notifications.ts` | No change needed (gated implicitly by skipping generation) |
| `src/components/ExclusiveOfferSheet.tsx` | **NEW** — retention offer component |
| `src/hooks/useCreationGate.ts` | **NEW** — centralized creation gate hook |
| `src/components/TrialExpiredOverlay.tsx` | **DELETE** after migration |
| `src/app/(tabs)/_layout.tsx` | Remove TrialExpiredOverlay render + FREE_TABS logic |
| `src/app/(tabs)/(today)/index.tsx` | Add creation gates on new series, check-in |
| `src/app/(tabs)/(today)/journal.tsx` | Add creation gates on journal entry, SOAP, questions, prayer |
| `src/app/(tabs)/(today)/evening-wind-down.tsx` | Remove `if (!isPremium) return;` early exit, add creation gate on `addCheckIn()` only |
| `src/app/(tabs)/(ask)/index.tsx` | Replace existing `canSendCompanionMessage` gate with `useCreationGate` FIRST, then daily limit check for free-tier users who haven't churned |
| `src/components/reading/InlineReflectionJournal.tsx` | Add creation gate on `updateQuestionResponse()` debounced save |
| `src/app/(tabs)/(journal)/index.tsx` | Add creation gates on folder create/rename |
| `src/app/(tabs)/(journal)/note-detail.tsx` | Add creation gates on note create/edit |
| `src/components/notebook/CreateFolderSheet.tsx` | Add creation gate |
| `src/components/CheckInSheet.tsx` | Add creation gate |
| `src/app/paywall.tsx` | Add onboarding cancellation → exclusive offer flow |
| `src/components/onboarding/ThreeStepPaywall.tsx` | Add onboarding cancellation → exclusive offer flow |
| `src/lib/ui-state.ts` | Add `debugForceWinbackOffer` |
| `src/app/(tabs)/(you)/index.tsx` | Add debug toggle buttons |
| `src/lib/premium-gating.ts` | No changes — existing limits remain for free-tier users |

---

## Edge Cases

1. **User resubscribes mid-session:** RevenueCat listener (`useRevenueCatSync.ts:63`) fires, updates `isPremium: true` in store. All creation gates instantly unlock. No app restart needed.

2. **Race condition — offer shown but purchase in flight:** The `ExclusiveOfferSheet` handles its own purchase mutation. If the user taps "Accept Offer" and then backgrounds the app, the mutation completes asynchronously. On success, `isPremium` updates via the RC listener.

3. **Churned user with no existing content:** Still sees the exclusive offer on first creation attempt. The read-only browsing experience is empty but not broken.

4. **"You will not see this offer again" — but user didn't dismiss, app crashed:** MMKV key is written when the sheet MOUNTS, not when dismissed. If the app crashes mid-offer, the key is already set. This is intentional — "you will not see this offer again" is a promise, not a threat.

5. **Multiple devices:** MMKV is local. A user could see the exclusive offer once per device. This is acceptable — it's still a one-time-per-device offer, and cross-device sync of this flag would require backend changes not worth the complexity.

6. **Companion gate ordering:** The existing `canSendCompanionMessage()` check (5/day limit) must run AFTER `useCreationGate`. Gate priority: (1) `isPremium` check via `useCreationGate` → show exclusive offer or paywall, (2) THEN daily limit check via `canSendCompanionMessage()` for users who are free-tier but haven't churned. This prevents churned users from seeing the generic "5/day limit" sheet instead of the exclusive offer.

7. **Evening wind-down full-page block:** Currently `evening-wind-down.tsx` has `if (!isPremium) return;` at line 147 which blocks the entire page. This must be replaced — churned users should see the wind-down page (read existing check-ins) but hit `useCreationGate` when tapping the "Submit" button. Remove the early return, gate only `addCheckIn()`.

8. **InlineReflectionJournal debounced auto-save:** This component auto-saves via `updateQuestionResponse()` on a debounce as the user types. For churned users, the text input should be disabled or the save should be gated. Simplest approach: disable the TextInput when `!isPremium`, show a tap-to-upgrade prompt instead.

9. **Onboarding offer + churned offer independence:** A user can see the onboarding offer (cancel Apple Pay during onboarding), then later churn and see the churned offer. Two separate MMKV keys, two separate one-time offers. This is intentional — they're different moments in the user lifecycle.

10. **Multiple devices:** MMKV is local. A user could see the exclusive offer once per device. This is acceptable — it's still a one-time-per-device offer, and cross-device sync of this flag would require backend changes not worth the complexity.

---

## What This Does NOT Cover

- **RevenueCat webhook for server-side premium sync** — deferred to 10K+ DAU scale. Current client-synced `isPremium` is sufficient.
- **Win-back push notifications** — strategic "come back" notifications for churned users. Separate feature, uses `notificationSchedule` jsonb field (provisioned but unused).
- **Promotional offer codes** — Apple's promotional offer system for targeted discounts. Separate from in-app retention offers.
- **Analytics/tracking** — event logging for offer impressions, acceptance rates, gate hits. Should be added but is out of scope for this spec.
