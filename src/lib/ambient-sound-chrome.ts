import type React from 'react';
import { Keyboard, type View } from 'react-native';
import { create } from 'zustand';

export type AmbientSheetPanel = 'sounds' | 'timer';

type AmbientSoundChrome = {
  sheet: AmbientSheetPanel | null;
  returnFocusRef: React.RefObject<View | null> | null;
  todayReadingAvailable: boolean;
  playerDockHeight: number;
  openSheet: (panel?: AmbientSheetPanel, trigger?: React.RefObject<View | null>) => void;
  closeSheet: () => void;
  registerEntry: (trigger: React.RefObject<View | null> | null) => void;
  setTodayReadingAvailable: (available: boolean) => void;
  setPlayerDockHeight: (height: number) => void;
};

export function useAmbientPlayerScrollPadding(basePadding: number): number {
  const dockHeight = useAmbientSoundChrome((state) => state.playerDockHeight);
  return basePadding + Math.max(0, dockHeight);
}

export const useAmbientSoundChrome = create<AmbientSoundChrome>((set) => ({
  sheet: null,
  returnFocusRef: null,
  todayReadingAvailable: false,
  playerDockHeight: 0,
  openSheet: (panel = 'sounds', trigger) => {
    Keyboard.dismiss();
    set((state) => ({ sheet: panel, returnFocusRef: trigger ?? state.returnFocusRef }));
  },
  closeSheet: () => set({ sheet: null }),
  registerEntry: (returnFocusRef) => set({ returnFocusRef }),
  setTodayReadingAvailable: (todayReadingAvailable) => set({ todayReadingAvailable }),
  setPlayerDockHeight: (height) => set((state) => {
    const playerDockHeight = Math.max(0, height);
    return state.playerDockHeight === playerDockHeight ? state : { playerDockHeight };
  }),
}));
