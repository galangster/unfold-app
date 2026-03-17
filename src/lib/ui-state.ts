import { create } from 'zustand';

/** Ephemeral UI state — not persisted, used for cross-component animation coordination */
export const useUIState = create<{
  tabBarHidden: boolean;
  /** 'slide' for scroll-based, 'instant' for verse-selection (no animation, no flash) */
  tabBarHideMode: 'slide' | 'instant';
  setTabBarHidden: (hidden: boolean, mode?: 'slide' | 'instant') => void;
}>((set) => ({
  tabBarHidden: false,
  tabBarHideMode: 'slide',
  setTabBarHidden: (hidden, mode = 'slide') => set({ tabBarHidden: hidden, tabBarHideMode: mode }),
}));
