import {
  buildOnboardingSampleGenerationRequest,
  getContextualSituationChips,
  getFilteredOnboardingSteps,
  getInitialOnboardingStepId,
  getOnboardingStepLayoutMode,
  isFullScreenOnboardingStepType,
  shouldShowOnboardingTopContinue,
  shouldStartOnboardingSampleGeneration,
} from '../onboarding-step-helpers';

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

  it('returns contextual chips for theme, type, and guided onboarding paths', () => {
    expect(
      getContextualSituationChips({
        selectedMainOption: 'theme',
        selectedThemes: ['rest'],
      }).slice(0, 3),
    ).toEqual(['Burned out', "Can't stop", 'Guilty resting']);

    expect(
      getContextualSituationChips({
        selectedMainOption: 'type',
        selectedType: 'book_study',
      }).slice(0, 3),
    ).toEqual(['Curious', 'Intimidated', 'Excited']);

    expect(
      getContextualSituationChips({ selectedMainOption: 'guided' }).slice(0, 3),
    ).toEqual(['A relationship', 'My future', 'Work stress']);
  });

  it('falls back to generic chips when a contextual selection has no match', () => {
    expect(
      getContextualSituationChips({
        selectedMainOption: 'theme',
        selectedThemes: ['unknown-theme'],
      }).slice(0, 3),
    ).toEqual(['A relationship', 'My future', 'Work stress']);

    expect(
      getContextualSituationChips({
        selectedMainOption: 'type',
        selectedType: 'unknown-type',
      }).slice(0, 3),
    ).toEqual(['A relationship', 'My future', 'Work stress']);
  });

  it('classifies onboarding chrome and full-screen step types', () => {
    expect(shouldShowOnboardingTopContinue({ canProceed: true, stepType: 'multiline' })).toBe(true);
    expect(shouldShowOnboardingTopContinue({ canProceed: false, stepType: 'multiline' })).toBe(false);
    expect(shouldShowOnboardingTopContinue({ canProceed: true, stepType: 'choice' })).toBe(false);
    expect(shouldShowOnboardingTopContinue({ canProceed: true, stepType: 'threeStepPaywall' })).toBe(false);

    expect(isFullScreenOnboardingStepType('hook')).toBe(true);
    expect(isFullScreenOnboardingStepType('featureSummary')).toBe(true);
    expect(isFullScreenOnboardingStepType('threeStepPaywall')).toBe(true);
    expect(isFullScreenOnboardingStepType('multiline')).toBe(false);
    expect(isFullScreenOnboardingStepType(undefined)).toBe(false);
  });

  it('selects onboarding step layout modes', () => {
    expect(getOnboardingStepLayoutMode({ stepType: 'threeStepPaywall' })).toBe('fullScreen');
    expect(
      getOnboardingStepLayoutMode({
        baseStepType: 'themeType',
        themeSelectionMode: 'theme',
        stepType: 'themeType',
      }),
    ).toBe('selectionScroll');
    expect(getOnboardingStepLayoutMode({ baseStepType: 'studySubject', stepType: 'studySubject' })).toBe('selectionScroll');
    expect(getOnboardingStepLayoutMode({ stepType: 'multiline' })).toBe('standardScroll');
  });

  describe('onboarding sample generation', () => {
    const answers = {
      name: 'Nick',
      aboutMe: 'Building Unfold',
      currentSituation: 'I need peace in a launch week',
      aspiration: 'I want to trust God with the outcome',
      relationshipWithGod: 'ups-and-downs',
      growthGoals: ['pray more honestly'],
      obstacles: ['anxiety'],
    };

    it('lets the backend own onboarding sample devotional identity and uses onboarding job type', () => {
      const request = buildOnboardingSampleGenerationRequest({
        answers,
        existingUser: { name: 'Nicholas', aboutMe: 'Fallback', bibleTranslation: 'ESV' },
      });

      expect(request).toMatchObject({
        dayNumber: 1,
        jobType: 'onboarding',
      });
      expect(request).not.toHaveProperty('devotionalId');
      expect(request.jobType).not.toBe('initial_arc');
      expect(request.jobType).not.toBe('day');
      expect(request.userContext).toMatchObject({
        name: 'Nick',
        aboutMe: 'Building Unfold',
        situation: 'I need peace in a launch week',
        seeking: 'I want to trust God with the outcome',
        bibleTranslation: 'ESV',
      });
    });

    it('dedupes repeated transitions out of aspiration once a sample job exists', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: null,
          existingDevotionalDay: null,
        }),
      ).toBe(true);

      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: 'job-1',
          existingDevotionalDay: null,
        }),
      ).toBe(false);

      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: null,
          existingDevotionalDay: { id: 'day-1' },
        }),
      ).toBe(false);
    });
  });
});
