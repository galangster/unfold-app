import React, { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus, useWindowDimensions } from 'react-native';
import { useLowPowerMode } from 'expo-battery';
import type { SharedValue } from 'react-native-reanimated';
import type { RiveFileInput } from '@rive-app/react-native';
import todayLightRaysSource from '../../../assets/rive/today-light-rays.riv';
import todayRainParticlesSource from '../../../assets/rive/today-rain-particles.riv';
import todayWindParticlesSource from '../../../assets/rive/today-wind-particles.riv';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { GoldEmberField } from '@/components/home/GoldEmberField';
import { TodayAmbientRive } from '@/components/home/TodayAmbientRive';
import {
  getTodayAmbientMode,
  getTodayAmbientRiveInputs,
  shouldShowCompletedEmberAmbience,
  type TodayAmbientMode,
  type TodayAmbientStateType,
} from '@/lib/today-ambient-rive';

// ---------------------------------------------------------------------------
// AmbientArtCanvas
// ---------------------------------------------------------------------------
// Skia shaders (concentric rings + organic noise) removed — they were
// invisible in practice but consumed ~25% CPU from continuous GPU rendering
// and a rotation sensor. Today now keeps Rive motion out of pre-completion
// states. Completed/rest states use the higher-fidelity GoldEmberField layer plus
// the screen-level gradient glow, matching the non-pixelated ember treatment used
// in the completion celebration and paywall while avoiding the rain asset's
// ripple-like look.
// ---------------------------------------------------------------------------

const TODAY_RIVE_SOURCES = {
  'wind-particles': todayWindParticlesSource,
  'light-rays': todayLightRaysSource,
  'rain-particles': todayRainParticlesSource,
} satisfies Record<Exclude<TodayAmbientMode, 'none'>, RiveFileInput>;

interface Props {
  streakLevel: number;
  hasReadToday: boolean;
  stateType: TodayAmbientStateType;
  accentColor: string;
  screenFocused: boolean;
  scrollY: SharedValue<number>;
}

function useIsAppActive(): boolean {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return appState === 'active';
}

export function AmbientArtCanvas({
  streakLevel,
  hasReadToday,
  stateType,
  accentColor,
  screenFocused,
}: Props) {
  const { reducedMotion } = useAccessibleAnimation();
  const isAppActive = useIsAppActive();
  const lowPowerMode = useLowPowerMode();
  const { width, height } = useWindowDimensions();

  const active = screenFocused && isAppActive && !lowPowerMode && !reducedMotion;
  const mode = getTodayAmbientMode({ stateType, hasReadToday });
  const showCompletedEmbers = shouldShowCompletedEmberAmbience({ stateType, hasReadToday });
  const riveInputs = useMemo(() => getTodayAmbientRiveInputs({
    mode,
    stateType,
    accent: accentColor,
    width,
    height,
  }), [accentColor, height, mode, stateType, width]);

  if (!active) return null;

  if (showCompletedEmbers) {
    return <GoldEmberField streakLevel={streakLevel} active />;
  }

  if (mode === 'none') return null;

  return (
    <TodayAmbientRive
      source={TODAY_RIVE_SOURCES[mode]}
      active={active}
      inputs={riveInputs}
      mode={mode}
    />
  );
}
