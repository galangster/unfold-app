import React from 'react';
import { EmberSystem } from '@/components/EmberSystem';
import {
  shouldShowCompletedEmberAmbience,
  type TodayAmbientStateType,
} from '@/lib/today-ambient-rive';
import type { ExclusionZone } from '@/lib/ember-system';

// ---------------------------------------------------------------------------
// AmbientArtCanvas
// ---------------------------------------------------------------------------
// Thin Today-state adapter over EmberSystem. Completed/rest states render the
// shared ambient ember field; everything pre-completion stays quiet (the old
// Skia shaders and Rive loops were removed — see plans/07-ui-deslop-brief.md
// §2). Focus/app-state/low-power gating and reduce-motion stills live inside
// EmberSystem itself.
// ---------------------------------------------------------------------------

interface Props {
  streakLevel: number;
  hasReadToday: boolean;
  stateType: TodayAmbientStateType;
  screenFocused: boolean;
}

// Keep ember luminance out of the hero card stack text (brightness budget —
// embers must stay dimmer than the dimmest text). Normalized to the screen.
const HOME_CARD_STACK_EXCLUSION: ReadonlyArray<ExclusionZone> = [
  { x: 0.04, y: 0.18, width: 0.92, height: 0.38 },
];

export function AmbientArtCanvas({
  streakLevel,
  hasReadToday,
  stateType,
  screenFocused,
}: Props) {
  if (!shouldShowCompletedEmberAmbience({ stateType, hasReadToday })) return null;

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
