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
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useUIState } from '@/lib/ui-state';
import {
  selectTodayCompletionAmbience,
  shouldShowCompletedEmberAmbience,
  type TodayAmbientStateType,
  type TodayCompletionAmbience,
} from '@/lib/today-ambient-rive';
import type { ExclusionZone } from '@/lib/ember-system';
import todayCampfireSource from '../../../assets/rive/today-campfire.riv';
import todayCanopyLightsSource from '../../../assets/rive/today-canopy-lights.riv';
import todayDoorsSource from '../../../assets/rive/today-doors.riv';
import todayTreeSource from '../../../assets/rive/today-tree.riv';
import todayWaterfallSource from '../../../assets/rive/today-waterfall.riv';
import todayWindLeavesSource from '../../../assets/rive/today-wind-leaves.riv';

// ---------------------------------------------------------------------------
// AmbientArtCanvas
// ---------------------------------------------------------------------------
// Thin Today-state adapter over the single completed-day ambient slot. Once the
// reader completes a day, Today chooses one stable option for that completed
// devotional/day/date: the native EmberSystem look or an approved Rive loop.
// Everything pre-completion stays quiet.
// ---------------------------------------------------------------------------

// Maps each Rive ambience option to its bundled `.riv` source. `ember` is the
// native EmberSystem look and has no Rive source.
const RIVE_SCENE_SOURCES: Record<Exclude<TodayCompletionAmbience, 'ember'>, RiveFileInput> = {
  'campfire-rive': todayCampfireSource as RiveFileInput,
  'canopy-lights-rive': todayCanopyLightsSource as RiveFileInput,
  'doors-rive': todayDoorsSource as RiveFileInput,
  'tree-rive': todayTreeSource as RiveFileInput,
  'waterfall-rive': todayWaterfallSource as RiveFileInput,
  'wind-leaves-rive': todayWindLeavesSource as RiveFileInput,
};

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

export function getInitialAmbientAppStateStatus(currentState: AppStateStatus | null | undefined): AppStateStatus {
  return currentState === 'background' ? 'background' : 'active';
}

function useIsAppActive(): boolean {
  const [appState, setAppState] = useState<AppStateStatus>(() => getInitialAmbientAppStateStatus(AppState.currentState));

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

  // QA-only: the debug-seed-today `scene=` deep link can force one exact scene
  // so we can preview/screenshot it. Ignored unless QA tools are enabled.
  const qaAmbienceOverride = useUIState((state) => state.qaAmbienceOverride);

  const shouldShowCompletedAmbience = shouldShowCompletedEmberAmbience({ stateType, hasReadToday });
  const hashedAmbience = useMemo(() => selectTodayCompletionAmbience({
    stateType,
    hasReadToday,
    selectionKey: completionAmbienceKey,
  }), [completionAmbienceKey, hasReadToday, stateType]);
  const ambience = (isQaToolsEnabled() && qaAmbienceOverride) ? qaAmbienceOverride : hashedAmbience;

  if (!shouldShowCompletedAmbience || !ambience) return null;
  if (ambience === 'ember') return renderEmberFallback(streakLevel, screenFocused);

  // Rive is continuous native motion. Reduced Motion and Low Power Mode fall
  // back to EmberSystem's designed still/low-cost poster instead of animating.
  if (reducedMotion || lowPowerMode === true) return renderEmberFallback(streakLevel, screenFocused);
  if (!screenFocused || !isAppActive) return null;

  return (
    <TodayCompletionRive
      source={RIVE_SCENE_SOURCES[ambience]}
      active={screenFocused && isAppActive}
      accentColor={colors.accent}
      backgroundColor={colors.background}
      isDark={isDark}
      width={width}
      height={height}
    />
  );
}
