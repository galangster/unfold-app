import { create } from 'zustand';
import type { AutoTrialEntry, AutoTrialSurface } from '@/lib/auto-trial-exit';
import type { TodayCompletionAmbience } from '@/lib/today-ambient-rive';

/** Ephemeral UI state — not persisted, used for cross-component animation coordination */
export const useUIState = create<{
  tabBarHidden: boolean;
  /** 'slide' for scroll-based, 'instant' for verse-selection (no animation, no flash) */
  tabBarHideMode: 'slide' | 'instant';
  setTabBarHidden: (hidden: boolean, mode?: 'slide' | 'instant') => void;
  /** True while transitioning from reveal → reading. Home screen renders a ripple loader. */
  revealTransitioning: boolean;
  setRevealTransitioning: (value: boolean) => void;
  /** DEV-ONLY: force the trial-expired overlay to show regardless of
      actual subscription state. Used by the Dev Tools button to preview the
      churned-user experience without touching real subscription data.
      Not persisted — resets on app launch. */
  debugForceTrialExpired: boolean;
  setDebugForceTrialExpired: (value: boolean) => void;
  /** Session-local QA-only premium override for internal TestFlight/UI checks.
      This is not a RevenueCat entitlement and is ignored unless QA tools are
      enabled by `isQaToolsEnabled()`. Not persisted — resets on app launch. */
  qaPremiumOverride: boolean;
  setQaPremiumOverride: (value: boolean) => void;
  /** True once RevenueCat has returned a customer info payload this session
      (even a "no entitlement" answer counts). Initial value `false`; flips to
      `true` on the first successful `getCustomerInfo()` resolution OR the first
      `addCustomerInfoUpdateListener` callback, whichever comes first.
      Consumers gating OS-side side-effects (notifications, unlocks) must treat
      `false` as "premium policy unknown" and fail closed. Not persisted —
      always resets to `false` on app launch so a stale persisted `isPremium=true`
      cannot drive side-effects before the source confirms the current session. */
  revenueCatResolved: boolean;
  setRevenueCatResolved: () => void;
  clearRevenueCatResolved: () => void;
  /** QA-only Today completion ambience override (set by the debug-seed-today
      `scene=` deep link). When set AND QA tools are enabled, AmbientArtCanvas
      renders this exact ambience instead of the stable-hash rotation, so we can
      preview/screenshot a specific scene. Ignored in production. Not persisted. */
  qaAmbienceOverride: TodayCompletionAmbience | null;
  setQaAmbienceOverride: (value: TodayCompletionAmbience | null) => void;
  notificationPermissionEpoch: number;
  bumpNotificationPermissionEpoch: () => void;
  trialNoticeEpoch: number;
  bumpTrialNoticeEpoch: () => void;
  qaCaptureMode: boolean;
  setQaCaptureMode: (value: boolean) => void;
  autoTrialRevealGuardKey: string | null;
  setAutoTrialRevealGuardKey: (value: string | null) => void;
  seriesRevealMountedIntentId: string | null;
  setSeriesRevealMountedIntentId: (value: string | null) => void;
  laterEntryNotifyAskPending: boolean;
  setLaterEntryNotifyAskPending: (value: boolean) => void;
  pendingPaywallGrant: {
    surface: AutoTrialSurface;
    entry: AutoTrialEntry;
    setAtMs: number;
  } | null;
  setPendingPaywallGrant: (value: {
    surface: AutoTrialSurface;
    entry: AutoTrialEntry;
    setAtMs: number;
  } | null) => void;
}>((set) => ({
  tabBarHidden: false,
  tabBarHideMode: 'slide',
  setTabBarHidden: (hidden, mode = 'slide') => set({ tabBarHidden: hidden, tabBarHideMode: mode }),
  revealTransitioning: false,
  setRevealTransitioning: (value) => set({ revealTransitioning: value }),
  debugForceTrialExpired: false,
  setDebugForceTrialExpired: (value) => set({ debugForceTrialExpired: value }),
  qaPremiumOverride: false,
  setQaPremiumOverride: (value) => set({ qaPremiumOverride: value }),
  revenueCatResolved: false,
  setRevenueCatResolved: () => set({ revenueCatResolved: true }),
  clearRevenueCatResolved: () => set({ revenueCatResolved: false }),
  qaAmbienceOverride: null,
  setQaAmbienceOverride: (value) => set({ qaAmbienceOverride: value }),
  notificationPermissionEpoch: 0,
  bumpNotificationPermissionEpoch: () => set((state) => ({
    notificationPermissionEpoch: state.notificationPermissionEpoch + 1,
  })),
  trialNoticeEpoch: 0,
  bumpTrialNoticeEpoch: () => set((state) => ({
    trialNoticeEpoch: state.trialNoticeEpoch + 1,
  })),
  qaCaptureMode: false,
  setQaCaptureMode: (value) => set({ qaCaptureMode: value }),
  autoTrialRevealGuardKey: null,
  setAutoTrialRevealGuardKey: (value) => set({ autoTrialRevealGuardKey: value }),
  seriesRevealMountedIntentId: null,
  setSeriesRevealMountedIntentId: (value) => set({ seriesRevealMountedIntentId: value }),
  laterEntryNotifyAskPending: false,
  setLaterEntryNotifyAskPending: (value) => set({ laterEntryNotifyAskPending: value }),
  pendingPaywallGrant: null,
  setPendingPaywallGrant: (value) => set({ pendingPaywallGrant: value }),
}));
