import { create } from 'zustand';

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
}>((set) => ({
  tabBarHidden: false,
  tabBarHideMode: 'slide',
  setTabBarHidden: (hidden, mode = 'slide') => set({ tabBarHidden: hidden, tabBarHideMode: mode }),
  revealTransitioning: false,
  setRevealTransitioning: (value) => set({ revealTransitioning: value }),
  debugForceTrialExpired: false,
  setDebugForceTrialExpired: (value) => set({ debugForceTrialExpired: value }),
  revenueCatResolved: false,
  setRevenueCatResolved: () => set({ revenueCatResolved: true }),
}));
