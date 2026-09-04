/**
 * Onboarding funnel telemetry — the instrument that makes silent abandonment
 * visible.
 *
 * The P0 in `plans/08-p0-onboarding-restart.md` threw no exception. Onboarding
 * held every answer in React state and wrote the user record only on its final
 * step, which sits behind a paywall with no exit. Anyone who closed the app
 * there relaunched as a brand-new install and was asked their name again. No
 * crash reporter would ever have seen it, because nothing crashed. A user had
 * to report it.
 *
 * A crash reporter cannot catch a bug whose only symptom is that nothing
 * happens. A funnel can. `reportAbandonedOnboarding` below is the signal: a
 * cluster of abandonments on one step id is the alarm that says a release
 * stranded people there.
 *
 * PRIVACY. This app holds journal entries about people's spiritual struggles
 * and their family members' real names. Nothing a person typed ever leaves
 * here: only step ids, bucketed ages, and the two completion outcomes. The
 * device id is the app's auth credential and is never sent either. Step ids are
 * run through `sanitizeStepId` so a free-text value can never reach the wire
 * even if a caller passes the wrong thing.
 *
 * Pure and free of native imports beyond the MMKV adapter that every persisted
 * store in this codebase uses, so it unit-tests directly — the same reason
 * creation-gate-policy.ts and onboarding-welcome-back-copy.ts live in lib.
 */
import { addAppBreadcrumb, captureAppEvent } from '@/lib/sentry';
import { mmkvStorage } from './mmkv-storage';

/** Breadcrumb category for every onboarding trail entry. */
export const ONBOARDING_BREADCRUMB_CATEGORY = 'onboarding';

/** Event names. Stable strings: dashboards and alerts key off them. */
export const ONBOARDING_STARTED_EVENT = 'onboarding_started';
export const ONBOARDING_RESUMED_EVENT = 'onboarding_resumed';
export const ONBOARDING_COMPLETED_EVENT = 'onboarding_completed';
export const ONBOARDING_ABANDONED_EVENT = 'onboarding_abandoned';

/**
 * How long a draft must sit untouched before the person who wrote it counts as
 * abandoned rather than interrupted.
 *
 * Six hours. Long enough that someone genuinely dropped out instead of pausing
 * for coffee or answering a text; short enough that a bad release which strands
 * people at a step is visible the same day rather than the next morning.
 */
export const ONBOARDING_ABANDONED_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * Marker proving this draft's abandonment was already reported.
 *
 * Onboarding is the one flow a stuck person relaunches over and over. Reporting
 * on every launch would turn one stranded user into fifty events and bury the
 * shape of the problem under the volume of it, so the report fires at most once
 * per draft. Cleared alongside the draft when onboarding completes.
 */
export const ABANDONED_MARKER_KEY = 'onboarding-abandon-reported-v1';

/**
 * Age buckets, not raw durations. Buckets aggregate — "eleven people abandoned
 * at threeStepPaywall in the 6h bucket" is an alarm; eleven distinct
 * millisecond counts are eleven unrelated rows.
 */
export type OnboardingAgeBucket = 'under6h' | '6h' | '24h' | '3d' | '7d' | 'longer';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Lower-bound bucket for an age. Boundaries are inclusive of the lower bound,
 * so exactly 6h reads as '6h' and exactly 24h reads as '24h'.
 *
 * Negative ages (a clock that moved backwards between launches) bucket as
 * 'under6h' and therefore never report — a wrong clock must not invent a
 * funnel event.
 */
export function bucketOnboardingAge(ageMs: number): OnboardingAgeBucket {
  if (!Number.isFinite(ageMs) || ageMs < ONBOARDING_ABANDONED_THRESHOLD_MS) return 'under6h';
  if (ageMs < DAY_MS) return '6h';
  if (ageMs < 3 * DAY_MS) return '24h';
  if (ageMs < 7 * DAY_MS) return '3d';
  if (ageMs < 30 * DAY_MS) return '7d';
  return 'longer';
}

/**
 * The onboarding steps, in authoring order, mirrored from ALL_STEPS in
 * `src/app/onboarding.tsx`.
 *
 * Mirrored rather than imported: that screen pulls in reanimated, gesture
 * handler and the whole native module graph, and this module has to stay
 * directly unit-testable. `onboarding-telemetry.test.ts` reads the screen's own
 * ALL_STEPS block and fails if the two lists ever drift.
 */
export const ONBOARDING_STEP_IDS: readonly string[] = [
  'hook', 'solution', 'unfoldIntro', 'name', 'aboutMe', 'stylePreferences1',
  'stylePreferences2', 'relationshipWithGod', 'bibleFrequency', 'shockStat',
  'growthGraph', 'growthGoals', 'obstacles', 'keyPeople', 'aspiration',
  'vulnerabilityValidation', 'mirrorBack', 'featureSummary', 'founderNote',
  'devotionalSegue', 'readDevotional', 'celebration', 'commitment1',
  'commitment2', 'threeStepPaywall', 'purchaseConfirmation', 'themeType',
  'studySubject', 'currentSituation', 'diagnosticRound', 'spiritualSeeking',
  'upcomingEvent', 'readingDuration', 'devotionalLength', 'reminderTime',
];

const KNOWN_STEP_IDS = new Set(ONBOARDING_STEP_IDS);

/**
 * Last line of privacy defence on the one free-form parameter this module
 * takes: a step id is sent only if it is a step id we already know about.
 *
 * An allowlist rather than a shape check, because a shape check is not enough
 * here. A first name ("Anthony") and the device id
 * ("anon_583f924a-…") both read as perfectly good identifiers, and the device
 * id is this app's auth credential. Anything unrecognised becomes 'unknown',
 * which fails in the safe direction: a step added without updating this list
 * loses funnel resolution, never a person's data.
 */
export function sanitizeStepId(stepId: string): string {
  return typeof stepId === 'string' && KNOWN_STEP_IDS.has(stepId) ? stepId : 'unknown';
}

/** Someone reached the first step that asks for anything. Start of the funnel. */
export function trackOnboardingStarted(stepId: string): void {
  const step = sanitizeStepId(stepId);
  addAppBreadcrumb(ONBOARDING_BREADCRUMB_CATEGORY, 'started', { step });
  captureAppEvent(ONBOARDING_STARTED_EVENT, { step });
}

/**
 * One breadcrumb per step change. Breadcrumbs, not events: this is the trail
 * attached to whatever is reported later, and a funnel of thirty-odd steps sent
 * as events would cost far more than it tells.
 */
export function trackOnboardingStep(stepId: string): void {
  addAppBreadcrumb(ONBOARDING_BREADCRUMB_CATEGORY, 'step', { step: sanitizeStepId(stepId) });
}

/**
 * A draft was restored and the person is carrying on from where they stopped.
 * Paired with the abandonment event this closes the loop: how many of the
 * people we reported as abandoned actually came back, and from which step.
 */
export function trackOnboardingResumed(fromStepId: string, ageMs: number): void {
  const step = sanitizeStepId(fromStepId);
  const ageBucket = bucketOnboardingAge(ageMs);
  addAppBreadcrumb(ONBOARDING_BREADCRUMB_CATEGORY, 'resumed', { step, age_bucket: ageBucket });
  captureAppEvent(ONBOARDING_RESUMED_EVENT, { step, age_bucket: ageBucket });
}

/**
 * Onboarding finished. `generated` is the paid path through
 * `proceedToGeneration`; `deferred` is "I'll decide later" on the paywall,
 * which completes the profile and lands on Today without starting a
 * generation. Both are completions, and the split is the whole point of
 * recording the outcome.
 */
export function trackOnboardingCompleted(outcome: 'generated' | 'deferred'): void {
  addAppBreadcrumb(ONBOARDING_BREADCRUMB_CATEGORY, 'completed', { outcome });
  captureAppEvent(ONBOARDING_COMPLETED_EVENT, { outcome });
}

function hasReportedAbandonedOnboarding(): boolean {
  try {
    return !!(mmkvStorage.getItem(ABANDONED_MARKER_KEY) as string | null);
  } catch {
    // A storage read that throws must not be read as "already reported": the
    // signal matters more than the duplicate.
    return false;
  }
}

/**
 * Forget that an abandonment was reported, so the next draft gets its own
 * report. Call this wherever the draft itself is cleared — completion, or a
 * reset — or a stale marker will silence the signal for the next walk-through.
 */
/**
 * Clears the once-per-draft marker.
 *
 * `clearOnboardingDraft()` owns the teardown in production, so this exists for
 * tests and for any future caller that drops a draft by another route. Kept
 * exported deliberately: the marker and the draft must always die together, and
 * a caller that cannot reach the draft store still needs this.
 */
export function clearAbandonedOnboardingMarker(): void {
  try {
    mmkvStorage.removeItem(ABANDONED_MARKER_KEY);
  } catch {
    // Best-effort, exactly as the draft store treats its own writes.
  }
}

/**
 * THE SIGNAL. On launch, a draft older than the threshold means someone started
 * setting themselves up and never came back. Report which step they stopped on
 * and roughly how long ago.
 *
 * This is the event that would have caught the P0 in hours: a run of
 * `onboarding_abandoned` carrying `step: threeStepPaywall` says, without any
 * exception ever being thrown, that the paywall is where people are being lost.
 *
 * Fires at most once per draft (see ABANDONED_MARKER_KEY). Returns whether an
 * event was sent, which is what the tests assert on.
 */
export function reportAbandonedOnboarding(draftStepId: string, ageMs: number): boolean {
  const ageBucket = bucketOnboardingAge(ageMs);
  // 'under6h' is the one bucket that is not an abandonment. Someone who stepped
  // away for an afternoon is still mid-flow.
  if (ageBucket === 'under6h') return false;
  if (hasReportedAbandonedOnboarding()) return false;

  const step = sanitizeStepId(draftStepId);
  addAppBreadcrumb(ONBOARDING_BREADCRUMB_CATEGORY, 'abandoned', { step, age_bucket: ageBucket });
  captureAppEvent(ONBOARDING_ABANDONED_EVENT, { step, age_bucket: ageBucket });

  try {
    // Step and bucket only — the marker is read back by nothing but the guard
    // above, and stays as free of user content as the event it records.
    mmkvStorage.setItem(
      ABANDONED_MARKER_KEY,
      JSON.stringify({ step, ageBucket, reportedAt: Date.now() }),
    );
  } catch {
    // Best-effort. A marker that fails to persist costs a duplicate event on
    // the next launch, which is far cheaper than losing the report entirely.
  }
  return true;
}
