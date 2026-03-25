# Three-Tier Audio Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the destructive-close AudioPlayerBar with a three-tier gesture-driven player (Pill → Mini Bar → Half-Sheet) that supports background audio, cross-tab persistence, and lock screen controls.

**Architecture:** Global Zustand store slice manages all audio state. A single `createAudioPlayer` instance lives in a `useGlobalAudioPlayer` hook, synced to Zustand via event listeners. Three visual components (Pill, Mini Bar, Half-Sheet) mount in the root layout and render based on `playerTier` state. Gestures drive tier transitions; no X buttons.

**Tech Stack:** expo-audio (`createAudioPlayer`), react-native-reanimated, react-native-gesture-handler, Zustand (with persist), @gorhom/bottom-sheet v5, expo-blur

**Spec:** `docs/superpowers/specs/2026-03-24-audio-player-behavior-design.md`

---

## Design System Compliance

All new components MUST use design system tokens exclusively. No hardcoded values.

| Category | Token Source | Usage |
|----------|-------------|-------|
| **Spacing** | `Spacing['2']`, `Spacing['4']`, etc. from `@/constants/spacing` | All padding, margin, gap values |
| **Radius** | `Radius.sm` (8), `Radius.lg` (16), `Radius.full` (999) from `@/constants/radius` | All borderRadius values |
| **Shadows** | `Shadow.lg`, `Shadow.sheet` from `@/constants/shadows` | Pill uses `Shadow.lg`, half-sheet uses `Shadow.sheet` |
| **Typography** | `FontFamily.uiMedium`, `FontSize.sm`, etc. from `@/constants/fonts` | All text styling |
| **Animation** | `Duration.fast` (150), `Duration.normal` (250), `Spring.snappy` from `@/constants/animations` | All transitions, no bounce, all springs critically-damped |
| **Colors** | `colors.accent`, `colors.text`, `colors.textMuted` from `useTheme()` + `alpha()` from `@/components/ui` | All color values, never hardcode hex |
| **Icons** | `phosphor-react-native` with `weight="light"` default (exceptions noted) | All icons |

**Animation rules:**
- All springs critically-damped (no bounce) — use `Spring.snappy` or `Spring.gentle`
- All product UI durations under 350ms — `Duration.slow` (340ms) is the max
- Pill enter/exit: `FadeInDown`/`FadeOutDown` with `Duration.normal` (250ms)
- Half-sheet: spring-driven via `@gorhom/bottom-sheet` (uses `Spring.snappy` config)
- Pill dismiss swipe: `Duration.fast` (150ms) fade out
- Pulsing dot: `withRepeat(withTiming(0.4, { duration: 1000 }), -1, true)` — 2s cycle

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/audio-player-state.ts` | Create | Zustand store slice — global audio playback state, types, actions |
| `src/hooks/useGlobalAudioPlayer.ts` | Create | Wraps `createAudioPlayer`, syncs to Zustand, handles lock screen, completion |
| `src/components/AudioPlayerPill.tsx` | Create | Tier 1 — minimal floating pill above tab bar |
| `src/components/AudioPlayerBar.tsx` | Modify | Tier 2 — refactor to read from global store, remove local state, remove X button |
| `src/components/AudioPlayerSheet.tsx` | Create | Tier 3 — half-sheet with scrubber, skip, speed picker |
| `src/components/AudioPlayerOverlay.tsx` | Create | Container that mounts all 3 tiers, reads `playerTier`, renders correct component |
| `src/app/_layout.tsx` | Modify | Mount `AudioPlayerOverlay` in root layout |
| `src/app/(tabs)/_layout.tsx` | Modify | Export tab bar height constant for pill/bar positioning |
| `src/app/(tabs)/(today)/reading.tsx` | Modify | Remove local audio state, call global `startAudio`/`stopAudio` actions |
| `src/lib/store.ts` | Modify | Bump version to 26, add audio player migration |
| `app.json` | Verify | Confirm `enableBackgroundPlayback: true` is set (already done) |

---

### Task 1: Create Audio Player Zustand Store Slice

**Files:**
- Create: `src/lib/audio-player-state.ts`

This is the foundation — all other tasks depend on this store existing.

- [ ] **Step 1: Write the failing test**

Create a test that imports the store and verifies initial state:

```typescript
// src/lib/__tests__/audio-player-state.test.ts
import { useAudioPlayerState } from '../audio-player-state';

describe('audioPlayerState', () => {
  it('has correct initial state', () => {
    const state = useAudioPlayerState.getState();
    expect(state.playerTier).toBe('hidden');
    expect(state.audioUri).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.isBuffering).toBe(false);
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.playbackSpeed).toBe(1);
    expect(state.title).toBeNull();
  });

  it('startAudio sets uri, metadata, and tier to minibar', () => {
    const { startAudio } = useAudioPlayerState.getState();
    startAudio('file:///audio.wav', {
      title: 'Day 1',
      seriesTitle: 'Test Series',
      devotionalId: 'dev-1',
      dayNumber: 1,
    });
    const state = useAudioPlayerState.getState();
    expect(state.audioUri).toBe('file:///audio.wav');
    expect(state.title).toBe('Day 1');
    expect(state.playerTier).toBe('minibar');
    expect(state.isLoading).toBe(true);
  });

  it('stopAudio resets all state', () => {
    const { startAudio, stopAudio } = useAudioPlayerState.getState();
    startAudio('file:///audio.wav', { title: 'X', seriesTitle: 'Y', devotionalId: 'z', dayNumber: 1 });
    stopAudio();
    const state = useAudioPlayerState.getState();
    expect(state.playerTier).toBe('hidden');
    expect(state.audioUri).toBeNull();
    expect(state.isPlaying).toBe(false);
  });

  it('setTier changes playerTier', () => {
    const { startAudio, setTier } = useAudioPlayerState.getState();
    startAudio('file:///a.wav', { title: 'X', seriesTitle: 'Y', devotionalId: 'z', dayNumber: 1 });
    setTier('pill');
    expect(useAudioPlayerState.getState().playerTier).toBe('pill');
    setTier('halfsheet');
    expect(useAudioPlayerState.getState().playerTier).toBe('halfsheet');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/audio-player-state.test.ts --no-coverage 2>&1 | head -30`
Expected: FAIL — module not found

- [ ] **Step 3: Write the store**

```typescript
// src/lib/audio-player-state.ts
import { create } from 'zustand';

export type PlayerTier = 'hidden' | 'pill' | 'minibar' | 'halfsheet';

export interface DevotionalAudioMetadata {
  title: string;
  seriesTitle: string;
  devotionalId: string;
  dayNumber: number;
}

interface AudioPlayerState {
  // Playback
  audioUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;

  // Metadata
  title: string | null;
  seriesTitle: string | null;
  devotionalId: string | null;
  dayNumber: number | null;

  // UI
  playerTier: PlayerTier;
  isCompleted: boolean; // true briefly when audio finishes, before auto-dismiss

  // Actions (state-only — player control lives in useGlobalAudioPlayer hook)
  startAudio: (uri: string, metadata: DevotionalAudioMetadata) => void;
  stopAudio: () => void;
  setTier: (tier: PlayerTier) => void;
  seekTo: (time: number) => void;
  setSpeed: (speed: number) => void;
  setCompleted: (completed: boolean) => void;
  updatePlaybackState: (update: Partial<Pick<AudioPlayerState, 'isPlaying' | 'isLoading' | 'isBuffering' | 'currentTime' | 'duration'>>) => void;
  // NOTE: No togglePlayPause here — play/pause MUST go through the hook to coordinate with native player
}

const INITIAL_STATE = {
  audioUri: null,
  isPlaying: false,
  isLoading: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  playbackSpeed: 1,
  title: null,
  seriesTitle: null,
  devotionalId: null,
  dayNumber: null,
  isCompleted: false,
  playerTier: 'hidden' as PlayerTier,
};

export const useAudioPlayerState = create<AudioPlayerState>((set, get) => ({
  ...INITIAL_STATE,

  startAudio: (uri, metadata) => set({
    audioUri: uri,
    title: metadata.title,
    seriesTitle: metadata.seriesTitle,
    devotionalId: metadata.devotionalId,
    dayNumber: metadata.dayNumber,
    playerTier: 'minibar',
    isLoading: true,
    isPlaying: false,
    isCompleted: false,
    currentTime: 0,
    duration: 0,
  }),

  stopAudio: () => set(INITIAL_STATE),

  setTier: (tier) => set({ playerTier: tier }),

  seekTo: (time) => set({ currentTime: time }),

  setSpeed: (speed) => set({ playbackSpeed: speed }),

  setCompleted: (completed) => set({ isCompleted: completed }),

  updatePlaybackState: (update) => set(update),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/audio-player-state.test.ts --no-coverage`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio-player-state.ts src/lib/__tests__/audio-player-state.test.ts
git commit -m "feat(audio): create global audio player Zustand store slice"
```

---

### Task 2: Create useGlobalAudioPlayer Hook

**Files:**
- Create: `src/hooks/useGlobalAudioPlayer.ts`

This hook wraps `createAudioPlayer` from expo-audio (imperative API, not the `useAudioPlayer` hook). It syncs the native player state to the Zustand store via `playbackStatusUpdate` events. It also manages lock screen metadata and handles audio completion.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useGlobalAudioPlayer.ts
import { useEffect, useRef, useCallback } from 'react';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import { useAudioPlayerState, DevotionalAudioMetadata } from '@/lib/audio-player-state';
import { Duration } from '@/constants/animations';
import { logger } from '@/lib/logger';

const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75] as const;
const PERSIST_INTERVAL_MS = 5000;

/** Singleton audio player instance — created once, reused across sources */
let globalPlayer: AudioPlayer | null = null;

function getOrCreatePlayer(): AudioPlayer {
  if (!globalPlayer) {
    globalPlayer = createAudioPlayer();
  }
  return globalPlayer;
}

export function useGlobalAudioPlayer() {
  const store = useAudioPlayerState;
  const lastPersistRef = useRef(0);

  // Configure audio session once on mount
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((e) => logger.error('[GlobalAudioPlayer] setAudioModeAsync failed:', e));
  }, []);

  // Subscribe to playback status updates
  useEffect(() => {
    const player = getOrCreatePlayer();

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      const state = store.getState();
      if (state.playerTier === 'hidden') return;

      const updates: Record<string, any> = {};

      // Sync playing state
      if (status.playing !== undefined && status.playing !== state.isPlaying) {
        updates.isPlaying = status.playing;
      }

      // Sync time/duration
      if (status.currentTime !== undefined) {
        updates.currentTime = status.currentTime;
      }
      if (status.duration !== undefined && status.duration !== state.duration) {
        updates.duration = status.duration;
      }

      // Loading/buffering
      if (status.isLoaded !== undefined) {
        updates.isLoading = !status.isLoaded;
      }
      if (status.isBuffering !== undefined) {
        updates.isBuffering = status.isBuffering;
      }

      if (Object.keys(updates).length > 0) {
        store.getState().updatePlaybackState(updates);
      }

      // Completion detection
      if (status.didJustFinish) {
        handleCompletion();
      }
    });

    return () => subscription.remove();
  }, []);

  const handleCompletion = useCallback(() => {
    const { playerTier } = store.getState();
    store.getState().updatePlaybackState({ isPlaying: false });

    // Tier-aware cascade: halfsheet → minibar → pill → "Completed" → dismiss
    const cascadeToCompleted = () => {
      store.getState().setTier('pill');
      store.getState().setCompleted(true);
      setTimeout(() => {
        // Only dismiss if still in completed pill state (user hasn't re-engaged)
        const current = store.getState();
        if (current.playerTier === 'pill' && current.isCompleted) {
          store.getState().stopAudio();
          // Release native resources
          if (globalPlayer) {
            globalPlayer.remove();
            globalPlayer = null;
          }
        }
      }, 3000);
    };

    if (playerTier === 'halfsheet') {
      store.getState().setTier('minibar');
      setTimeout(() => {
        store.getState().setTier('pill');
        setTimeout(cascadeToCompleted, Duration.normal);
      }, Duration.normal);
    } else if (playerTier === 'minibar') {
      store.getState().setTier('pill');
      setTimeout(cascadeToCompleted, Duration.normal);
    } else {
      // Already pill or hidden
      cascadeToCompleted();
    }
  }, []);

  const startAudio = useCallback((uri: string, metadata: DevotionalAudioMetadata) => {
    const player = getOrCreatePlayer();
    store.getState().startAudio(uri, metadata);

    // Replace audio source (doesn't destroy player instance)
    player.replace({ uri });

    // Set lock screen metadata
    try {
      player.setActiveForLockScreen(true, {
        title: metadata.title,
        artist: metadata.seriesTitle,
      }, {
        showSeekForward: true,
        showSeekBackward: true,
      });
    } catch (e) {
      logger.error('[GlobalAudioPlayer] Lock screen setup failed:', e);
    }

    // Auto-play
    player.play();
  }, []);

  const stopAudio = useCallback(() => {
    if (globalPlayer) {
      try {
        globalPlayer.pause();
        globalPlayer.clearLockScreenControls();
        globalPlayer.remove(); // Free native resources
      } catch { /* player may already be released */ }
      globalPlayer = null; // Force fresh instance on next startAudio
    }
    store.getState().stopAudio();
  }, []);

  const togglePlayPause = useCallback(() => {
    const player = getOrCreatePlayer();
    const { isPlaying } = store.getState();
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    // State will sync via playbackStatusUpdate listener
  }, []);

  const seekTo = useCallback((time: number) => {
    const player = getOrCreatePlayer();
    player.seekTo(time);
    store.getState().seekTo(time);
  }, []);

  const skip = useCallback((seconds: number) => {
    const player = getOrCreatePlayer();
    const { currentTime, duration } = store.getState();
    const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
    player.seekTo(newTime);
    store.getState().seekTo(newTime);
  }, []);

  const setSpeed = useCallback((speed: number) => {
    const player = getOrCreatePlayer();
    player.setPlaybackRate(speed);
    store.getState().setSpeed(speed);
  }, []);

  const cycleSpeed = useCallback(() => {
    const { playbackSpeed } = store.getState();
    const currentIndex = SPEED_OPTIONS.indexOf(playbackSpeed as any);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    const nextSpeed = SPEED_OPTIONS[nextIndex];
    setSpeed(nextSpeed);
  }, [setSpeed]);

  return {
    startAudio,
    stopAudio,
    togglePlayPause,
    seekTo,
    skip,
    setSpeed,
    cycleSpeed,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit src/hooks/useGlobalAudioPlayer.ts 2>&1 | head -20`

Note: expo-audio API may differ slightly — adjust `playbackStatusUpdate` event shape based on actual expo-audio types. Check `node_modules/expo-audio/build/ExpoAudio.d.ts` for exact signatures.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGlobalAudioPlayer.ts
git commit -m "feat(audio): create useGlobalAudioPlayer hook with createAudioPlayer + lock screen"
```

---

### Task 3: Create AudioPlayerPill Component

**Files:**
- Create: `src/components/AudioPlayerPill.tsx`

Tier 1 — small floating pill above tab bar. Pulsing accent dot + truncated title + play/pause icon. Tap → expand to mini bar. Swipe left/right → stop and dismiss.

- [ ] **Step 1: Create the component**

```typescript
// src/components/AudioPlayerPill.tsx
import React, { useEffect } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PlayIcon, PauseIcon } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { Shadow } from '@/constants/shadows';
import { alpha } from '@/components/ui';

const TAB_BAR_CONTENT_HEIGHT = 56;
const SWIPE_THRESHOLD = 80;

export function AudioPlayerPill() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { togglePlayPause, stopAudio } = useGlobalAudioPlayer();

  const isPlaying = useAudioPlayerState((s) => s.isPlaying);
  const title = useAudioPlayerState((s) => s.title);
  const isCompleted = useAudioPlayerState((s) => s.isCompleted);
  const setTier = useAudioPlayerState((s) => s.setTier);

  const bottomOffset = TAB_BAR_CONTENT_HEIGHT + insets.bottom + Spacing['2'];

  // Pulsing dot animation (0.4 → 1.0, 2s cycle)
  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    if (isPlaying) {
      dotOpacity.value = withRepeat(
        withTiming(0.4, { duration: 1000 }),
        -1,
        true,
      );
    } else {
      dotOpacity.value = 1;
    }
  }, [isPlaying, dotOpacity]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  // Swipe left/right to dismiss
  const translateX = useSharedValue(0);
  const swipeGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        runOnJS(stopAudio)();
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        translateX.value = withTiming(0, { duration: Duration.fast });
      }
    });

  const pillSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: 1 - Math.abs(translateX.value) / (SWIPE_THRESHOLD * 2),
  }));

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier('minibar');
  };

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlayPause();
  };

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View
        entering={FadeInDown.duration(Duration.normal)}
        exiting={FadeOutDown.duration(Duration.normal)}
        style={[
          styles.container,
          Shadow.lg,
          pillSwipeStyle,
          {
            bottom: bottomOffset,
            backgroundColor: alpha(colors.card, 0.95),
            borderColor: alpha(colors.border, 0.2),
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Audio playing: ${title}. Tap to expand. Swipe to stop.`}
        accessibilityActions={[
          { name: 'activate', label: 'Expand player' },
          { name: 'stop', label: 'Stop playback' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') handleTap();
          if (event.nativeEvent.actionName === 'stop') stopAudio();
        }}
      >
        <TouchableOpacity
          onPress={handleTap}
          activeOpacity={0.8}
          style={styles.touchArea}
        >
          {!isCompleted && (
            <Animated.View style={[styles.dot, { backgroundColor: colors.accent }, dotStyle]} />
          )}
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {isCompleted ? 'Completed' : (title || 'Playing...')}
          </Text>
          <TouchableOpacity onPress={handlePlayPause} hitSlop={8}>
            {isPlaying
              ? <PauseIcon size={16} color={colors.accent} weight="fill" />
              : <PlayIcon size={16} color={colors.accent} weight="fill" />
            }
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  touchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2.5'],
    gap: Spacing['2'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full, // full radius on square = circle
  },
  title: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
    maxWidth: 160,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/AudioPlayerPill.tsx
git commit -m "feat(audio): create AudioPlayerPill — Tier 1 minimal indicator"
```

---

### Task 4: Refactor AudioPlayerBar for Global State

**Files:**
- Modify: `src/components/AudioPlayerBar.tsx`

Remove all local audio state (useState, useAudioPlayer hook, polling interval). Read from global Zustand store instead. Remove the X button — replace with swipe gestures (down → pill, up → half-sheet). Remove the `audioUri` and `onClose` props.

Key changes:
1. Remove `useAudioPlayer` hook usage → player is managed by `useGlobalAudioPlayer`
2. Remove `useState` for `isPlaying`, `currentTime`, `duration`, `speedIndex`
3. Read all state from `useAudioPlayerState`
4. Remove `onClose` prop and X button
5. Add `Gesture.Pan()` for swipe up (→ halfsheet) and swipe down (→ pill)
6. Keep the visual layout (progress bar, title/time, play button, speed pill)

- [ ] **Step 1: Rewrite AudioPlayerBar**

The component should:
- Accept no props (reads everything from global store)
- Use `useAudioPlayerState` for display state
- Use `useGlobalAudioPlayer` for actions (togglePlayPause, cycleSpeed)
- `Gesture.Pan()` vertical: swipe up → `setTier('halfsheet')`, swipe down → `setTier('pill')`
- Keep `AudioPlayerLoading` for the `isLoading` state
- Keep existing styles, blur, shadow, progress bar, play button, speed pill
- Remove X button and close handler entirely

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/AudioPlayerBar.tsx
git commit -m "refactor(audio): AudioPlayerBar reads global store, gesture-driven navigation"
```

---

### Task 5: Create AudioPlayerSheet Component

**Files:**
- Create: `src/components/AudioPlayerSheet.tsx`

Tier 3 — half-sheet at ~48% screen height using `@gorhom/bottom-sheet`. Shows: drag handle, title + series name, draggable scrubber with time labels, skip -10s/+10s buttons, play/pause button (larger), speed picker. Swipe down → collapse to mini bar.

- [ ] **Step 1: Create the component**

```typescript
// src/components/AudioPlayerSheet.tsx
import React, { useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { PlayIcon, PauseIcon, ClockCounterClockwiseIcon, ClockClockwiseIcon } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Shadow } from '@/constants/shadows';
import { Duration, Spring } from '@/constants/animations';
import { alpha } from '@/components/ui';

const SKIP_SECONDS = 10;
const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75] as const;

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayerSheet() {
  const { colors, isDark } = useTheme();
  const { togglePlayPause, skip, cycleSpeed, seekTo } = useGlobalAudioPlayer();
  const sheetRef = useRef<BottomSheet>(null);

  const isPlaying = useAudioPlayerState((s) => s.isPlaying);
  const currentTime = useAudioPlayerState((s) => s.currentTime);
  const duration = useAudioPlayerState((s) => s.duration);
  const playbackSpeed = useAudioPlayerState((s) => s.playbackSpeed);
  const title = useAudioPlayerState((s) => s.title);
  const seriesTitle = useAudioPlayerState((s) => s.seriesTitle);
  const setTier = useAudioPlayerState((s) => s.setTier);

  const progress = duration > 0 ? currentTime / duration : 0;

  // Scrubber gesture
  const scrubberWidth = useSharedValue(0);
  const isScrubbing = useSharedValue(false);
  const scrubPosition = useSharedValue(0);

  const scrubGesture = Gesture.Pan()
    .onStart(() => { isScrubbing.value = true; })
    .onUpdate((e) => {
      if (scrubberWidth.value > 0) {
        const pos = Math.max(0, Math.min(e.x / scrubberWidth.value, 1));
        scrubPosition.value = pos;
      }
    })
    .onEnd((e) => {
      if (scrubberWidth.value > 0 && duration > 0) {
        const pos = Math.max(0, Math.min(e.x / scrubberWidth.value, 1));
        const seekTime = pos * duration;
        runOnJS(seekTo)(seekTime);
      }
      isScrubbing.value = false;
    });

  const scrubFillStyle = useAnimatedStyle(() => ({
    width: isScrubbing.value
      ? `${scrubPosition.value * 100}%`
      : `${progress * 100}%`,
  }));

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) {
      // Sheet closed — collapse to mini bar
      setTier('minibar');
    }
  }, [setTier]);

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={['48%']}
      enablePanDownToClose
      onChange={handleSheetChange}
      handleIndicatorStyle={{ backgroundColor: alpha(colors.text, 0.2), width: 36 }}
      backgroundStyle={[
        { backgroundColor: colors.card, borderRadius: Radius.xl },
        Shadow.sheet,
      ]}
      animationConfigs={{
        damping: Spring.snappy.damping,
        stiffness: Spring.snappy.stiffness,
        mass: Spring.snappy.mass,
      }}
    >
      <BottomSheetView style={styles.content}>
        {/* Title + Series */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.series, { color: colors.textMuted }]} numberOfLines={1}>
            {seriesTitle}
          </Text>
        </View>

        {/* Scrubber */}
        <GestureDetector gesture={scrubGesture}>
          <View
            style={[styles.scrubberTrack, { backgroundColor: alpha(colors.text, 0.1) }]}
            onLayout={(e) => { scrubberWidth.value = e.nativeEvent.layout.width; }}
          >
            <Animated.View style={[styles.scrubberFill, { backgroundColor: colors.accent }, scrubFillStyle]} />
          </View>
        </GestureDetector>
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(currentTime)}</Text>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(duration)}</Text>
        </View>

        {/* Controls: skip back, play/pause, skip forward */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); skip(-SKIP_SECONDS); }}
            accessibilityLabel="Skip back 10 seconds"
            style={styles.skipButton}
          >
            <ClockCounterClockwiseIcon size={28} color={colors.textMuted} weight="light" />
            <Text style={[styles.skipLabel, { color: colors.textMuted }]}>10</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); togglePlayPause(); }}
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            style={[styles.playButton, { backgroundColor: colors.accent }]}
          >
            {isPlaying
              ? <PauseIcon size={28} color={colors.background} weight="fill" />
              : <PlayIcon size={28} color={colors.background} weight="fill" />
            }
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); skip(SKIP_SECONDS); }}
            accessibilityLabel="Skip forward 10 seconds"
            style={styles.skipButton}
          >
            <ClockClockwiseIcon size={28} color={colors.textMuted} weight="light" />
            <Text style={[styles.skipLabel, { color: colors.textMuted }]}>10</Text>
          </TouchableOpacity>
        </View>

        {/* Speed picker */}
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); cycleSpeed(); }}
          style={[styles.speedPill, { backgroundColor: alpha(colors.text, 0.08) }]}
          accessibilityLabel={`Playback speed ${playbackSpeed}x`}
        >
          <Text style={[styles.speedText, { color: colors.textMuted }]}>{playbackSpeed}x</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
    paddingBottom: Spacing['8'],
    alignItems: 'center',
  },
  titleSection: { alignItems: 'center', gap: Spacing['1'], marginBottom: Spacing['5'] },
  title: { fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.lg, textAlign: 'center' },
  series: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, textAlign: 'center' },
  scrubberTrack: { width: '100%', height: Spacing['1'], borderRadius: Radius.sm / 2, overflow: 'hidden' },
  scrubberFill: { height: '100%', borderRadius: Radius.sm / 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: Spacing['1.5'] },
  timeText: { fontFamily: FontFamily.ui, fontSize: FontSize.xs },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['8'], marginTop: Spacing['6'] },
  skipButton: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  skipLabel: { fontFamily: FontFamily.uiMedium, fontSize: 10, position: 'absolute', top: 8 },
  playButton: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  speedPill: { paddingHorizontal: Spacing['4'], paddingVertical: Spacing['2'], borderRadius: Radius.sm, marginTop: Spacing['5'] },
  speedText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Note: `@gorhom/bottom-sheet` v5 `animationConfigs` may need adjustment — check the actual prop name. It may be `animationConfigs` or require `configureProps`. Verify against `node_modules/@gorhom/bottom-sheet/lib/typescript/types.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/AudioPlayerSheet.tsx
git commit -m "feat(audio): create AudioPlayerSheet — Tier 3 half-sheet with scrubber"
```

---

### Task 6: Create AudioPlayerOverlay Container

**Files:**
- Create: `src/components/AudioPlayerOverlay.tsx`
- Modify: `src/app/_layout.tsx` (mount overlay in root layout)

This container reads `playerTier` from the store and renders the correct component. It mounts in the root layout so it persists across all navigation.

- [ ] **Step 1: Create AudioPlayerOverlay**

```typescript
// src/components/AudioPlayerOverlay.tsx
import React from 'react';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { AudioPlayerPill } from './AudioPlayerPill';
import { AudioPlayerBar } from './AudioPlayerBar';
import { AudioPlayerSheet } from './AudioPlayerSheet';

export function AudioPlayerOverlay() {
  const playerTier = useAudioPlayerState((s) => s.playerTier);

  if (playerTier === 'hidden') return null;
  if (playerTier === 'pill') return <AudioPlayerPill />;
  if (playerTier === 'minibar') return <AudioPlayerBar />;
  if (playerTier === 'halfsheet') {
    return (
      <>
        <AudioPlayerBar />
        <AudioPlayerSheet />
      </>
    );
  }
  return null;
}
```

Note: When half-sheet is open, mini bar stays visible underneath (natural collapse target).

- [ ] **Step 2: Mount in root layout**

In `src/app/_layout.tsx`, inside `RootLayoutNav`, add `AudioPlayerOverlay` after the `Stack` and before `StatusBar`:

```tsx
// In RootLayoutNav return, after Stack, before StatusBar:
<AudioPlayerOverlay />
```

The overlay uses absolute positioning (inherited from Pill/Bar components), so it floats above all navigation content.

- [ ] **Step 3: Initialize audio hook in root layout**

Call `useGlobalAudioPlayer()` once in `RootLayoutNav` to set up the audio session and event listeners:

```tsx
// Inside RootLayoutNav, near other hooks:
useGlobalAudioPlayer();
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/AudioPlayerOverlay.tsx src/app/_layout.tsx
git commit -m "feat(audio): mount AudioPlayerOverlay in root layout for cross-tab persistence"
```

---

### Task 7: Migrate reading.tsx to Global Audio State

**Files:**
- Modify: `src/app/(tabs)/(today)/reading.tsx`

Remove local audio state management. Instead of `setAudioUri()` + `setIsAudioPlayerVisible(true)`, call `startAudio(uri, metadata)` from the global hook. Remove `onClose` handler — the global store handles stop.

- [ ] **Step 1: Remove local audio state**

Delete these from reading.tsx:
- `const [isAudioPlayerVisible, setIsAudioPlayerVisible] = useState(false);`
- `const [audioUri, setAudioUri] = useState<string | null>(null);`
- The `<AudioPlayerBar>` JSX rendering block (it's now in root layout)
- The `onClose` callback that sets states to null
- Any `setAudioUri(null)` calls in study method sheet handlers

- [ ] **Step 2: Wire up startAudio**

Where the old code set `setAudioUri(url)` + `setIsAudioPlayerVisible(true)`, replace with:

```typescript
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';

// In component:
const { startAudio, stopAudio } = useGlobalAudioPlayer();

// Where audio was triggered:
const { audioUrl } = await streamDevotionalAudio(fullText, voiceId);
startAudio(audioUrl, {
  title: currentDayData?.title ?? 'Devotional',
  seriesTitle: currentSeriesData?.title ?? '',
  devotionalId: currentSeriesData?.id ?? '',
  dayNumber: currentDayNumber ?? 1,
});
```

- [ ] **Step 3: Handle devotional navigation**

When user navigates to a different devotional, check if audio is playing for a different devotional and stop it:

```typescript
const currentAudioDevotionalId = useAudioPlayerState((s) => s.devotionalId);
// In navigation handler:
if (currentAudioDevotionalId && currentAudioDevotionalId !== newDevotionalId) {
  stopAudio();
}
```

- [ ] **Step 4: Remove AudioPlayerBar import and study method sheet kill**

The import `import { AudioPlayerBar } from '@/components/AudioPlayerBar'` and its JSX usage are no longer needed in this file.

Also remove the audio-killing behavior from `handleStudyMethodPress` — per spec, the study method sheet no longer kills audio. Remove any code like:
```typescript
// DELETE THIS:
if (isAudioPlayerVisible) {
  setIsAudioPlayerVisible(false);
  setAudioUri(null);
  endReadingSession();
}
```
Audio continues playing behind the sheet now.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/app/(tabs)/(today)/reading.tsx
git commit -m "refactor(audio): migrate reading.tsx to global audio state"
```

---

### Task 8: Add Tab-Switch Auto-Collapse

**Files:**
- Modify: `src/app/(tabs)/_layout.tsx`

When user switches tabs, auto-collapse mini bar to pill. Audio continues playing.

- [ ] **Step 1: Add tab change listener**

In `CustomTabBar`, detect when the active tab changes and collapse the mini bar:

```typescript
import { useAudioPlayerState } from '@/lib/audio-player-state';

// Inside CustomTabBar:
const playerTier = useAudioPlayerState((s) => s.playerTier);
const setTier = useAudioPlayerState((s) => s.setTier);

// In the onPress handler for each tab, after navigation:
const onPress = () => {
  // ... existing emit + navigate code ...

  // Auto-collapse mini bar to pill on tab switch
  if (playerTier === 'minibar' || playerTier === 'halfsheet') {
    setTier('pill');
  }
};
```

- [ ] **Step 2: Verify behavior**

After building, test: start audio on reading screen → switch to Bible tab → mini bar should collapse to pill → tap pill → mini bar reappears.

- [ ] **Step 3: Commit**

```bash
git add src/app/(tabs)/_layout.tsx
git commit -m "feat(audio): auto-collapse to pill on tab switch"
```

---

### Task 9: Add Playback Persistence (App Restart)

**Files:**
- Modify: `src/lib/audio-player-state.ts` (add persist middleware)
- Modify: `src/lib/store.ts` (bump version for migration)

Persist `currentTime`, `audioUri`, metadata, and `playbackSpeed` to MMKV so the player can restore after app restart.

- [ ] **Step 1: Add persist to audio player state**

Wrap the store with `persist` middleware. Only persist the fields needed for restoration (not `isPlaying`, `isLoading`, `isBuffering` — those are ephemeral).

```typescript
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkv-storage';

export const useAudioPlayerState = create<AudioPlayerState>()(
  persist(
    (set, get) => ({
      // ... existing state and actions
    }),
    {
      name: 'audio-player-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        audioUri: state.audioUri,
        // NOTE: currentTime is NOT auto-persisted here to avoid excessive MMKV writes.
        // Instead, the hook explicitly writes currentTime on pause, stop, and background.
        // Use a separate MMKV key: mmkvStorage.setItem('audio-player-time', String(currentTime))
        duration: state.duration,
        playbackSpeed: state.playbackSpeed,
        title: state.title,
        seriesTitle: state.seriesTitle,
        devotionalId: state.devotionalId,
        dayNumber: state.dayNumber,
        // playerTier persists as 'pill' if audio was active, 'hidden' if not
        playerTier: state.playerTier !== 'hidden' ? 'pill' : 'hidden',
      }),
    },
  ),
);
```

- [ ] **Step 2: Handle restoration in useGlobalAudioPlayer**

On app launch, if persisted state has an `audioUri`, show the pill but don't auto-play. User taps pill → loads audio from URI at saved `currentTime`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/audio-player-state.ts
git commit -m "feat(audio): persist playback state for app restart restoration"
```

---

### Task 10: Build Verification and Visual Testing

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 2: Build the app**

Run: `npx expo run:ios --device "iPhone 17 Pro"`

- [ ] **Step 3: Test Tier 1 → Tier 2 flow**

1. Open a devotional → tap "Listen" → mini bar appears (Tier 2)
2. Swipe mini bar down → collapses to pill (Tier 1), audio continues
3. Tap pill → mini bar reappears (Tier 2)

Screenshot: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-pill.png && sips -Z 1000 /tmp/sim-pill.png`

- [ ] **Step 4: Test Tier 2 → Tier 3 flow**

1. From mini bar, swipe up → half-sheet appears (Tier 3)
2. Verify scrubber, skip buttons, speed picker all work
3. Swipe half-sheet down → returns to mini bar (Tier 2)

Screenshot: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-halfsheet.png && sips -Z 1000 /tmp/sim-halfsheet.png`

- [ ] **Step 5: Test cross-tab persistence**

1. Start audio on reading screen
2. Switch to Bible tab → pill visible, audio playing
3. Switch to Journal tab → pill still visible
4. Tap pill → mini bar appears on Journal tab

- [ ] **Step 6: Test dismiss flow**

1. With pill visible, swipe pill left → audio stops, pill dismissed
2. Verify no player UI visible anywhere

- [ ] **Step 7: Test audio completion**

1. Play a short audio clip
2. Let it finish → pill shows "Completed" briefly → auto-dismisses after 3s

- [ ] **Step 8: Test background audio**

1. Start audio → press home button (background app)
2. Lock screen shows Now Playing controls
3. Play/pause from lock screen works
4. Return to app → pill visible, tap to restore mini bar

- [ ] **Step 9: Commit verification results**

```bash
git add src/components/AudioPlayer*.tsx src/hooks/useGlobalAudioPlayer.ts src/lib/audio-player-state.ts src/app/_layout.tsx src/app/\(tabs\)/_layout.tsx src/app/\(tabs\)/\(today\)/reading.tsx
git commit -m "feat(audio): three-tier audio player — complete implementation"
```
