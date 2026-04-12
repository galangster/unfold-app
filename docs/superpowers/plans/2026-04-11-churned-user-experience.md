# Churned-User Experience & Retention Offers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tab-level blocking with surgical creation gates, add one-time retention offers at two conversion points, and stop wasting backend COGS on non-premium users.

**Architecture:** Four pillars executed in dependency order: (1) backend premium filter on cron, (2) new `useCreationGate` hook + `ExclusiveOfferSheet` component, (3) wire gates into every creation entry point + remove `TrialExpiredOverlay`, (4) intercept Apple Pay cancellation during onboarding for a separate retention offer. Debug tooling added throughout.

**Tech Stack:** React Native / Expo, Zustand (MMKV-persisted), RevenueCat SDK, TanStack Query, Drizzle ORM (backend), Expo Notifications

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `backend/src/lib/cron.ts` | Midnight generation cron — add `isPremium` filter | Modify |
| `src/hooks/useCreationGate.ts` | Central hook: checks premium, shows offer or routes to paywall | Create |
| `src/components/ExclusiveOfferSheet.tsx` | One-time retention offer (two contexts: onboarding / churned) | Create |
| `src/lib/ui-state.ts` | Ephemeral debug flags | Modify |
| `src/app/(tabs)/_layout.tsx` | Remove `TrialExpiredOverlay` + `FREE_TABS` gating | Modify |
| `src/app/(tabs)/(today)/index.tsx` | Gate new series + check-in | Modify |
| `src/app/(tabs)/(today)/journal.tsx` | Gate journal entry + SOAP + questions + prayer | Modify |
| `src/app/(tabs)/(today)/evening-wind-down.tsx` | Remove full-page block, gate `addCheckIn` only | Modify |
| `src/app/(tabs)/(ask)/index.tsx` | Reorder gates: creation gate → daily limit | Modify |
| `src/app/(tabs)/(journal)/index.tsx` | Gate folder create/rename | Modify |
| `src/app/(tabs)/(journal)/note-detail.tsx` | Gate note create/edit | Modify |
| `src/components/notebook/CreateFolderSheet.tsx` | Gate folder creation | Modify |
| `src/components/CheckInSheet.tsx` | Gate check-in submission | Modify |
| `src/components/reading/InlineReflectionJournal.tsx` | Disable input for non-premium | Modify |
| `src/app/paywall.tsx` | Intercept `user_cancelled` → show onboarding offer | Modify |
| `src/components/onboarding/ThreeStepPaywall.tsx` | Intercept `user_cancelled` → show onboarding offer | Modify |
| `src/app/(tabs)/(you)/index.tsx` | Add debug toggles | Modify |
| `src/components/TrialExpiredOverlay.tsx` | Delete after all gates are wired | Delete |

---

## Task 1: Backend Premium Filter on Cron

**Files:**
- Modify: `backend/src/lib/cron.ts:187-214`

- [ ] **Step 1: Add isPremium lookup to processUserCron**

In `backend/src/lib/cron.ts`, add the premium check at the TOP of `processUserCron()`, before the devotional query (currently at line 195). This is the earliest possible bail-out — skips all DB queries, generation, and notifications for non-premium users.

```typescript
// Add import at top of file (schema is already imported):
// No new imports needed — schema and eq are already imported

// Inside processUserCron(), add BEFORE the devotional query (line 195):
async function processUserCron(
  db: NonNullable<typeof _db>,
  config: schema.UserGenerationConfig,
  now: Date
): Promise<void> {
  const tz = config.timezone || "America/Chicago";

  // ── Premium gate: skip generation for non-premium users ──
  const [syncUser] = await db
    .select({ isPremium: schema.syncUsers.isPremium })
    .from(schema.syncUsers)
    .where(eq(schema.syncUsers.clerkUserId, config.userId))
    .limit(1);

  if (!syncUser?.isPremium) {
    return;
  }

  // Find their active progressive devotional (existing code continues...)
  const [devotional] = await db
  // ... rest of existing function unchanged
```

- [ ] **Step 2: Verify the change compiles**

Run:
```bash
cd ~/clawd/work/unfold/backend && npx tsc --noEmit
```
Expected: No errors. The `syncUsers` table and `isPremium` column already exist in the schema (schema.ts:107-138). The `eq` import is already present (line 16).

- [ ] **Step 3: Commit**

```bash
cd ~/clawd/work/unfold/backend
git add src/lib/cron.ts
git commit -m "feat(backend): gate midnight cron on isPremium — skip generation for churned users"
```

---

## Task 2: Create useCreationGate Hook

**Files:**
- Create: `src/hooks/useCreationGate.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useCreationGate.ts

import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { mmkvStorage } from '@/lib/mmkv-storage';

const EXCLUSIVE_OFFER_SEEN_KEY = '@unfold_exclusive_offer_seen';

/**
 * Checks premium status before any creation action.
 * Returns `gate()` — call it before writes. Returns true if allowed.
 * If not allowed, shows ExclusiveOfferSheet (first time) or navigates to /paywall.
 *
 * Render <ExclusiveOfferSheet visible={showExclusiveOffer} onDismiss={dismissOffer} context="churned" />
 * in the same component that calls this hook.
 */
export function useCreationGate() {
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const effectivePremium = debugForceTrialExpired ? false : __DEV__ ? true : isPremium;

  const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
  const router = useRouter();

  const gate = useCallback((): boolean => {
    if (effectivePremium) return true;

    const hasSeenOffer = mmkvStorage.getItem(EXCLUSIVE_OFFER_SEEN_KEY) === 'true';
    if (!hasSeenOffer) {
      setShowExclusiveOffer(true);
      return false;
    }
    router.push('/paywall');
    return false;
  }, [effectivePremium, router]);

  const dismissOffer = useCallback(() => {
    mmkvStorage.setItem(EXCLUSIVE_OFFER_SEEN_KEY, 'true');
    setShowExclusiveOffer(false);
  }, []);

  return {
    isPremium: effectivePremium,
    gate,
    showExclusiveOffer,
    dismissOffer,
  };
}
```

Key decisions:
- `effectivePremium` mirrors the same DEV bypass logic from `_layout.tsx:308` — in `__DEV__`, premium defaults to true unless `debugForceTrialExpired` is set. This ensures the debug toggle works the same way everywhere.
- `hasSeenOffer` is read inside `gate()` (not in render) so it picks up the latest MMKV state synchronously on every call.
- The hook returns `showExclusiveOffer` state and `dismissOffer` — the parent component is responsible for rendering `<ExclusiveOfferSheet>`.

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreationGate.ts
git commit -m "feat: add useCreationGate hook — central premium gate for creation actions"
```

---

## Task 3: Create ExclusiveOfferSheet Component

**Files:**
- Create: `src/components/ExclusiveOfferSheet.tsx`

This is a full-screen modal forked from `TrialExpiredOverlay.tsx` with these changes:
- Two contexts: `'onboarding'` (50% OFF, existing annual) and `'churned'` (25% OFF, winback product)
- Gift icon instead of app icon
- "You will not see this offer again" urgency line
- Single plan pill with discount badge
- No ember particles (cleaner, more focused)
- Solid background, no transparency

- [ ] **Step 1: Create the component**

```typescript
// src/components/ExclusiveOfferSheet.tsx

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Linking,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatEnabled,
  hasActiveSubscription,
} from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';
import { useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration } from '@/constants/animations';
import { Gift } from 'phosphor-react-native';
import { logger } from '@/lib/logger';

interface ExclusiveOfferSheetProps {
  visible: boolean;
  onDismiss: () => void;
  context: 'onboarding' | 'churned';
}

export function ExclusiveOfferSheet({ visible, onDismiss, context }: ExclusiveOfferSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOnboarding = context === 'onboarding';
  const discountLabel = isOnboarding ? '50% OFF' : '25% OFF';

  // Fetch offerings — for churned context, look for 'winback' offering
  const { data: offeringsResult, isLoading: isLoadingOfferings } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: visible && isRevenueCatEnabled(),
    staleTime: 1000 * 60 * 10,
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;

  // Onboarding: use existing annual from default offering
  // Churned: use winback offering's package
  const targetPackage: PurchasesPackage | undefined = isOnboarding
    ? offerings?.current?.availablePackages.find((pkg) => pkg.identifier === '$rc_annual')
    : offerings?.all?.['winback']?.availablePackages?.[0];

  const priceString = targetPackage?.product.priceString ?? '';
  const periodLabel = '/year';

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: async (result) => {
      if (result.ok) {
        const subscriptionResult = await hasActiveSubscription();
        if (subscriptionResult.ok) {
          updateUser({ isPremium: subscriptionResult.data });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        setErrorMessage(null);
        onDismiss();
      } else if (result.reason === 'user_cancelled') {
        return;
      } else {
        logger.log('[ExclusiveOffer] Purchase failed:', JSON.stringify(result));
        setErrorMessage('Something went wrong. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    onError: (error) => {
      logger.log('[ExclusiveOffer] Purchase error:', error);
      setErrorMessage('Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (result) => {
      if (result.ok) {
        const subscriptionResult = await hasActiveSubscription();
        if (subscriptionResult.ok) {
          updateUser({ isPremium: subscriptionResult.data });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
        onDismiss();
      } else {
        setErrorMessage('No active subscription found.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    },
    onError: () => {
      setErrorMessage('Could not restore purchases. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending;

  const handleAccept = () => {
    if (isPurchasing || !targetPackage) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    purchaseMutation.mutate(targetPackage);
  };

  const handleRestore = () => {
    if (isPurchasing) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    restoreMutation.mutate();
  };

  const handleDismiss = () => {
    if (isPurchasing) return;
    onDismiss();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={handleDismiss}>
      <Animated.View
        entering={FadeIn.duration(Duration.normal)}
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        <View style={[styles.content, { paddingTop: insets.top + Spacing['16'] }]}>
          {/* Gift icon */}
          <View style={[styles.giftContainer, { backgroundColor: `${colors.accent}15` }]}>
            <Gift size={36} color={colors.accent} weight="fill" />
          </View>

          {/* Headline */}
          <Text style={[styles.headline, { color: colors.text }]}>
            Exclusive Offer
          </Text>

          {/* Body */}
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {isOnboarding
              ? "Don't miss out on personalized devotionals and AI-powered spiritual growth."
              : 'Your devotionals and journal are still here. Pick up where you left off.'}
          </Text>

          {/* Urgency line */}
          <Text style={[styles.urgency, { color: colors.textSubtle }]}>
            You will not see this offer again.
          </Text>

          {/* Plan pill */}
          <View style={[styles.planPill, { borderColor: colors.accent, backgroundColor: `${colors.accent}08` }]}>
            <Text style={[styles.planLabel, { color: colors.text }]}>Yearly</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] }}>
              <Text style={[styles.planPrice, { color: colors.text }]}>
                {priceString}{periodLabel}
              </Text>
            </View>
            {/* Discount badge */}
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Text style={[styles.badgeText, { color: isDark ? '#0A0A0A' : '#FFFFFF' }]}>
                {discountLabel}
              </Text>
            </View>
          </View>

          {/* Cancel anytime */}
          <View style={styles.reassuranceRow}>
            <Text style={[styles.reassuranceText, { color: colors.textMuted }]}>
              ✓ Cancel anytime
            </Text>
          </View>

          {/* Error */}
          {errorMessage && (
            <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
          )}
        </View>

        {/* Bottom CTA */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + Spacing['4'] }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleAccept}
            disabled={isPurchasing || isLoadingOfferings || !targetPackage}
            style={[styles.ctaButton, { backgroundColor: colors.accent }, isPurchasing && styles.disabled]}
          >
            {isPurchasing ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={[styles.ctaText, { color: isDark ? '#0A0A0A' : '#FFFFFF' }]}>
                {isLoadingOfferings ? 'Loading...' : 'Accept Offer'}
              </Text>
            )}
          </TouchableOpacity>

          {/* No thanks */}
          <TouchableOpacity activeOpacity={0.7} onPress={handleDismiss} style={styles.dismissButton}>
            <Text style={[styles.dismissText, { color: colors.textSubtle }]}>No thanks</Text>
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity activeOpacity={0.7} onPress={handleRestore} disabled={isPurchasing} style={styles.restoreButton}>
            <Text style={[styles.restoreText, { color: colors.textSubtle }]}>Restore purchases</Text>
          </TouchableOpacity>

          {/* Legal */}
          <View style={styles.legalRow}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
              <Text style={[styles.legalText, { color: colors.textHint }]}>Terms</Text>
            </TouchableOpacity>
            <Text style={[styles.legalSep, { color: colors.textHint }]}>{'\u00B7'}</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL('https://useunfold.com/privacy')}>
              <Text style={[styles.legalText, { color: colors.textHint }]}>Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing['7'],
    alignItems: 'center',
  },
  giftContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['6'],
  },
  headline: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['4xl'],
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: Spacing['4'],
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing['4'],
  },
  urgency: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: Spacing['3'],
    marginBottom: Spacing['8'],
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: Radius.card,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['5'],
    width: '100%',
    position: 'relative',
  },
  planLabel: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  planPrice: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 12,
    paddingHorizontal: Spacing['2'],
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  reassuranceRow: {
    marginTop: Spacing['3'],
  },
  reassuranceText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  errorText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing['3'],
  },
  bottomArea: {
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['4'],
  },
  ctaButton: {
    paddingVertical: Spacing['4'],
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
    letterSpacing: 0.2,
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    marginTop: Spacing['2'],
  },
  dismissText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: Spacing['2'],
  },
  restoreText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing['1'],
    gap: Spacing['2'],
  },
  legalText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  legalSep: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ExclusiveOfferSheet.tsx
git commit -m "feat: add ExclusiveOfferSheet — one-time retention offer for onboarding + churned users"
```

---

## Task 4: Add Debug Tooling

**Files:**
- Modify: `src/lib/ui-state.ts`
- Modify: `src/app/(tabs)/(you)/index.tsx`

- [ ] **Step 1: Add debug state to ui-state.ts**

Add new field after `debugForceTrialExpired` (line 16):

```typescript
// In the create<> type definition, add after debugForceTrialExpired:
debugForceWinbackOffer: boolean;
setDebugForceWinbackOffer: (value: boolean) => void;

// In the store initializer, add after setDebugForceTrialExpired:
debugForceWinbackOffer: false,
setDebugForceWinbackOffer: (value) => set({ debugForceWinbackOffer: value }),
```

- [ ] **Step 2: Add debug buttons to (you)/index.tsx Dev Tools section**

After the existing "Simulate Trial Expired Overlay" button (after line 2056), add two new buttons:

```tsx
{/* Simulate win-back exclusive offer on next creation gate */}
<TouchableOpacity
  activeOpacity={0.7}
  onPress={() => {
    // Clear the MMKV "seen" key so the offer shows again
    mmkvStorage.removeItem('@unfold_exclusive_offer_seen');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Reset', 'Exclusive offer reset. Enable "Simulate Trial Expired" then tap any creation action to see the win-back offer.');
  }}
  style={{
    padding: Spacing['4'],
    borderRadius: Radius.md,
    backgroundColor: 'rgba(200, 165, 92, 0.1)',
    alignItems: 'center',
    marginBottom: Spacing['3'],
  }}
>
  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
    Reset Exclusive Offers (Dev)
  </Text>
</TouchableOpacity>

{/* Reset onboarding offer too */}
<TouchableOpacity
  activeOpacity={0.7}
  onPress={() => {
    mmkvStorage.removeItem('@unfold_onboarding_offer_seen');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Reset', 'Onboarding exclusive offer reset. Cancel Apple Pay on the paywall to see it.');
  }}
  style={{
    padding: Spacing['4'],
    borderRadius: Radius.md,
    backgroundColor: 'rgba(200, 165, 92, 0.1)',
    alignItems: 'center',
    marginBottom: Spacing['3'],
  }}
>
  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
    Reset Onboarding Offer (Dev)
  </Text>
</TouchableOpacity>
```

Also add `mmkvStorage` import at the top of the file:
```typescript
import { mmkvStorage } from '@/lib/mmkv-storage';
```

- [ ] **Step 3: Update the existing trial expired button label**

Change the label from "Simulate Trial Expired Overlay (Dev)" to "Simulate Churned User (Dev)" since it now controls creation gates, not just the overlay:

```typescript
// Line 2054 — update the label text:
{debugForceTrialExpired ? '✓ Churned User ON — tap to clear' : 'Simulate Churned User (Dev)'}
```

- [ ] **Step 4: Verify it compiles**

Run:
```bash
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui-state.ts src/app/\(tabs\)/\(you\)/index.tsx
git commit -m "feat: add debug toggles for win-back offer + reset exclusive offers"
```

---

## Task 5: Remove TrialExpiredOverlay + FREE_TABS from Tab Layout

**Files:**
- Modify: `src/app/(tabs)/_layout.tsx`

This is the critical swap: remove tab-level blocking, make all tabs browsable for everyone.

- [ ] **Step 1: Remove TrialExpiredOverlay import and render**

In `src/app/(tabs)/_layout.tsx`:

1. Remove the import (line 20):
```typescript
// DELETE: import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';
```

2. Remove the `FREE_TABS` constant (line 297):
```typescript
// DELETE: const FREE_TABS = new Set(['(bible)', '(you)']);
```

3. Remove `shouldShowPaywall` computation and the overlay render (lines 312-313, 360):
```typescript
// DELETE: const shouldShowPaywall = !isPremium && hasCompletedOnboarding && !FREE_TABS.has(activeTabName);
// DELETE: {shouldShowPaywall && <TrialExpiredOverlay />}
```

4. Keep the `isPremium`, `debugForceTrialExpired`, and `activeTabName` state — they're still used by the debug toggle and may be used elsewhere. Only remove the overlay-specific logic.

- [ ] **Step 2: Verify it compiles and the app renders**

Run:
```bash
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(tabs\)/_layout.tsx
git commit -m "feat: remove TrialExpiredOverlay tab blocking — all tabs now browsable for churned users"
```

---

## Task 6: Wire Creation Gates — Today Tab

**Files:**
- Modify: `src/app/(tabs)/(today)/index.tsx`

- [ ] **Step 1: Add useCreationGate + ExclusiveOfferSheet to Today tab**

Add imports:
```typescript
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
```

Add the hook call near other hooks:
```typescript
const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
```

- [ ] **Step 2: Gate handleCreateNew**

Replace the existing premium check in `handleCreateNew` (lines 444-447):

```typescript
// BEFORE:
if (!isPremium && devotionals.length >= 1) {
  setShowPremiumSheet(true);
  return;
}

// AFTER:
if (!gate()) return;
```

- [ ] **Step 3: Gate handleCheckIn**

Wrap `handleCheckIn` (line 468):

```typescript
const handleCheckIn = () => {
  if (!gate()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setShowCheckInSheet(true);
};
```

- [ ] **Step 4: Add ExclusiveOfferSheet render**

Add before the closing `</>` or `</View>` of the component's JSX return:

```tsx
<ExclusiveOfferSheet
  visible={showExclusiveOffer}
  onDismiss={dismissOffer}
  context="churned"
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(tabs\)/\(today\)/index.tsx
git commit -m "feat: gate new series + check-in with useCreationGate on Today tab"
```

---

## Task 7: Wire Creation Gates — Journal Tab (Devotional Journal)

**Files:**
- Modify: `src/app/(tabs)/(today)/journal.tsx`

- [ ] **Step 1: Add hook + imports**

```typescript
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

// Inside component:
const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
```

- [ ] **Step 2: Gate all journal write actions**

Find every place that calls `addJournalEntry`, `updateJournalEntry`, `updateSoapResponse`, `updateQuestionResponse`, `addPrayerRequest`, or `setDeeperQuestions` and wrap with `if (!gate()) return;`.

The primary entry point is the save function — add the gate at the TOP of each save handler:

For SOAP field saves (lines ~374, 472, 487 — the `handleSoapSave` or inline callbacks):
```typescript
// Add at top of each SOAP save callback:
if (!gate()) return;
```

For question response saves (line ~562):
```typescript
if (!gate()) return;
```

For prayer request (line ~515):
```typescript
if (!gate()) return;
```

For deeper questions (line ~750):
```typescript
if (!gate()) return;
```

For the initial journal entry creation — the first time the user opens the journal for a day, `addJournalEntry` is called. Gate it:
```typescript
// Find where addJournalEntry is first called and wrap:
if (!gate()) return;
```

- [ ] **Step 3: Add ExclusiveOfferSheet render in JSX**

```tsx
<ExclusiveOfferSheet visible={showExclusiveOffer} onDismiss={dismissOffer} context="churned" />
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(tabs\)/\(today\)/journal.tsx
git commit -m "feat: gate journal entry + SOAP + questions + prayer with useCreationGate"
```

---

## Task 8: Wire Creation Gates — Evening Wind-Down

**Files:**
- Modify: `src/app/(tabs)/(today)/evening-wind-down.tsx`

- [ ] **Step 1: Remove the full-page premium block**

Remove the `useEffect` that calls `router.back()` for non-premium users (lines 149-153):

```typescript
// DELETE this entire useEffect:
useEffect(() => {
  if (!isPremium) {
    router.back();
  }
}, [isPremium, router]);
```

- [ ] **Step 2: Add creation gate on submission only**

```typescript
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

// Inside component:
const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
```

Find the `addCheckIn()` call (line ~270) and gate it:

```typescript
// Before addCheckIn:
if (!gate()) return;
addCheckIn({ ... });
```

- [ ] **Step 3: Add ExclusiveOfferSheet render**

```tsx
<ExclusiveOfferSheet visible={showExclusiveOffer} onDismiss={dismissOffer} context="churned" />
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(tabs\)/\(today\)/evening-wind-down.tsx
git commit -m "feat: replace wind-down full-page block with surgical addCheckIn gate"
```

---

## Task 9: Wire Creation Gates — Companion Tab

**Files:**
- Modify: `src/app/(tabs)/(ask)/index.tsx`

- [ ] **Step 1: Add creation gate hook**

```typescript
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
```

- [ ] **Step 2: Reorder gates in handleSend**

The creation gate must run BEFORE the daily limit check. Replace lines 208-215:

```typescript
const handleSend = useCallback(
  (text: string) => {
    // 1. Premium/churned gate — shows exclusive offer or paywall
    if (!gate()) return;

    // 2. Free-tier daily limit (only reached if user is genuinely free-tier, not churned)
    if (!isPremium && !canSendCompanionMessage()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowPremiumSheet(true);
      return;
    }

    sendMessage(text);

    if (!isPremium) {
      incrementCompanionDailyCount();
      setDailyRemaining(getCompanionDailyUsage().remaining);
    }

    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  },
  [sendMessage, isPremium, gate]
);
```

- [ ] **Step 3: Gate startNewConversation**

Find the `startNewConversation()` call (line ~336) and wrap it:

```typescript
<TouchableOpacity
  onPress={() => {
    if (!gate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    startNewConversation();
  }}
  // ... rest unchanged
>
```

- [ ] **Step 4: Add ExclusiveOfferSheet render**

```tsx
<ExclusiveOfferSheet visible={showExclusiveOffer} onDismiss={dismissOffer} context="churned" />
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(tabs\)/\(ask\)/index.tsx
git commit -m "feat: gate companion send + new conversation with useCreationGate (before daily limit)"
```

---

## Task 10: Wire Creation Gates — Journal Tab (Notes + Folders)

**Files:**
- Modify: `src/app/(tabs)/(journal)/index.tsx`
- Modify: `src/app/(tabs)/(journal)/note-detail.tsx`
- Modify: `src/components/notebook/CreateFolderSheet.tsx`

- [ ] **Step 1: Gate folder creation and renaming in journal/index.tsx**

```typescript
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
```

Gate `handleCreateFolderSubmit` (line 822):
```typescript
const handleCreateFolderSubmit = useCallback(
  (name: string, color?: string, parentId?: string) => {
    if (!gate()) return;
    addFolder(name, color, parentId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  [addFolder, gate],
);
```

Gate folder rename inside `handleFolderLongPress` (line 843):
```typescript
onPress: () => {
  if (!gate()) return;
  Alert.prompt(
    'Rename Folder',
    // ... rest unchanged
```

Gate "Add Subfolder" (line 855):
```typescript
text: 'Add Subfolder',
onPress: () => {
  if (!gate()) return;
  setCreateFolderParent({ id: folder.id, name: folder.name });
  setShowCreateFolderSheet(true);
},
```

Add `<ExclusiveOfferSheet>` render in JSX.

- [ ] **Step 2: Gate note creation and editing in note-detail.tsx**

```typescript
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
```

Gate the auto-save function — this is the debounced save that fires on content change (lines ~470-503). Add the gate at the start of the debounced callback:

```typescript
// Inside the debounced save (the function that calls addNote/updateNote):
// Add at the very top, before any save logic:
if (!gate()) return;
```

Add `<ExclusiveOfferSheet>` render in JSX.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(tabs\)/\(journal\)/index.tsx src/app/\(tabs\)/\(journal\)/note-detail.tsx
git commit -m "feat: gate note create/edit + folder create/rename with useCreationGate"
```

---

## Task 11: Wire Creation Gates — CheckInSheet + InlineReflectionJournal

**Files:**
- Modify: `src/components/CheckInSheet.tsx`
- Modify: `src/components/reading/InlineReflectionJournal.tsx`

- [ ] **Step 1: Gate CheckInSheet submission**

The `CheckInSheet` receives an `onSelectChip` callback. The parent already gates via `handleCheckInComplete` (Today tab). But add a safety gate inside the sheet too:

```typescript
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();
```

Gate `handleSubmitTyped` (line 238):
```typescript
const handleSubmitTyped = useCallback(() => {
  if (!gate()) return;
  if (typedAnswer.trim().length > 0) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectChip(typedAnswer.trim());
  }
}, [typedAnswer, onSelectChip, gate]);
```

- [ ] **Step 2: Disable InlineReflectionJournal for non-premium users**

For `InlineReflectionJournal.tsx`, the simplest approach is to disable the TextInput and show a premium prompt instead of allowing typing that would auto-save.

```typescript
import { useUnfoldStore } from '@/lib/store';

// Inside component:
const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
```

In the TextInput for each question response, add `editable={isPremium}` and show a prompt overlay when tapped while non-premium:

```tsx
<TextInput
  editable={isPremium}
  placeholder={isPremium ? 'Write your reflection...' : 'Subscribe to journal your reflections'}
  // ... rest unchanged
/>
```

This avoids needing `useCreationGate` in a component where the creation action is an auto-save debounce — disabling the input is cleaner than gating the save.

- [ ] **Step 3: Commit**

```bash
git add src/components/CheckInSheet.tsx src/components/reading/InlineReflectionJournal.tsx
git commit -m "feat: gate check-in sheet + disable inline reflection for non-premium"
```

---

## Task 12: Onboarding Apple Pay Cancellation → Exclusive Offer

**Files:**
- Modify: `src/app/paywall.tsx`
- Modify: `src/components/onboarding/ThreeStepPaywall.tsx`

- [ ] **Step 1: Add exclusive offer to paywall.tsx**

Add imports:
```typescript
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { mmkvStorage } from '@/lib/mmkv-storage';
```

Add state:
```typescript
const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
```

Replace the `user_cancelled` handler (line 240-242):
```typescript
} else if (result.reason === 'user_cancelled') {
  const hasSeenOnboardingOffer =
    mmkvStorage.getItem('@unfold_onboarding_offer_seen') === 'true';
  if (!hasSeenOnboardingOffer) {
    mmkvStorage.setItem('@unfold_onboarding_offer_seen', 'true');
    setShowExclusiveOffer(true);
  }
  return;
}
```

Add ExclusiveOfferSheet render in JSX:
```tsx
<ExclusiveOfferSheet
  visible={showExclusiveOffer}
  onDismiss={() => setShowExclusiveOffer(false)}
  context="onboarding"
/>
```

- [ ] **Step 2: Add exclusive offer to ThreeStepPaywall.tsx**

Add imports:
```typescript
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { mmkvStorage } from '@/lib/mmkv-storage';
```

Add state:
```typescript
const [showExclusiveOffer, setShowExclusiveOffer] = useState(false);
```

Replace the `user_cancelled` handler in `handlePurchase` (line 991):
```typescript
} else {
  if (result.reason === 'user_cancelled') {
    const hasSeenOnboardingOffer =
      mmkvStorage.getItem('@unfold_onboarding_offer_seen') === 'true';
    if (!hasSeenOnboardingOffer) {
      mmkvStorage.setItem('@unfold_onboarding_offer_seen', 'true');
      setShowExclusiveOffer(true);
    }
  } else {
    setPurchaseError('Something went wrong. Please try again.');
  }
}
```

Add ExclusiveOfferSheet render:
```tsx
<ExclusiveOfferSheet
  visible={showExclusiveOffer}
  onDismiss={() => setShowExclusiveOffer(false)}
  context="onboarding"
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/paywall.tsx src/components/onboarding/ThreeStepPaywall.tsx
git commit -m "feat: intercept Apple Pay cancellation — show one-time exclusive offer"
```

---

## Task 13: Delete TrialExpiredOverlay

**Files:**
- Delete: `src/components/TrialExpiredOverlay.tsx`

- [ ] **Step 1: Verify no remaining imports**

Run:
```bash
cd ~/clawd/work/unfold/app/mobile && grep -rn "TrialExpiredOverlay" src/
```
Expected: Zero results (import was removed in Task 5).

- [ ] **Step 2: Delete the file**

```bash
rm src/components/TrialExpiredOverlay.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -A src/components/TrialExpiredOverlay.tsx
git commit -m "chore: delete TrialExpiredOverlay — replaced by surgical creation gates"
```

---

## Task 14: Full Build + Visual Verification

- [ ] **Step 1: TypeScript check**

```bash
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 2: Start dev server and test in simulator**

```bash
cd ~/clawd/work/unfold/app/mobile && npx expo start
```

Test these flows:
1. **Happy path (premium user):** All tabs accessible, all creation actions work normally
2. **Churned user (debug toggle):** Go to You → Dev Tools → tap "Simulate Churned User"
   - Verify all tabs are accessible (no overlay)
   - Tap "Create New" on Today → should show ExclusiveOfferSheet
   - Dismiss the offer → tap "Create New" again → should navigate to /paywall
   - Go to Journal → try creating a note → should navigate to /paywall
   - Go to Companion → try sending a message → should navigate to /paywall
3. **Reset offers:** You → Dev Tools → "Reset Exclusive Offers" → "Create New" → should show ExclusiveOfferSheet again
4. **Onboarding offer:** Replay onboarding → get to paywall → tap Subscribe → cancel Apple Pay → should show ExclusiveOfferSheet with "50% OFF"

- [ ] **Step 3: Take simulator screenshots**

```bash
xcrun simctl io booted screenshot /tmp/churned-today.png && sips -Z 1000 /tmp/churned-today.png
xcrun simctl io booted screenshot /tmp/exclusive-offer.png && sips -Z 1000 /tmp/exclusive-offer.png
```

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A && git commit -m "fix: address visual/build issues from churned-user integration"
```

---

## Dependency Order

```
Task 1 (backend) — independent, can start immediately
Task 2 (useCreationGate hook) — independent
Task 3 (ExclusiveOfferSheet) — independent
Task 4 (debug tooling) — depends on Task 2 (uses MMKV keys from hook)
Task 5 (remove overlay) — depends on Tasks 6-11 being ready (gates must be in place first!)
Tasks 6-11 (wire gates) — depend on Tasks 2 + 3
Task 12 (onboarding intercept) — depends on Task 3
Task 13 (delete overlay file) — depends on Task 5
Task 14 (verification) — depends on all above
```

**Recommended execution order:** 1 → 2 → 3 → 4 → 6 → 7 → 8 → 9 → 10 → 11 → 5 → 12 → 13 → 14

Note: Task 5 (remove overlay) should be done AFTER Tasks 6-11 (wire gates) so there's never a window where neither the overlay nor the gates are protecting creation actions.
