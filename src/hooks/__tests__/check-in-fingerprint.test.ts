/**
 * Fingerprint tests for `useCheckInNotifications`.
 *
 * The fingerprint drives the debounced sync — whenever it changes, the owner
 * hook re-runs and reconciles the OS notification queue against the current
 * state. This test documents two invariants:
 *
 *   1. Every input that affects scheduling output MUST be in the fingerprint
 *      (policy, enabled toggles, times, byDay maps, onboarding state). If
 *      you add a new branch to `runSync`, you must also wire its inputs
 *      into the fingerprint, or the watcher won't fire on that change.
 *
 *   2. `lastMiddayCompletedDate` / `lastEveningCompletedDate` MUST NOT be in
 *      the fingerprint. The architecture deliberately schedules DAILY
 *      regardless of today's completion (the DAILY trigger recurs on its own
 *      tomorrow). Including completion dates would re-run the sync on every
 *      check-in finish without changing the scheduling output — wasted work,
 *      and it also complicates reasoning about when reschedules happen.
 *
 *      This invariant is load-bearing: the previous imperative helpers
 *      (`cancelAndRescheduleMiddayForTomorrow`) silently downgraded the
 *      DAILY trigger into a one-shot DATE trigger, breaking recurrence. The
 *      fix was to track completion as state but NOT trigger any
 *      rescheduling from that state change. See
 *      ~/vault/gotchas/expo-reschedule-helpers-silent-one-shot-downgrade.md
 *
 * ByDay invariant (added 2026-04-12):
 *
 *   When the user customizes per-day check-in schedules via
 *   `checkin-schedule.tsx`, the store fields `middayCheckInByDay` and
 *   `eveningWindDownByDay` hold `Record<string, string | null> | null`
 *   where null means "uniform mode" and non-null means "per-day mode with
 *   these overrides." BOTH the presence/absence AND the internal contents
 *   of these maps must be in the fingerprint — otherwise the owner hook
 *   won't re-run when the user toggles customize-by-day or tweaks a single
 *   day's time.
 *
 *   This was a dead-write bug Codex caught in the churned-user audit. The
 *   UI wrote byDay to state, but no consumer read it, so the per-day
 *   schedule was silently broken. See
 *   ~/vault/standards/grep-read-path-when-touching-ui.md
 *
 * We mirror the fingerprint function here as a pure helper so we can test it
 * without mocking React, Zustand, and the whole notification stack.
 */

type Policy = 'granted' | 'denied' | 'unknown';
type ByDay = Record<string, string | null> | null;

interface FingerprintInputs {
  policy: Policy;
  middayEnabled: boolean;
  eveningEnabled: boolean;
  middayTime: string;
  eveningTime: string;
  middayByDay: ByDay;
  eveningByDay: ByDay;
  hasCompletedOnboarding: boolean;
}

function buildFingerprint(inputs: FingerprintInputs): string {
  // Mirrors `useCheckInFingerprint` in src/hooks/useCheckInNotifications.ts.
  return JSON.stringify([
    inputs.policy,
    inputs.middayEnabled ? '1' : '0',
    inputs.eveningEnabled ? '1' : '0',
    inputs.middayTime,
    inputs.eveningTime,
    inputs.middayByDay,
    inputs.eveningByDay,
    inputs.hasCompletedOnboarding ? '1' : '0',
  ]);
}

const baseline: FingerprintInputs = {
  policy: 'granted',
  middayEnabled: true,
  eveningEnabled: true,
  middayTime: '12:30',
  eveningTime: '20:30',
  middayByDay: null,
  eveningByDay: null,
  hasCompletedOnboarding: true,
};

describe('useCheckInFingerprint — invariants', () => {
  describe('inputs that MUST change the fingerprint', () => {
    it('changes when policy transitions granted → denied', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({ ...baseline, policy: 'denied' });
      expect(a).not.toBe(b);
    });

    it('changes when policy transitions granted → unknown', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({ ...baseline, policy: 'unknown' });
      expect(a).not.toBe(b);
    });

    it('changes when policy transitions unknown → granted', () => {
      const a = buildFingerprint({ ...baseline, policy: 'unknown' });
      const b = buildFingerprint(baseline);
      expect(a).not.toBe(b);
    });

    it('changes when midday toggle flips', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({ ...baseline, middayEnabled: false });
      expect(a).not.toBe(b);
    });

    it('changes when evening toggle flips', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({ ...baseline, eveningEnabled: false });
      expect(a).not.toBe(b);
    });

    it('changes when midday time is adjusted', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({ ...baseline, middayTime: '13:00' });
      expect(a).not.toBe(b);
    });

    it('changes when evening time is adjusted', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({ ...baseline, eveningTime: '21:00' });
      expect(a).not.toBe(b);
    });

    it('changes when onboarding completion transitions', () => {
      const a = buildFingerprint({ ...baseline, hasCompletedOnboarding: false });
      const b = buildFingerprint(baseline);
      expect(a).not.toBe(b);
    });

    it('changes when midday transitions uniform → per-day (null → map)', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' },
      });
      expect(a).not.toBe(b);
    });

    it('changes when midday transitions per-day → uniform (map → null)', () => {
      const a = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '13:00', Tue: '13:00', Wed: '13:00', Thu: '13:00', Fri: '13:00', Sat: '13:00', Sun: '13:00' },
      });
      const b = buildFingerprint(baseline);
      expect(a).not.toBe(b);
    });

    it('changes when a single day in middayByDay is tweaked', () => {
      const a = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' },
      });
      const b = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '13:00', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' },
      });
      expect(a).not.toBe(b);
    });

    it('changes when a day in middayByDay transitions from time → null (skip)', () => {
      const a = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: '12:30', Sun: '12:30' },
      });
      const b = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '12:30', Tue: '12:30', Wed: '12:30', Thu: '12:30', Fri: '12:30', Sat: null, Sun: null },
      });
      expect(a).not.toBe(b);
    });

    it('changes when eveningByDay transitions null → map', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({
        ...baseline,
        eveningByDay: { Mon: '20:30', Tue: '20:30', Wed: '20:30', Thu: '20:30', Fri: '20:30', Sat: '20:30', Sun: '20:30' },
      });
      expect(a).not.toBe(b);
    });

    it('changes when a single day in eveningByDay is tweaked', () => {
      const a = buildFingerprint({
        ...baseline,
        eveningByDay: { Mon: '20:30', Tue: '20:30', Wed: '20:30', Thu: '20:30', Fri: '20:30', Sat: '20:30', Sun: '20:30' },
      });
      const b = buildFingerprint({
        ...baseline,
        eveningByDay: { Mon: '20:30', Tue: '20:30', Wed: '20:30', Thu: '20:30', Fri: '20:30', Sat: '20:30', Sun: '21:30' },
      });
      expect(a).not.toBe(b);
    });
  });

  describe('stability — identical inputs produce identical fingerprints', () => {
    it('re-reads with same inputs match', () => {
      const a = buildFingerprint(baseline);
      const b = buildFingerprint({ ...baseline });
      expect(a).toBe(b);
    });

    it('equivalent byDay maps with same shape produce identical fingerprints', () => {
      const a = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '12:30', Tue: '12:30', Wed: null, Thu: '12:30', Fri: '12:30', Sat: null, Sun: null },
      });
      const b = buildFingerprint({
        ...baseline,
        middayByDay: { Mon: '12:30', Tue: '12:30', Wed: null, Thu: '12:30', Fri: '12:30', Sat: null, Sun: null },
      });
      expect(a).toBe(b);
    });
  });

  describe('JSON.stringify (not join) — separator-safe encoding', () => {
    it('distinguishes values that would collide under a "|" join', () => {
      // Naive join with "|" would produce the same string for these two.
      // JSON.stringify surrounds strings with quotes and escapes internal
      // quotes, so they can never collide.
      const a = buildFingerprint({
        ...baseline,
        middayTime: '12|30',
        eveningTime: '20:30',
      });
      const b = buildFingerprint({
        ...baseline,
        middayTime: '12',
        eveningTime: '30|20:30',
      });
      expect(a).not.toBe(b);
    });
  });
});
