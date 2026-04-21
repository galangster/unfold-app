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
): T[] {
  return allSteps.filter((step) => {
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
): string {
  return getFilteredOnboardingSteps(allSteps, existingUser)[0]?.id ?? 'hook';
}
