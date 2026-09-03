import { resolveOnboardingResumeStep } from '../onboarding-step-helpers';
import { getReassurance } from '@/lib/onboarding-welcome-back-copy';

// The authoring order that matters for resuming — mirrors ALL_STEPS in
// src/app/onboarding.tsx. Kept as plain ids: the resolver only knows order.
const ALL_STEP_IDS = [
  'hook',
  'solution',
  'unfoldIntro',
  'name',
  'aboutMe',
  'stylePreferences1',
  'stylePreferences2',
  'relationshipWithGod',
  'bibleFrequency',
  'shockStat',
  'growthGraph',
  'growthGoals',
  'obstacles',
  'keyPeople',
  'aspiration',
  'vulnerabilityValidation',
  'mirrorBack',
  'featureSummary',
  'founderNote',
  'devotionalSegue',
  'readDevotional',
  'celebration',
  'commitment1',
  'commitment2',
  'threeStepPaywall',
  'purchaseConfirmation',
  'themeType',
  'studySubject',
  'currentSituation',
  'diagnosticRound',
  'spiritualSeeking',
  'upcomingEvent',
  'readingDuration',
  'devotionalLength',
  'reminderTime',
];

const allFiltered = ALL_STEP_IDS;

describe('resolveOnboardingResumeStep', () => {
  it('starts a person with no saved draft at the first step they would be shown', () => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId: null,
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
      }),
    ).toBe('hook');
  });

  it('resumes an ordinary answer step exactly where it was left', () => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'growthGoals',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
      }),
    ).toBe('growthGoals');
  });

  it.each([
    ['hook', 'name'],
    ['solution', 'name'],
    ['unfoldIntro', 'name'],
    ['shockStat', 'growthGoals'],
    ['growthGraph', 'growthGoals'],
    ['vulnerabilityValidation', 'mirrorBack'],
    ['featureSummary', 'devotionalSegue'],
    ['founderNote', 'devotionalSegue'],
    ['celebration', 'commitment1'],
    ['commitment2', 'threeStepPaywall'],
    ['purchaseConfirmation', 'themeType'],
  ])('never replays the %s beat — resumes forward to %s', (savedStepId, expected) => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId,
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
      }),
    ).toBe(expected);
  });

  it('resumes to the segue itself, which reuses the persisted sample job', () => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'devotionalSegue',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
      }),
    ).toBe('devotionalSegue');
  });

  it('keeps someone holding a generated devotional at the step they left', () => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'readDevotional',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
        hasSampleDevotionalDay: true,
      }),
    ).toBe('readDevotional');

    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'commitment1',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
        hasSampleDevotionalDay: true,
      }),
    ).toBe('commitment1');
  });

  it('sends a reader with no saved devotional back to the segue, not an empty screen', () => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'readDevotional',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
        hasSampleDevotionalDay: false,
      }),
    ).toBe('devotionalSegue');
  });

  it('skips the paywall and the purchase confirmation for someone who already bought', () => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'threeStepPaywall',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
        purchasedDuringOnboarding: true,
      }),
    ).toBe('themeType');

    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'purchaseConfirmation',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
        purchasedDuringOnboarding: true,
      }),
    ).toBe('themeType');
  });

  it('falls back to the nearest earlier step that survived the step filter', () => {
    // A returning user's filter drops the marketing steps and the name they
    // already gave; aboutMe is the nearest earlier step still on offer.
    const filtered = ALL_STEP_IDS.filter(
      (id) => !['name', 'stylePreferences1', 'stylePreferences2'].includes(id),
    );
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'stylePreferences2',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: filtered,
      }),
    ).toBe('aboutMe');
  });

  it('takes the first later filtered step when nothing earlier survived', () => {
    const filtered = ['obstacles', 'keyPeople', 'aspiration'];
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'name',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: filtered,
      }),
    ).toBe('obstacles');
  });

  it('ignores a saved step that no longer exists in the flow', () => {
    expect(
      resolveOnboardingResumeStep({
        savedStepId: 'aStepWeDeleted',
        allStepIds: ALL_STEP_IDS,
        filteredStepIds: allFiltered,
      }),
    ).toBe('hook');
  });
});

describe('welcome-back reassurance copy', () => {
  it('promises the devotional only when the next screen is not the paywall', () => {
    expect(getReassurance(true, false)).toContain('ready and waiting');
  });

  it('never promises the devotional opens next when resuming onto the paywall', () => {
    const copy = getReassurance(true, true);
    expect(copy).not.toContain('ready and waiting');
    expect(copy).toContain('one thing left to decide');
  });

  it('says nothing about a devotional when there is none', () => {
    expect(getReassurance(false, false)).not.toMatch(/devotional/i);
  });
});
