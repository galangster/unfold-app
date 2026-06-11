import {
  CELEBRATION_MOTE_COUNT,
  CELEBRATION_STILL_RING_COUNT,
  CELEBRATION_TIER,
  EXCLUSION_FEATHER_PX,
  exclusionOpacityMultiplier,
  getCelebrationStillGlow,
  getEmberPalette,
  getEmberTier,
  getStaticAmbientEmbers,
  getStaticCelebrationRing,
  getTierForCount,
  isInsideExclusionZone,
  lighten,
  darken,
  resolveEmberParams,
  shouldRenderEmberLayer,
  splitDirections,
  type ExclusionZone,
} from '../ember-system';

const W = 390;
const H = 844;

describe('ember tiers (canon — copied from GoldEmberField)', () => {
  it('keeps the exact streak tier table', () => {
    expect(getEmberTier(0)).toEqual({ count: 8, sizeMin: 2.5, sizeMax: 5, opacityMin: 0.35, opacityMax: 0.7, glowOpacity: 0.05, glowHeight: 180 });
    expect(getEmberTier(2)).toEqual({ count: 12, sizeMin: 3, sizeMax: 5.5, opacityMin: 0.45, opacityMax: 0.75, glowOpacity: 0.1, glowHeight: 220 });
    expect(getEmberTier(6)).toEqual({ count: 16, sizeMin: 3, sizeMax: 6, opacityMin: 0.5, opacityMax: 0.85, glowOpacity: 0.16, glowHeight: 280 });
    expect(getEmberTier(13)).toEqual({ count: 22, sizeMin: 3.5, sizeMax: 7, opacityMin: 0.55, opacityMax: 0.9, glowOpacity: 0.22, glowHeight: 340 });
    expect(getEmberTier(14)).toEqual({ count: 28, sizeMin: 4, sizeMax: 8, opacityMin: 0.65, opacityMax: 0.95, glowOpacity: 0.28, glowHeight: 400 });
  });

  it('pins the celebration baseline to tier-7: count 22, size 3.5–7, opacity 0.55–0.9, glow 0.22/340', () => {
    expect(CELEBRATION_TIER).toEqual({
      count: 22,
      sizeMin: 3.5,
      sizeMax: 7,
      opacityMin: 0.55,
      opacityMax: 0.9,
      glowOpacity: 0.22,
      glowHeight: 340,
    });
    expect(CELEBRATION_MOTE_COUNT).toBe(18);
  });

  it('maps explicit preset counts to the nearest tier, rounding ties down', () => {
    expect(getTierForCount(8).count).toBe(8);
    expect(getTierForCount(10).count).toBe(8); // tie 8/12 → quieter tier
    expect(getTierForCount(14).count).toBe(12); // tie 12/16 → quieter tier
    expect(getTierForCount(20).count).toBe(22);
    expect(getTierForCount(40).count).toBe(28);
  });
});

describe('resolveEmberParams', () => {
  it('celebration dark is the untouched canon — streak/count/intensity cannot move it', () => {
    const params = resolveEmberParams({
      variant: 'celebration',
      isDark: true,
      streakLevel: 0,
      count: 4,
      intensity: 0.1,
    });
    expect(params).toEqual({ ...CELEBRATION_TIER, halo: false });
  });

  it('ambient follows the streak tiers', () => {
    const params = resolveEmberParams({ variant: 'ambient', isDark: true, streakLevel: 14 });
    expect(params.count).toBe(28);
    expect(params.glowOpacity).toBe(0.28);
    expect(params.halo).toBe(false);
  });

  it('explicit count overrides density and derives glow from the nearest tier', () => {
    const params = resolveEmberParams({ variant: 'ambient', isDark: true, count: 20 });
    expect(params.count).toBe(20);
    // nearest tier to 20 is the count-22 tier
    expect(params.glowOpacity).toBe(0.22);
    expect(params.glowHeight).toBe(340);
  });

  it('intensity scales count, particle opacity, and glow opacity', () => {
    const params = resolveEmberParams({ variant: 'ambient', isDark: true, count: 14, intensity: 0.6 });
    expect(params.count).toBe(Math.round(14 * 0.6));
    const baseTier = getTierForCount(14);
    expect(params.opacityMin).toBeCloseTo(baseTier.opacityMin * 0.6);
    expect(params.opacityMax).toBeCloseTo(baseTier.opacityMax * 0.6);
    expect(params.glowOpacity).toBeCloseTo(baseTier.glowOpacity * 0.6);
  });

  it('raises the ambient opacity floor for the home preset', () => {
    const params = resolveEmberParams({ variant: 'ambient', isDark: true, streakLevel: 0, opacityFloor: 0.5 });
    expect(params.opacityMin).toBe(0.5);
    expect(params.opacityMax).toBeGreaterThanOrEqual(0.5);
  });

  it('light mode retunes: fewer (×0.6), larger (+1.5), opacity ceiling 0.5, halo sprite', () => {
    const dark = resolveEmberParams({ variant: 'ambient', isDark: true, streakLevel: 7 });
    const light = resolveEmberParams({ variant: 'ambient', isDark: false, streakLevel: 7 });
    expect(light.count).toBe(Math.round(dark.count * 0.6));
    expect(light.sizeMin).toBe(dark.sizeMin + 1.5);
    expect(light.sizeMax).toBe(dark.sizeMax + 1.5);
    expect(light.opacityMax).toBeLessThanOrEqual(0.5);
    expect(light.opacityMin).toBeLessThanOrEqual(light.opacityMax);
    expect(light.halo).toBe(true);
  });

  it('light mode never drops below 3 embers', () => {
    const params = resolveEmberParams({ variant: 'ambient', isDark: false, count: 4, intensity: 0.5 });
    expect(params.count).toBeGreaterThanOrEqual(3);
  });
});

describe('accent palette (accent-token discipline — never a hardcoded gold)', () => {
  it('derives the dark palette exactly like GoldEmberField did', () => {
    const accent = '#C8A55C';
    expect(getEmberPalette(accent, true)).toEqual({
      primary: lighten(accent, 0.15),
      secondary: lighten(accent, 0.35),
      tertiary: accent,
    });
  });

  it('follows a non-gold accent (Ocean users get blue embers by design)', () => {
    const ocean = '#4C8DAE';
    const palette = getEmberPalette(ocean, true);
    expect(palette.tertiary).toBe(ocean);
    expect(palette.primary).toBe(lighten(ocean, 0.15));
    const lightPalette = getEmberPalette(ocean, false);
    expect(lightPalette.secondary).toBe(ocean);
    expect(lightPalette.primary).toBe(darken(ocean, 0.08));
  });
});

describe('gating (hoisted from AmbientArtCanvas)', () => {
  it('renders only when active + app active + not low power', () => {
    expect(shouldRenderEmberLayer({ active: true, appActive: true, lowPowerMode: false })).toBe(true);
    expect(shouldRenderEmberLayer({ active: false, appActive: true, lowPowerMode: false })).toBe(false);
    expect(shouldRenderEmberLayer({ active: true, appActive: false, lowPowerMode: false })).toBe(false);
    expect(shouldRenderEmberLayer({ active: true, appActive: true, lowPowerMode: true })).toBe(false);
  });
});

describe('exclusion masks', () => {
  const zones: ExclusionZone[] = [{ x: 0.25, y: 0.25, width: 0.5, height: 0.25 }];

  it('keeps full opacity outside every zone', () => {
    expect(exclusionOpacityMultiplier(10, 10, zones, W, H)).toBe(1);
    expect(exclusionOpacityMultiplier(W - 5, H - 5, zones, W, H)).toBe(1);
  });

  it('fades to 0 deep inside a zone', () => {
    const centerX = 0.5 * W;
    const centerY = 0.375 * H; // zone vertical center
    expect(exclusionOpacityMultiplier(centerX, centerY, zones, W, H)).toBe(0);
  });

  it('feathers across the zone edge', () => {
    const edgeX = 0.25 * W;
    const insideX = edgeX + EXCLUSION_FEATHER_PX / 2;
    const centerY = 0.375 * H;
    const multiplier = exclusionOpacityMultiplier(insideX, centerY, zones, W, H);
    expect(multiplier).toBeGreaterThan(0);
    expect(multiplier).toBeLessThan(1);
  });

  it('isInsideExclusionZone matches the multiplier', () => {
    expect(isInsideExclusionZone(0.5 * W, 0.375 * H, zones, W, H)).toBe(true);
    expect(isInsideExclusionZone(5, 5, zones, W, H)).toBe(false);
  });
});

describe('reduce-motion stills (a poster, not a pause)', () => {
  const params = resolveEmberParams({ variant: 'ambient', isDark: true, streakLevel: 7 });

  it('ambient still: ~6 seeded embers biased toward the bottom glow anchor at 0.4× max opacity', () => {
    const embers = getStaticAmbientEmbers(params, W, H, 'up');
    expect(embers).toHaveLength(6);
    for (const ember of embers) {
      expect(ember.y / H).toBeGreaterThanOrEqual(0.6);
      expect(ember.opacity).toBeCloseTo(params.opacityMax * 0.4);
    }
    // depth via multiple size classes
    expect(new Set(embers.map((e) => e.size)).size).toBeGreaterThanOrEqual(2);
    // deterministic — a poster, not a dice roll
    expect(getStaticAmbientEmbers(params, W, H, 'up')).toEqual(embers);
  });

  it('ambient still mirrors toward the top anchor for falling fields', () => {
    const embers = getStaticAmbientEmbers(params, W, H, 'down');
    for (const ember of embers) {
      expect(ember.y / H).toBeLessThanOrEqual(0.4);
    }
  });

  it('ambient still respects exclusion zones', () => {
    const everything: ExclusionZone[] = [{ x: 0, y: 0, width: 1, height: 1 }];
    expect(getStaticAmbientEmbers(params, W, H, 'up', everything)).toHaveLength(0);
  });

  it('celebration still: sparse deterministic ring around the hero block', () => {
    const celebration = resolveEmberParams({ variant: 'celebration', isDark: true });
    const ring = getStaticCelebrationRing(celebration, W, H);
    expect(ring).toHaveLength(CELEBRATION_STILL_RING_COUNT);
    for (const ember of ring) {
      const dx = Math.abs(ember.x - W / 2) / W;
      const dy = Math.abs(ember.y - H / 2) / H;
      // stays a ring: never collapses onto the hero text, never offscreen
      expect(Math.max(dx, dy)).toBeGreaterThan(0.05);
      expect(ember.x).toBeGreaterThanOrEqual(-celebration.sizeMax);
      expect(ember.x).toBeLessThanOrEqual(W + celebration.sizeMax);
      expect(ember.y).toBeGreaterThanOrEqual(0);
      expect(ember.y).toBeLessThanOrEqual(H);
    }
    expect(getStaticCelebrationRing(celebration, W, H)).toEqual(ring);
  });

  it('celebration still glow intensifies one tier step above canon', () => {
    expect(getCelebrationStillGlow()).toEqual({ glowOpacity: 0.28, glowHeight: 400 });
  });
});

describe('direction math', () => {
  it('keeps the canon rising grammar by default', () => {
    expect(splitDirections(22, 'up')).toEqual({ up: 22, down: 0 });
  });

  it('replaces the paywall scaleY:-1 hack with a native falling field', () => {
    expect(splitDirections(14, 'down')).toEqual({ up: 0, down: 14 });
  });

  it('biases bidirectional fields upward 60/40 toward the hearth', () => {
    expect(splitDirections(20, 'both')).toEqual({ up: 12, down: 8 });
    expect(splitDirections(10, 'both')).toEqual({ up: 6, down: 4 });
  });
});
