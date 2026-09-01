import {
  APPEAR_MS,
  SKY_INTRO_MS,
  SKY_PHASE_PERIOD_MS,
  STAR_APPEAR_DELAY_MAX_MS,
  STAR_MIN_SCALE,
  TWINKLE_DIM_FRACTION,
  TWINKLE_MIN_LEVEL,
  TWINKLE_START_LAG_MS,
  appearProgress,
  cubicOut,
  frac,
  sineInOut,
  snapTwinklePeriod,
  starFrame,
  twinkleLevel,
  twinklePhase,
} from '../evening-twinkle';

// Reference model of the per-star reanimated composition the field used to
// run (one withDelay/withTiming fade-in plus one withDelay/withRepeat/
// withSequence twinkle per star), as a function of ms since the sky appeared.
function easeSineInOut(t: number): number {
  return (1 - Math.cos(Math.PI * t)) / 2;
}

function referenceStar(elapsed: number, appearDelay: number, twinkleDuration: number, brightness: number) {
  // appear.value = withDelay(appearDelay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }))
  let appear = 0;
  if (elapsed >= appearDelay) {
    const t = Math.min(1, (elapsed - appearDelay) / 600);
    appear = 1 - (1 - t) ** 3;
  }
  // twinkle.value = withDelay(appearDelay + 400, withRepeat(withSequence(
  //   withTiming(b * 0.25, { duration: D * 0.4, easing: Easing.inOut(Easing.sin) }),
  //   withTiming(b,        { duration: D * 0.6, easing: Easing.inOut(Easing.sin) }),
  // ), -1, true))  — withSequence restarts from its end value, so reverse is a no-op.
  let twinkle = brightness;
  const twinkleStart = appearDelay + 400;
  if (elapsed >= twinkleStart) {
    const t = (elapsed - twinkleStart) % twinkleDuration;
    const dimMs = twinkleDuration * 0.4;
    const brightMs = twinkleDuration * 0.6;
    twinkle = t < dimMs
      ? brightness + (brightness * 0.25 - brightness) * easeSineInOut(t / dimMs)
      : brightness * 0.25 + (brightness - brightness * 0.25) * easeSineInOut((t - dimMs) / brightMs);
  }
  // opacity: appear.value * twinkle.value
  // scale:   interpolate(twinkle.value, [brightness * 0.25, brightness], [0.7, 1.0])
  const scale = 0.7 + (1.0 - 0.7) * ((twinkle - brightness * 0.25) / (brightness - brightness * 0.25));
  return { opacity: appear * twinkle, scale };
}

// What the two clocks read at `elapsed` ms after the sky appeared.
function clocks(elapsed: number) {
  return {
    introElapsed: Math.min(elapsed, SKY_INTRO_MS),
    phaseElapsed: elapsed % SKY_PHASE_PERIOD_MS,
  };
}

describe('evening-twinkle primitives', () => {
  it('frac returns the fractional part in [0, 1) for positive and negative inputs', () => {
    expect(frac(0)).toBe(0);
    expect(frac(1)).toBe(0);
    expect(frac(2.25)).toBeCloseTo(0.25, 12);
    expect(frac(-0.25)).toBeCloseTo(0.75, 12);
    expect(frac(-3)).toBe(0);
  });

  it('sineInOut matches Easing.inOut(Easing.sin) at its anchor points and is monotonic', () => {
    expect(sineInOut(0)).toBeCloseTo(0, 12);
    expect(sineInOut(0.5)).toBeCloseTo(0.5, 12);
    expect(sineInOut(1)).toBeCloseTo(1, 12);
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = sineInOut(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('cubicOut matches Easing.out(Easing.cubic)', () => {
    expect(cubicOut(0)).toBe(0);
    expect(cubicOut(0.5)).toBeCloseTo(0.875, 12);
    expect(cubicOut(1)).toBe(1);
  });

  it('sizes the intro clock to outlast the last star’s fade-in', () => {
    expect(SKY_INTRO_MS).toBe(STAR_APPEAR_DELAY_MAX_MS + APPEAR_MS);
    expect(SKY_INTRO_MS).toBeGreaterThanOrEqual(STAR_APPEAR_DELAY_MAX_MS + TWINKLE_START_LAG_MS);
  });
});

describe('snapTwinklePeriod', () => {
  it('returns an exact divisor of the phase clock period', () => {
    for (let duration = 2000; duration < 5000; duration += 7) {
      const period = snapTwinklePeriod(duration);
      const cycles = SKY_PHASE_PERIOD_MS / period;
      expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9);
    }
  });

  it('moves a 2–5 s twinkle period by at most ~2%', () => {
    let worst = 0;
    for (let duration = 2000; duration < 5000; duration += 1) {
      const period = snapTwinklePeriod(duration);
      worst = Math.max(worst, Math.abs(period - duration) / duration);
    }
    expect(worst).toBeLessThan(0.022);
  });

  it('keeps periods that already divide the clock and never collapses to zero', () => {
    expect(snapTwinklePeriod(3000)).toBe(3000);
    expect(snapTwinklePeriod(4000)).toBe(4000);
    expect(snapTwinklePeriod(1_000_000)).toBe(SKY_PHASE_PERIOD_MS);
    expect(snapTwinklePeriod(1000, 10_000)).toBe(1000);
    expect(snapTwinklePeriod(1100, 10_000)).toBeCloseTo(10_000 / 9, 12);
  });
});

describe('appearProgress', () => {
  it('is 0 before the star’s delay, eases out over APPEAR_MS, then stays at 1', () => {
    expect(appearProgress(0, 500)).toBe(0);
    expect(appearProgress(500, 500)).toBe(0);
    expect(appearProgress(500 + APPEAR_MS / 2, 500)).toBeCloseTo(0.875, 12);
    expect(appearProgress(500 + APPEAR_MS, 500)).toBe(1);
    expect(appearProgress(10_000, 500)).toBe(1);
  });
});

describe('twinkleLevel', () => {
  it('starts bright, is dimmest at the end of the dimming share, and returns to bright', () => {
    expect(twinkleLevel(0)).toBeCloseTo(1, 12);
    expect(twinkleLevel(TWINKLE_DIM_FRACTION)).toBeCloseTo(TWINKLE_MIN_LEVEL, 12);
    expect(twinkleLevel(1 - 1e-9)).toBeCloseTo(1, 6);
  });

  it('is continuous across the dim/bright boundary and across the cycle wrap', () => {
    const boundary = TWINKLE_DIM_FRACTION;
    expect(Math.abs(twinkleLevel(boundary - 1e-9) - twinkleLevel(boundary))).toBeLessThan(1e-6);
    expect(Math.abs(twinkleLevel(1 - 1e-9) - twinkleLevel(0))).toBeLessThan(1e-6);
  });

  it('dims monotonically over the first 40% and brightens monotonically over the last 60%', () => {
    let previous = twinkleLevel(0);
    for (let i = 1; i <= 40; i++) {
      const value = twinkleLevel(i / 100);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      previous = value;
    }
    for (let i = 41; i <= 99; i++) {
      const value = twinkleLevel(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = value;
    }
  });

  it('never leaves [TWINKLE_MIN_LEVEL, 1]', () => {
    for (let i = 0; i < 1000; i++) {
      const value = twinkleLevel(i / 1000);
      expect(value).toBeGreaterThanOrEqual(TWINKLE_MIN_LEVEL - 1e-12);
      expect(value).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe('twinklePhase', () => {
  const appearDelay = 700;
  const period = 2500;
  const start = appearDelay + TWINKLE_START_LAG_MS;

  it('reports -1 until the star has appeared for TWINKLE_START_LAG_MS', () => {
    expect(twinklePhase(0, 0, appearDelay, period)).toBe(-1);
    expect(twinklePhase(start - 1, start - 1, appearDelay, period)).toBe(-1);
    expect(twinklePhase(start, start, appearDelay, period)).toBe(0);
  });

  it('cycles with the star’s own period, offset by its own start time', () => {
    expect(twinklePhase(SKY_INTRO_MS, start + 1250, appearDelay, period)).toBeCloseTo(0.5, 12);
    expect(twinklePhase(SKY_INTRO_MS, start + 2500, appearDelay, period)).toBeCloseTo(0, 12);
    expect(twinklePhase(SKY_INTRO_MS, start + 2500 * 7 + 625, appearDelay, period)).toBeCloseTo(0.25, 12);
  });

  it('keeps stars out of lockstep: different periods or delays give different phases', () => {
    const elapsed = 5000;
    const a = twinklePhase(SKY_INTRO_MS, elapsed, 700, snapTwinklePeriod(2500));
    const b = twinklePhase(SKY_INTRO_MS, elapsed, 700, snapTwinklePeriod(3100));
    const c = twinklePhase(SKY_INTRO_MS, elapsed, 1300, snapTwinklePeriod(2500));
    expect(a).not.toBeCloseTo(b, 3);
    expect(a).not.toBeCloseTo(c, 3);
  });

  it('is seamless across the phase clock wrap for snapped periods', () => {
    for (let duration = 2000; duration < 5000; duration += 97) {
      for (const delay of [200, 1111.5, 2000]) {
        const snapped = snapTwinklePeriod(duration);
        const before = twinklePhase(SKY_INTRO_MS, SKY_PHASE_PERIOD_MS - 1e-6, delay, snapped);
        const after = twinklePhase(SKY_INTRO_MS, 0, delay, snapped);
        // Compare on the circle: 0 and 1 - epsilon are the same phase.
        const gap = Math.abs(before - after);
        expect(Math.min(gap, 1 - gap)).toBeLessThan(1e-8);
      }
    }
  });
});

describe('starFrame', () => {
  const appearDelay = 900;
  const period = snapTwinklePeriod(3200);
  const brightness = 0.8;

  it('is invisible at full size before the star appears', () => {
    expect(starFrame(0, 0, appearDelay, period, brightness)).toEqual({ opacity: 0, scale: 1 });
    expect(starFrame(appearDelay, appearDelay, appearDelay, period, brightness)).toEqual({ opacity: 0, scale: 1 });
  });

  it('fades in at full brightness before the twinkle starts', () => {
    const elapsed = appearDelay + TWINKLE_START_LAG_MS;
    const frame = starFrame(elapsed, elapsed, appearDelay, period, brightness);
    expect(frame.opacity).toBeCloseTo(cubicOut(TWINKLE_START_LAG_MS / APPEAR_MS) * brightness, 12);
    expect(frame.scale).toBe(1);
  });

  it('reaches its dimmest, smallest point 40% of the way through a cycle', () => {
    const elapsed = appearDelay + TWINKLE_START_LAG_MS + period * TWINKLE_DIM_FRACTION;
    const { introElapsed, phaseElapsed } = clocks(elapsed);
    const frame = starFrame(introElapsed, phaseElapsed, appearDelay, period, brightness);
    expect(frame.opacity).toBeCloseTo(brightness * TWINKLE_MIN_LEVEL, 12);
    expect(frame.scale).toBeCloseTo(STAR_MIN_SCALE, 12);
  });

  it('never exceeds the star’s brightness or leaves the [0.7, 1] scale band', () => {
    for (let elapsed = 0; elapsed <= 20_000; elapsed += 37) {
      const { introElapsed, phaseElapsed } = clocks(elapsed);
      const frame = starFrame(introElapsed, phaseElapsed, appearDelay, period, brightness);
      expect(frame.opacity).toBeGreaterThanOrEqual(0);
      expect(frame.opacity).toBeLessThanOrEqual(brightness + 1e-12);
      expect(frame.scale).toBeGreaterThanOrEqual(STAR_MIN_SCALE - 1e-12);
      expect(frame.scale).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('reproduces the original per-star reanimated timeline for a spread of stars and times', () => {
    const stars = [
      { appearDelay: 200, twinkleDuration: 2000, brightness: 0.4 },
      { appearDelay: 1234.5, twinkleDuration: 3456.7, brightness: 0.73 },
      { appearDelay: 2000, twinkleDuration: 5000, brightness: 1.0 },
    ];
    for (const star of stars) {
      const snapped = snapTwinklePeriod(star.twinkleDuration);
      for (let elapsed = 0; elapsed <= 30_000; elapsed += 53) {
        const expected = referenceStar(elapsed, star.appearDelay, snapped, star.brightness);
        const { introElapsed, phaseElapsed } = clocks(elapsed);
        const actual = starFrame(introElapsed, phaseElapsed, star.appearDelay, snapped, star.brightness);
        expect(actual.opacity).toBeCloseTo(expected.opacity, 10);
        expect(actual.scale).toBeCloseTo(expected.scale, 10);
      }
    }
  });

  it('shows no jump when the phase clock wraps', () => {
    for (const twinkleDuration of [2000, 2750.25, 3999, 4999]) {
      const snapped = snapTwinklePeriod(twinkleDuration);
      for (const delay of [200, 1111.5, 2000]) {
        const before = starFrame(SKY_INTRO_MS, SKY_PHASE_PERIOD_MS - 1e-6, delay, snapped, 0.9);
        const after = starFrame(SKY_INTRO_MS, 0, delay, snapped, 0.9);
        expect(after.opacity).toBeCloseTo(before.opacity, 6);
        expect(after.scale).toBeCloseTo(before.scale, 6);
      }
    }
  });
});
