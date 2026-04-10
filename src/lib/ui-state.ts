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
}>((set) => ({
  tabBarHidden: false,
  tabBarHideMode: 'slide',
  setTabBarHidden: (hidden, mode = 'slide') => set({ tabBarHidden: hidden, tabBarHideMode: mode }),
  revealTransitioning: false,
  setRevealTransitioning: (value) => set({ revealTransitioning: value }),
  debugForceTrialExpired: false,
  setDebugForceTrialExpired: (value) => set({ debugForceTrialExpired: value }),
}));
