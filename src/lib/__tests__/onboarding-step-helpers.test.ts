import { getFilteredOnboardingSteps, getInitialOnboardingStepId } from '../onboarding-step-helpers';

describe('onboarding step helpers', () => {
  const allSteps = [
    { id: 'hook' },
    { id: 'solution' },
    { id: 'unfoldIntro' },
    { id: 'name', skipIfHasValue: true },
    { id: 'aboutMe', skipIfHasValue: true },
    { id: 'stylePreferences1' },
    { id: 'stylePreferences2' },
    { id: 'relationshipWithGod' },
    { id: 'bibleFrequency' },
    { id: 'founderNote' },
    { id: 'featureSummary' },
    { id: 'threeStepPaywall' },
    { id: 'purchaseConfirmation' },
    { id: 'studySubject' },
    { id: 'currentSituation' },
  ];

  it('starts returning users at the first non-cinematic series-building step', () => {
    const existingUser = {
      hasCompletedOnboarding: true,
      name: 'Nick',
      aboutMe: 'Builder',
    };

    const filtered = getFilteredOnboardingSteps(allSteps, existingUser, {
      selectedMainOption: 'guided',
    });

    expect(filtered.map((step) => step.id)).toEqual([
      'relationshipWithGod',
      'bibleFrequency',
      'currentSituation',
    ]);
    expect(getInitialOnboardingStepId(allSteps, existingUser)).toBe('relationshipWithGod');
  });

  it('keeps required profile fields for returning users when they are still missing', () => {
    const existingUser = {
      hasCompletedOnboarding: true,
      name: '',
      aboutMe: '',
    };

    const filtered = getFilteredOnboardingSteps(allSteps, existingUser, {
      selectedMainOption: 'guided',
    });

    expect(filtered.map((step) => step.id)).toEqual([
      'name',
      'aboutMe',
      'relationshipWithGod',
      'bibleFrequency',
      'currentSituation',
    ]);
    expect(getInitialOnboardingStepId(allSteps, existingUser)).toBe('name');
  });

  it('preserves the first-time cinematic flow for brand-new users', () => {
    const filtered = getFilteredOnboardingSteps(allSteps, null);

    expect(filtered.map((step) => step.id)).toEqual(allSteps.map((step) => step.id));
    expect(getInitialOnboardingStepId(allSteps, null)).toBe('hook');
  });

  it('skips study subject for theme and guided flows', () => {
    expect(
      getFilteredOnboardingSteps(allSteps, null, { selectedMainOption: 'theme' }).map((step) => step.id),
    ).not.toContain('studySubject');

    expect(
      getFilteredOnboardingSteps(allSteps, null, { selectedMainOption: 'guided' }).map((step) => step.id),
    ).not.toContain('studySubject');
  });

  it('skips study subject until a type needing it is selected', () => {
    expect(
      getFilteredOnboardingSteps(allSteps, null, { selectedMainOption: 'type' }).map((step) => step.id),
    ).not.toContain('studySubject');

    expect(
      getFilteredOnboardingSteps(allSteps, null, { selectedMainOption: 'type', selectedType: 'personal' }).map((step) => step.id),
    ).not.toContain('studySubject');

    expect(
      getFilteredOnboardingSteps(allSteps, null, { selectedMainOption: 'type', selectedType: 'book_study' }).map((step) => step.id),
    ).toContain('studySubject');
  });
});
