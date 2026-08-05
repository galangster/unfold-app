import {
  buildOnboardingSampleGenerationRequest,
  formatDateOnly,
  formatDateOnlyForDisplay,
  getContextualSituationChips,
  getFilteredOnboardingSteps,
  getInitialOnboardingStepId,
  getOnboardingStepLayoutMode,
  isFullScreenOnboardingStepType,
  resolveQuickDateChip,
  shapeKeyPeople,
  shapeUpcomingEvent,
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
    { id: 'themeType' },
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
      'themeType',
      'currentSituation',
    ]);
    expect(getInitialOnboardingStepId(allSteps, existingUser)).toBe('relationshipWithGod');
  });

  it('can deep-start returning users at the new-series discovery selection screen', () => {
    const existingUser = {
      hasCompletedOnboarding: true,
      name: 'Nick',
      aboutMe: 'Builder',
    };

    expect(getInitialOnboardingStepId(allSteps, existingUser, undefined, 'themeType')).toBe('themeType');
  });

  it('ignores a requested start step when that step is filtered out', () => {
    const existingUser = {
      hasCompletedOnboarding: true,
      name: 'Nick',
      aboutMe: 'Builder',
    };

    expect(getInitialOnboardingStepId(allSteps, existingUser, undefined, 'threeStepPaywall')).toBe('relationshipWithGod');
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
      'themeType',
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
      tone: 'poetic' as const,
      depth: 'theological' as const,
      faithBackground: 'mature' as const,
      lifeStage: 'building' as const,
      relationshipWithGod: 'ups-and-downs',
      growthGoals: ['pray more honestly'],
      obstacles: ['anxiety'],
    };
    const buildRequest = (overrides: Partial<typeof answers> = {}) =>
      buildOnboardingSampleGenerationRequest({
        answers: { ...answers, ...overrides },
        existingUser: { name: 'Nicholas', aboutMe: 'Fallback', bibleTranslation: 'ESV' },
      });

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
        writingStyle: {
          tone: 'poetic',
          depth: 'theological',
          faithBackground: 'mature',
          lifeStage: 'building',
        },
      });
    });

    it('falls back to existing user writing style if returning flow skips style screens', () => {
      const request = buildOnboardingSampleGenerationRequest({
        answers: {
          name: 'Nick',
          aboutMe: 'Building Unfold',
          currentSituation: 'I need peace in a launch week',
          aspiration: 'I want to trust God with the outcome',
          relationshipWithGod: 'ups-and-downs',
          growthGoals: ['pray more honestly'],
          obstacles: ['anxiety'],
        },
        existingUser: {
          name: 'Nicholas',
          aboutMe: 'Fallback',
          bibleTranslation: 'BSB',
          writingStyle: {
            tone: 'direct',
            depth: 'simple',
            faithBackground: 'new',
            lifeStage: 'student',
          },
        },
      });

      expect(request.userContext.writingStyle).toEqual({
        tone: 'direct',
        depth: 'simple',
        faithBackground: 'new',
        lifeStage: 'student',
      });
    });

    it('submits on the first transition out of aspiration when no sample job exists', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: null,
          existingDevotionalDay: null,
          submittedRequest: null,
          nextRequest: buildRequest(),
        }),
      ).toBe(true);
    });

    it('resubmits when a job was restored from storage with no known submitted request', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: 'job-restored',
          existingDevotionalDay: null,
          submittedRequest: null,
          nextRequest: buildRequest(),
        }),
      ).toBe(true);
    });

    it('does not resubmit an identical rebuilt request when a sample job exists', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: 'job-1',
          existingDevotionalDay: null,
          submittedRequest: buildRequest(),
          nextRequest: buildRequest(),
        }),
      ).toBe(false);
    });

    it('resubmits when relationshipWithGod changes', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: 'job-1',
          existingDevotionalDay: null,
          submittedRequest: buildRequest(),
          nextRequest: buildRequest({ relationshipWithGod: 'close' }),
        }),
      ).toBe(true);
    });

    it('resubmits when growthGoals are added, removed, or reordered', () => {
      const submittedRequest = buildRequest({
        growthGoals: ['pray more honestly', 'study scripture'],
      });
      const changedGrowthGoals = [
        ['pray more honestly', 'study scripture', 'serve consistently'],
        ['pray more honestly'],
        ['study scripture', 'pray more honestly'],
      ];

      changedGrowthGoals.forEach((growthGoals) => {
        expect(
          shouldStartOnboardingSampleGeneration({
            currentStepId: 'aspiration',
            existingJobId: 'job-1',
            existingDevotionalDay: null,
            submittedRequest,
            nextRequest: buildRequest({ growthGoals }),
          }),
        ).toBe(true);
      });
    });

    it('resubmits when obstacles change', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: 'job-1',
          existingDevotionalDay: null,
          submittedRequest: buildRequest(),
          nextRequest: buildRequest({ obstacles: ['busyness'] }),
        }),
      ).toBe(true);
    });

    it('resubmits when aspiration text changes', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: 'job-1',
          existingDevotionalDay: null,
          submittedRequest: buildRequest(),
          nextRequest: buildRequest({ aspiration: 'I want to trust God in uncertainty' }),
        }),
      ).toBe(true);
    });

    it('does not resubmit changed answers after a devotional day exists', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'aspiration',
          existingJobId: 'job-1',
          existingDevotionalDay: { id: 'day-1' },
          submittedRequest: buildRequest(),
          nextRequest: buildRequest({ obstacles: ['busyness'] }),
        }),
      ).toBe(false);
    });

    it('does not submit changed answers from a non-aspiration step', () => {
      expect(
        shouldStartOnboardingSampleGeneration({
          currentStepId: 'growthGoals',
          existingJobId: 'job-1',
          existingDevotionalDay: null,
          submittedRequest: buildRequest(),
          nextRequest: buildRequest({ growthGoals: ['study scripture'] }),
        }),
      ).toBe(false);
    });
  });

  describe('shapeKeyPeople', () => {
    it('drops entries with an empty or missing name', () => {
      expect(
        shapeKeyPeople([
          { name: '', relationship: 'Spouse' },
          { name: '   ', relationship: 'Friend' },
          { relationship: 'Mentor' },
          { name: 'Sam', relationship: 'Parent' },
        ]),
      ).toEqual([{ name: 'Sam', relationship: 'Parent' }]);
    });

    it('caps the result at 5 people', () => {
      const people = Array.from({ length: 8 }, (_, i) => ({ name: `Person ${i}`, relationship: `Rel ${i}` }));
      expect(shapeKeyPeople(people)).toHaveLength(5);
    });

    it('trims names to the max length', () => {
      const longName = 'x'.repeat(80);
      expect(shapeKeyPeople([{ name: longName, relationship: 'Friend' }])[0].name).toHaveLength(50);
    });

    it('returns an empty array for null or undefined input', () => {
      expect(shapeKeyPeople(null)).toEqual([]);
      expect(shapeKeyPeople(undefined)).toEqual([]);
    });
  });

  describe('shapeUpcomingEvent', () => {
    it('returns undefined unless both label and date are set', () => {
      expect(shapeUpcomingEvent(null)).toBeUndefined();
      expect(shapeUpcomingEvent({ label: '', date: '2026-08-15' })).toBeUndefined();
      expect(shapeUpcomingEvent({ label: 'A court date', date: '' })).toBeUndefined();
      expect(shapeUpcomingEvent({ label: '  ', date: '2026-08-15' })).toBeUndefined();
    });

    it('trims the label when both fields are present', () => {
      expect(shapeUpcomingEvent({ label: '  A move  ', date: '2026-08-15' })).toEqual({
        label: 'A move',
        date: '2026-08-15',
      });
    });
  });

  describe('resolveQuickDateChip', () => {
    // Wednesday, August 5, 2026
    const reference = new Date(2026, 7, 5);

    it('maps tomorrow to a single day ahead', () => {
      expect(resolveQuickDateChip('tomorrow', reference)).toBe('2026-08-06');
    });

    it('maps this-weekend to the upcoming Saturday', () => {
      expect(resolveQuickDateChip('this-weekend', reference)).toBe('2026-08-08');
    });

    it('maps next-week to 7 days ahead', () => {
      expect(resolveQuickDateChip('next-week', reference)).toBe('2026-08-12');
    });

    it('maps in-two-weeks to 14 days ahead', () => {
      expect(resolveQuickDateChip('in-two-weeks', reference)).toBe('2026-08-19');
    });

    it('maps in-a-month to the same day next month', () => {
      expect(resolveQuickDateChip('in-a-month', reference)).toBe('2026-09-05');
    });

    it('treats a Saturday reference as this weekend itself', () => {
      const saturday = new Date(2026, 7, 8);
      expect(resolveQuickDateChip('this-weekend', saturday)).toBe('2026-08-08');
    });

    it('rolls in-a-month over a year boundary', () => {
      const december = new Date(2026, 11, 20);
      expect(resolveQuickDateChip('in-a-month', december)).toBe('2027-01-20');
    });
  });

  describe('formatDateOnly / formatDateOnlyForDisplay', () => {
    it('formats a Date as a local yyyy-mm-dd string', () => {
      expect(formatDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('formats a yyyy-mm-dd string for display', () => {
      expect(formatDateOnlyForDisplay('2026-08-15')).toBe('Aug 15');
    });

    it('returns the input unchanged when malformed', () => {
      expect(formatDateOnlyForDisplay('not-a-date')).toBe('not-a-date');
    });
  });
});
