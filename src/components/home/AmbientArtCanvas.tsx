import React, { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  useWindowDimensions,
} from 'react-native';
import { useLowPowerMode } from 'expo-battery';
import type { RiveFileInput } from '@rive-app/react-native';
import { EmberSystem } from '@/components/EmberSystem';
import { TodayCompletionRive } from '@/components/home/TodayCompletionRive';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useTheme } from '@/lib/theme';
import {
  selectTodayCompletionAmbience,
  shouldShowCompletedEmberAmbience,
  type TodayAmbientStateType,
} from '@/lib/today-ambient-rive';
import type { ExclusionZone } from '@/lib/ember-system';
import todayWindLeavesSource from '../../../assets/rive/today-wind-leaves.riv';

// ---------------------------------------------------------------------------
// AmbientArtCanvas
// ---------------------------------------------------------------------------
// Thin Today-state adapter over the single completed-day ambient slot. Once the
// reader completes a day, Today chooses one stable option for that completed
// devotional/day/date: the native EmberSystem look or an approved Rive loop.
// Everything pre-completion stays quiet.
// ---------------------------------------------------------------------------

const TODAY_WIND_LEAVES_SOURCE = todayWindLeavesSource as RiveFileInput;

interface Props {
  streakLevel: number;
  hasReadToday: boolean;
  stateType: TodayAmbientStateType;
  screenFocused: boolean;
  completionAmbienceKey: string | null;
}

// Keep ember luminance out of the hero card stack text (brightness budget —
// embers must stay dimmer than the dimmest text). Normalized to the screen.
const HOME_CARD_STACK_EXCLUSION: ReadonlyArray<ExclusionZone> = [
  { x: 0.04, y: 0.18, width: 0.92, height: 0.38 },
];

function useIsAppActive(): boolean {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return appState === 'active';
}

function renderEmberFallback(streakLevel: number, screenFocused: boolean) {
  return (
    <EmberSystem
      variant="ambient"
      streakLevel={streakLevel}
      active={screenFocused}
      opacityFloor={0.5}
      exclusionZones={HOME_CARD_STACK_EXCLUSION}
    />
  );
}

export function AmbientArtCanvas({
  streakLevel,
  hasReadToday,
  stateType,
  screenFocused,
  completionAmbienceKey,
}: Props) {
  const { colors, isDark } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();
  const isAppActive = useIsAppActive();
  const lowPowerMode = useLowPowerMode();
  const { width, height } = useWindowDimensions();

  const shouldShowCompletedAmbience = shouldShowCompletedEmberAmbience({ stateType, hasReadToday });
  const ambience = useMemo(() => selectTodayCompletionAmbience({
    stateType,
    hasReadToday,
    selectionKey: completionAmbienceKey,
  }), [completionAmbienceKey, hasReadToday, stateType]);

  if (!shouldShowCompletedAmbience || !ambience) return null;
  if (ambience === 'ember') return renderEmberFallback(streakLevel, screenFocused);

  // Rive is continuous native motion. Reduced Motion and Low Power Mode fall
  // back to EmberSystem's designed still/low-cost poster instead of animating.
  if (reducedMotion || lowPowerMode === true) return renderEmberFallback(streakLevel, screenFocused);
  if (!screenFocused || !isAppActive) return null;

  return (
    <TodayCompletionRive
      source={TODAY_WIND_LEAVES_SOURCE}
      active={screenFocused && isAppActive}
      accentColor={colors.accent}
      isDark={isDark}
      width={width}
      height={height}
    />
  );
}
