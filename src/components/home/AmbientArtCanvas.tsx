import React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { GoldEmberField } from '@/components/home/GoldEmberField';

// ---------------------------------------------------------------------------
// AmbientArtCanvas
// ---------------------------------------------------------------------------
// Skia shaders (concentric rings + organic noise) removed — they were
// invisible in practice but consumed ~25% CPU from continuous GPU rendering
// and a rotation sensor. Using GoldEmberField (Reanimated views) for the
// post-reading ember glow instead of Skia Atlas.
// ---------------------------------------------------------------------------

interface Props {
  streakLevel: number;
  hasReadToday: boolean;
  scrollY: SharedValue<number>;
}

export function AmbientArtCanvas({ streakLevel, hasReadToday }: Props) {
  const { reducedMotion } = useAccessibleAnimation();

  if (reducedMotion || !hasReadToday) return null;

  return <GoldEmberField streakLevel={streakLevel} active />;
}
