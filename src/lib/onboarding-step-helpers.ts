import { getDeviceId } from '@/lib/mmkv-storage';

type OnboardingStepLike = {
  id: string;
  skipIfHasValue?: boolean;
};

type ExistingUserLike = {
  id?: string | null;
  hasCompletedOnboarding?: boolean;
  name?: string | null;
  aboutMe?: string | null;
  reminderTime?: string | null;
  bibleTranslation?: string | null;
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

type OnboardingSampleAnswers = {
  name?: string | null;
  aboutMe?: string | null;
  currentSituation?: string | null;
  spiritualSeeking?: string | null;
  aspiration?: string | null;
  relationshipWithGod?: string | null;
  growthGoals?: string[] | null;
  obstacles?: string[] | null;
};

export type OnboardingSampleGenerationRequest = {
  devotionalId: string;
  dayNumber: 1;
  jobType: 'onboarding';
  userContext: {
    name: string;
    aboutMe: string;
    situation: string;
    emotion: string;
    faith: string;
    seeking: string;
    themeCategory: string;
    devotionalType: string;
    readingDuration: number;
    bibleTranslation: string;
    relationshipWithGod: string;
    growthGoals: string[];
    obstacles: string[];
  };
};

function sampleValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function buildOnboardingSampleDevotionalId(): string {
  return `onboarding-sample-anon_${getDeviceId()}`;
}

export function buildOnboardingSampleGenerationRequest({
  answers,
  existingUser,
}: {
  answers: OnboardingSampleAnswers;
  existingUser: ExistingUserLike;
}): OnboardingSampleGenerationRequest {
  return {
    devotionalId: buildOnboardingSampleDevotionalId(),
    dayNumber: 1,
    jobType: 'onboarding',
    userContext: {
      name: sampleValue(answers.name).trim() || sampleValue(existingUser?.name),
      aboutMe: sampleValue(answers.aboutMe).trim() || sampleValue(existingUser?.aboutMe),
      situation: sampleValue(answers.currentSituation),
      emotion: '',
      faith: '',
      seeking: sampleValue(answers.aspiration).trim() || sampleValue(answers.spiritualSeeking),
      themeCategory: '',
      devotionalType: '',
      readingDuration: 5,
      bibleTranslation: sampleValue(existingUser?.bibleTranslation).trim() || 'BSB',
      relationshipWithGod: sampleValue(answers.relationshipWithGod).trim() || 'ups-and-downs',
      growthGoals: answers.growthGoals ?? [],
      obstacles: answers.obstacles ?? [],
    },
  };
}

export function shouldStartOnboardingSampleGeneration({
  currentStepId,
  existingJobId,
  existingDevotionalDay,
}: {
  currentStepId: string;
  existingJobId?: string | null;
  existingDevotionalDay?: unknown | null;
}): boolean {
  return currentStepId === 'aspiration' && !existingJobId && !existingDevotionalDay;
}
