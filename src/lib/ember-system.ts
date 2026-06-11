/**
 * EmberSystem pure logic — tiers, presets, reduce-motion stills, exclusion masks.
 *
 * The single source of truth for every ember surface in the app
 * (plans/07-ui-deslop-brief.md §2). The canonical look is the day-completion
 * celebration: GoldEmberField pinned at streakLevel=7 — count 22, size 3.5–7,
 * opacity 0.55–0.9, bottom glow 0.22/340 — plus 18 one-shot luminous motes.
 * Everything else is a parameterization of that recipe.
 *
 * Kept free of React/react-native imports so the preset and gating math is
 * unit-testable in isolation.
 */

// ---------------------------------------------------------------------------
// Hex color helpers — derive lighter/darker variants from accent.
// "Gold" is NOT a fixed brand color: it is the user-selectable accent
// (7 presets in store.ts). Never hardcode a warm-gold hex here.
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Lighten a hex color by a factor (0-1) */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Darken a hex color by a factor (0-1) */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmberVariant = 'celebration' | 'ambient';
export type EmberDirection = 'up' | 'down' | 'both';

export interface EmberTier {
  count: number;
  sizeMin: number;
  sizeMax: number;
  opacityMin: number;
  opacityMax: number;
  glowOpacity: number;
  glowHeight: number;
}

/** Rectangular exclusion zone, normalized 0–1 against the mounted layout. */
export interface ExclusionZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedEmberParams extends EmberTier {
  /** Light theme renders soft radial halo sprites instead of plain dots. */
  halo: boolean;
}

// ---------------------------------------------------------------------------
// Streak-based intensity tiers — copied verbatim from GoldEmberField.
// These values are canon; do not re-derive.
// ---------------------------------------------------------------------------

const TIERS: EmberTier[] = [
  { count: 8, sizeMin: 2.5, sizeMax: 5, opacityMin: 0.35, opacityMax: 0.7, glowOpacity: 0.05, glowHeight: 180 },
  { count: 12, sizeMin: 3, sizeMax: 5.5, opacityMin: 0.45, opacityMax: 0.75, glowOpacity: 0.1, glowHeight: 220 },
  { count: 16, sizeMin: 3, sizeMax: 6, opacityMin: 0.5, opacityMax: 0.85, glowOpacity: 0.16, glowHeight: 280 },
  { count: 22, sizeMin: 3.5, sizeMax: 7, opacityMin: 0.55, opacityMax: 0.9, glowOpacity: 0.22, glowHeight: 340 },
  { count: 28, sizeMin: 4, sizeMax: 8, opacityMin: 0.65, opacityMax: 0.95, glowOpacity: 0.28, glowHeight: 400 },
];

export function getEmberTier(streak: number): EmberTier {
  if (streak <= 0) return TIERS[0]!;
  if (streak <= 2) return TIERS[1]!;
  if (streak <= 6) return TIERS[2]!;
  if (streak <= 13) return TIERS[3]!;
  return TIERS[4]!;
}

/**
 * The celebration baseline — GoldEmberField pinned at streakLevel=7
 * (CompletionCelebration.tsx). "The app's single best emotional beat";
 * its dark-mode rendering must never change.
 */
export const CELEBRATION_TIER: EmberTier = getEmberTier(7);

/** Number of one-shot luminous motes layered over the celebration field. */
export const CELEBRATION_MOTE_COUNT = 18;

/**
 * When a surface specifies an explicit ember count (the per-surface presets in
 * the brief), pick the tier whose density is closest so glow and sprite params
 * scale coherently with the requested density. Ties round down (quieter).
 */
export function getTierForCount(count: number): EmberTier {
  let best = TIERS[0]!;
  let bestDist = Infinity;
  for (const tier of TIERS) {
    const dist = Math.abs(count - tier.count);
    if (dist < bestDist) {
      best = tier;
      bestDist = dist;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Param resolution — variant + per-surface props → render params
// ---------------------------------------------------------------------------

export interface ResolveEmberParamsInput {
  variant: EmberVariant;
  isDark: boolean;
  streakLevel?: number;
  /** Explicit ambient ember count (per-surface preset override). */
  count?: number;
  /** 0–1 scalar on count, particle opacity, and glow opacity. Ambient only. */
  intensity?: number;
  /** Raise the ambient opacity floor (Today home preset uses ≥0.5). */
  opacityFloor?: number;
}

/**
 * Resolve the final particle/glow parameters for a surface.
 *
 * Order of operations (ambient): tier → count override → intensity scalar →
 * opacity floor → light-mode retune. The celebration variant is pinned to the
 * canonical tier and ignores streak/count/intensity so the baseline cannot
 * drift; only the light retune applies (dark celebration is canon-locked).
 */
export function resolveEmberParams(input: ResolveEmberParamsInput): ResolvedEmberParams {
  const { variant, isDark } = input;

  let tier: EmberTier;
  let count: number;
  let opacityMin: number;
  let opacityMax: number;
  let glowOpacity: number;

  if (variant === 'celebration') {
    tier = CELEBRATION_TIER;
    count = tier.count;
    opacityMin = tier.opacityMin;
    opacityMax = tier.opacityMax;
    glowOpacity = tier.glowOpacity;
  } else {
    tier = input.count !== undefined && input.streakLevel === undefined
      ? getTierForCount(input.count)
      : getEmberTier(input.streakLevel ?? 0);
    count = input.count ?? tier.count;
    opacityMin = tier.opacityMin;
    opacityMax = tier.opacityMax;
    glowOpacity = tier.glowOpacity;

    const intensity = clamp01(input.intensity ?? 1);
    if (intensity < 1) {
      count = Math.max(1, Math.round(count * intensity));
      opacityMin *= intensity;
      opacityMax *= intensity;
      glowOpacity *= intensity;
    }

    if (input.opacityFloor !== undefined) {
      opacityMin = Math.max(opacityMin, input.opacityFloor);
      opacityMax = Math.max(opacityMax, opacityMin);
    }
  }

  let sizeMin = tier.sizeMin;
  let sizeMax = tier.sizeMax;
  let halo = false;

  if (!isDark) {
    // Light-mode retune (brief §2): fewer, larger, warmer particles with a
    // soft radial halo — fixes "olive-brown dirt specks on cream".
    count = Math.max(3, Math.round(count * 0.6));
    sizeMin += 1.5;
    sizeMax += 1.5;
    opacityMax = Math.min(opacityMax, 0.5);
    opacityMin = Math.min(opacityMin, opacityMax);
    halo = true;
  }

  return {
    count,
    sizeMin,
    sizeMax,
    opacityMin,
    opacityMax,
    glowOpacity,
    glowHeight: tier.glowHeight,
    halo,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Accent-derived palettes
// ---------------------------------------------------------------------------

export interface EmberPalette {
  primary: string;
  secondary: string;
  tertiary: string;
}

/**
 * Derive the 3-tier ember palette from the current accent color.
 * Dark values are copied verbatim from GoldEmberField (canon).
 * Light values are the §2 retune: noticeably less darkening so the sprites
 * read as the accent (with halo carrying the glow) instead of muddy specks.
 */
export function getEmberPalette(accent: string, isDark: boolean): EmberPalette {
  if (isDark) {
    return {
      primary: lighten(accent, 0.15),
      secondary: lighten(accent, 0.35),
      tertiary: accent,
    };
  }
  return {
    primary: darken(accent, 0.08),
    secondary: accent,
    tertiary: darken(accent, 0.18),
  };
}

// ---------------------------------------------------------------------------
// Gating — hoisted from AmbientArtCanvas so every surface gets it for free
// ---------------------------------------------------------------------------

export interface EmberGatingInput {
  active: boolean;
  appActive: boolean;
  lowPowerMode: boolean;
}

/** Whether the ember layer should render at all (reduce motion is handled separately — it gets a designed still, not null). */
export function shouldRenderEmberLayer({ active, appActive, lowPowerMode }: EmberGatingInput): boolean {
  return active && appActive && !lowPowerMode;
}

// ---------------------------------------------------------------------------
// Exclusion masks — brightness budget over headline blocks / chrome
// ---------------------------------------------------------------------------

/** Feather distance (px) over which embers fade out inside an exclusion zone. */
export const EXCLUSION_FEATHER_PX = 40;

/**
 * Opacity multiplier for a particle at (x, y) given exclusion zones.
 * 1 outside all zones, fading to 0 over EXCLUSION_FEATHER_PX of penetration.
 * Pure math so it can run as a worklet and be unit-tested.
 */
export function exclusionOpacityMultiplier(
  x: number,
  y: number,
  zones: ReadonlyArray<ExclusionZone>,
  layoutWidth: number,
  layoutHeight: number,
): number {
  'worklet';
  let multiplier = 1;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]!;
    const zx = zone.x * layoutWidth;
    const zy = zone.y * layoutHeight;
    const zw = zone.width * layoutWidth;
    const zh = zone.height * layoutHeight;
    const depth = Math.min(x - zx, zx + zw - x, y - zy, zy + zh - y);
    if (depth <= 0) continue; // outside this zone
    const fade = Math.max(0, 1 - depth / EXCLUSION_FEATHER_PX);
    multiplier = Math.min(multiplier, fade);
  }
  return multiplier;
}

/** True when the point sits inside any exclusion zone (used for static stills). */
export function isInsideExclusionZone(
  x: number,
  y: number,
  zones: ReadonlyArray<ExclusionZone>,
  layoutWidth: number,
  layoutHeight: number,
): boolean {
  return exclusionOpacityMultiplier(x, y, zones, layoutWidth, layoutHeight) < 1;
}

// ---------------------------------------------------------------------------
// Reduce-motion stills — "a poster, not a pause"
// Template: EveningCelebration's static stars / GlowBackground's static orbs.
// Energy lives in geometry and luminance, never frozen velocity.
// ---------------------------------------------------------------------------

export interface StaticEmber {
  x: number;
  y: number;
  size: number;
  opacity: number;
  colorIdx: number;
}

/**
 * Hand-placed (seeded, deterministic) ambient still: ~6 embers biased toward
 * the glow anchor, 3 size classes for depth, 0.4× maxOpacity. No animation.
 * Positions are normalized; `direction='down'` mirrors toward the top anchor.
 */
const AMBIENT_STILL_SEEDS: ReadonlyArray<{ x: number; y: number; sizeClass: 0 | 1 | 2 }> = [
  { x: 0.16, y: 0.86, sizeClass: 2 },
  { x: 0.34, y: 0.93, sizeClass: 0 },
  { x: 0.52, y: 0.82, sizeClass: 1 },
  { x: 0.68, y: 0.91, sizeClass: 2 },
  { x: 0.84, y: 0.85, sizeClass: 0 },
  { x: 0.45, y: 0.72, sizeClass: 0 },
];

export function getStaticAmbientEmbers(
  params: ResolvedEmberParams,
  layoutWidth: number,
  layoutHeight: number,
  direction: EmberDirection,
  zones: ReadonlyArray<ExclusionZone> = [],
): StaticEmber[] {
  const sizeClasses = [
    params.sizeMin,
    (params.sizeMin + params.sizeMax) / 2,
    params.sizeMax,
  ];
  return AMBIENT_STILL_SEEDS
    .map((seed, i) => {
      const ny = direction === 'down' ? 1 - seed.y : seed.y;
      return {
        x: seed.x * layoutWidth,
        y: ny * layoutHeight,
        size: sizeClasses[seed.sizeClass]!,
        opacity: params.opacityMax * 0.4,
        colorIdx: i % 3,
      };
    })
    .filter((ember) => !isInsideExclusionZone(ember.x, ember.y, zones, layoutWidth, layoutHeight));
}

/** Ring size of the celebration still (sparse radial burst around the hero block). */
export const CELEBRATION_STILL_RING_COUNT = 12;

/**
 * Celebration still: the same sprites restructured radially around the hero
 * text block — a sparse ring/burst arrangement. Deterministic; alternating
 * radius and size classes give the burst read without motion.
 */
export function getStaticCelebrationRing(
  params: ResolvedEmberParams,
  layoutWidth: number,
  layoutHeight: number,
): StaticEmber[] {
  const centerX = layoutWidth / 2;
  const centerY = layoutHeight / 2;
  const radiusX = layoutWidth * 0.36;
  const radiusY = layoutHeight * 0.2;
  const sizeClasses = [
    params.sizeMin,
    (params.sizeMin + params.sizeMax) / 2,
    params.sizeMax,
  ];

  return Array.from({ length: CELEBRATION_STILL_RING_COUNT }, (_, i) => {
    const angle = (i / CELEBRATION_STILL_RING_COUNT) * Math.PI * 2 - Math.PI / 2;
    // Alternate radius ±12% so the ring reads as a burst, not a perfect circle.
    const wobble = i % 2 === 0 ? 1.12 : 0.88;
    return {
      x: centerX + Math.cos(angle) * radiusX * wobble,
      y: centerY + Math.sin(angle) * radiusY * wobble,
      size: sizeClasses[i % 3]!,
      opacity: params.opacityMax * 0.6,
      colorIdx: i % 3,
    };
  });
}

/**
 * Celebration still glow: "intensified one step" — the tier above the
 * canonical celebration tier.
 */
export function getCelebrationStillGlow(): Pick<EmberTier, 'glowOpacity' | 'glowHeight'> {
  const idx = TIERS.indexOf(CELEBRATION_TIER);
  const next = TIERS[Math.min(idx + 1, TIERS.length - 1)]!;
  return { glowOpacity: next.glowOpacity, glowHeight: next.glowHeight };
}

// ---------------------------------------------------------------------------
// Direction math
// ---------------------------------------------------------------------------

/**
 * Split a particle count across travel directions.
 * 'both' biases upward 60/40 (the hearth is still the bottom light source).
 */
export function splitDirections(count: number, direction: EmberDirection): { up: number; down: number } {
  if (direction === 'down') return { up: 0, down: count };
  if (direction === 'both') {
    const up = Math.ceil(count * 0.6);
    return { up, down: count - up };
  }
  return { up: count, down: 0 };
}
