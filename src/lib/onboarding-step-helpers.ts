type OnboardingStepLike = {
  id: string;
  skipIfHasValue?: boolean;
};

type ExistingUserLike = {
  hasCompletedOnboarding?: boolean;
  name?: string | null;
  aboutMe?: string | null;
  reminderTime?: string | null;
} | null | undefined;

type OnboardingSelectionContext = {
  selectedMainOption?: 'theme' | 'type' | 'guided';
  selectedType?: string;
};

const TYPES_WITH_SUBJECT_SELECTION = new Set(['book_study', 'character_study']);

const RETURNING_USER_ONLY_SKIPS = new Set([
  'hook',
  'solution',
  'unfoldIntro',
  'founderNote',
  'featureSummary',
  'threeStepPaywall',
  'purchaseConfirmation',
  'stylePreferences1',
  'stylePreferences2',
]);

function hasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getFilteredOnboardingSteps<T extends OnboardingStepLike>(
  allSteps: readonly T[],
  existingUser: ExistingUserLike,
  selectionContext?: OnboardingSelectionContext,
): T[] {
  return allSteps.filter((step) => {
    if (step.id === 'studySubject') {
      if (selectionContext?.selectedMainOption === 'theme' || selectionContext?.selectedMainOption === 'guided') {
        return false;
      }

      if (selectionContext?.selectedMainOption === 'type' && !selectionContext.selectedType) {
        return false;
      }

      if (
        selectionContext?.selectedMainOption === 'type'
        && selectionContext.selectedType
        && !TYPES_WITH_SUBJECT_SELECTION.has(selectionContext.selectedType)
      ) {
        return false;
      }
    }

    if (existingUser?.hasCompletedOnboarding && RETURNING_USER_ONLY_SKIPS.has(step.id)) {
      return false;
    }

    if (step.skipIfHasValue) {
      if (step.id === 'name' && hasValue(existingUser?.name)) return false;
      if (step.id === 'aboutMe' && hasValue(existingUser?.aboutMe)) return false;
      if (step.id === 'reminderTime' && hasValue(existingUser?.reminderTime)) return false;
    }

    return true;
  });
}

export function getInitialOnboardingStepId<T extends OnboardingStepLike>(
  allSteps: readonly T[],
  existingUser: ExistingUserLike,
  selectionContext?: OnboardingSelectionContext,
): string {
  return getFilteredOnboardingSteps(allSteps, existingUser, selectionContext)[0]?.id ?? 'hook';
}
