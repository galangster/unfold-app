/**
 * Pure math for EveningCelebration's night-sky star field.
 *
 * The field used to run one infinite reanimated loop per star (55 loops).
 * Now two shared clocks drive every star, and each star derives its own
 * fade-in and twinkle from them inside its style worklet using its stable
 * random parameters (appear delay, twinkle period, brightness):
 *
 *   intro  one-shot, 0 → 1 over SKY_INTRO_MS — "ms since the sky appeared",
 *          saturating once the last star has faded in. Gates each star's
 *          fade-in and the moment its twinkle starts.
 *   phase  repeating, 0 → 1 every SKY_PHASE_PERIOD_MS — the shared twinkle
 *          timeline. Each star's period is snapped to an exact divisor of
 *          SKY_PHASE_PERIOD_MS (see snapTwinklePeriod) so the clock's wrap is
 *          invisible: frac((P - s) / (P / k)) === frac(-s / (P / k)).
 *
 * The per-star waveform reproduces the animation each star used to run:
 *   appear   0 → 1 over APPEAR_MS starting at appearDelay (ease-out cubic)
 *   twinkle  from appearDelay + TWINKLE_START_LAG_MS, repeat forever:
 *            b → 0.25·b over 40% of the period, then 0.25·b → b over the
 *            remaining 60% (both sine in-out)
 *   scale    0.7 at the dimmest point, 1.0 at full brightness
 *
 * Everything here is worklet-safe so it can run inside useAnimatedStyle.
 */

/** Earliest a star starts to appear after the sky opens. */
export const STAR_APPEAR_DELAY_MIN_MS = 200;
/** Latest a star starts to appear after the sky opens. */
export const STAR_APPEAR_DELAY_MAX_MS = 2000;
/** Duration of a star's fade-in. */
export const APPEAR_MS = 600;
/** Twinkling starts this long after the star begins to appear. */
export const TWINKLE_START_LAG_MS = 400;
/** Dimmest brightness multiplier of a twinkle cycle. */
export const TWINKLE_MIN_LEVEL = 0.25;
/** Share of a twinkle period spent dimming (the rest brightens again). */
export const TWINKLE_DIM_FRACTION = 0.4;
/** Star scale at the dimmest point of a twinkle (1.0 at full brightness). */
export const STAR_MIN_SCALE = 0.7;
/** Span of the one-shot intro clock: it must outlast the last star's fade-in. */
export const SKY_INTRO_MS = STAR_APPEAR_DELAY_MAX_MS + APPEAR_MS;
/** Period of the repeating phase clock every star's twinkle is derived from. */
export const SKY_PHASE_PERIOD_MS = 120_000;

/** Fractional part in [0, 1), also for negative inputs. */
export function frac(x: number): number {
  'worklet';
  return x - Math.floor(x);
}

/** Easing.inOut(Easing.sin) for t in [0, 1]. */
export function sineInOut(t: number): number {
  'worklet';
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** Easing.out(Easing.cubic) for t in [0, 1]. */
export function cubicOut(t: number): number {
  'worklet';
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * Snap a star's random twinkle period to the nearest exact divisor of the
 * phase clock's period, so the clock can wrap without a visible phase jump.
 * For the 2–5 s twinkles over a 120 s clock the snap moves a period by at
 * most ~2%, which keeps the field's randomized rhythm intact.
 */
export function snapTwinklePeriod(
  twinkleDuration: number,
  cyclePeriod: number = SKY_PHASE_PERIOD_MS,
): number {
  const cycles = Math.max(1, Math.round(cyclePeriod / twinkleDuration));
  return cyclePeriod / cycles;
}

/** Fade-in progress (0..1) of a star at `introElapsed` ms since the sky appeared. */
export function appearProgress(introElapsed: number, appearDelay: number): number {
  'worklet';
  const t = (introElapsed - appearDelay) / APPEAR_MS;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return cubicOut(t);
}

/**
 * Brightness multiplier (TWINKLE_MIN_LEVEL..1) at twinkle phase `s` in [0, 1):
 * 1 → 0.25 over the first 40% of the cycle, 0.25 → 1 over the remaining 60%.
 */
export function twinkleLevel(s: number): number {
  'worklet';
  const depth = 1 - TWINKLE_MIN_LEVEL;
  if (s < TWINKLE_DIM_FRACTION) {
    return 1 - depth * sineInOut(s / TWINKLE_DIM_FRACTION);
  }
  return (
    TWINKLE_MIN_LEVEL +
    depth * sineInOut((s - TWINKLE_DIM_FRACTION) / (1 - TWINKLE_DIM_FRACTION))
  );
}

/**
 * Twinkle phase in [0, 1) of a star, or -1 while the star has not started to
 * twinkle yet. `introElapsed` decides whether the twinkle has started;
 * `phaseElapsed` (ms on the repeating phase clock) positions it in its cycle,
 * offset so every star begins its first cycle at full brightness.
 */
export function twinklePhase(
  introElapsed: number,
  phaseElapsed: number,
  appearDelay: number,
  twinklePeriod: number,
): number {
  'worklet';
  const twinkleStart = appearDelay + TWINKLE_START_LAG_MS;
  if (introElapsed < twinkleStart) return -1;
  return frac((phaseElapsed - twinkleStart) / twinklePeriod);
}

export interface StarFrame {
  opacity: number;
  scale: number;
}

/** Opacity and scale of one star for the current clock readings. */
export function starFrame(
  introElapsed: number,
  phaseElapsed: number,
  appearDelay: number,
  twinklePeriod: number,
  brightness: number,
): StarFrame {
  'worklet';
  const appear = appearProgress(introElapsed, appearDelay);
  const phase = twinklePhase(introElapsed, phaseElapsed, appearDelay, twinklePeriod);
  const level = phase < 0 ? 1 : twinkleLevel(phase);
  return {
    opacity: appear * brightness * level,
    scale:
      STAR_MIN_SCALE +
      (1 - STAR_MIN_SCALE) * ((level - TWINKLE_MIN_LEVEL) / (1 - TWINKLE_MIN_LEVEL)),
  };
}
