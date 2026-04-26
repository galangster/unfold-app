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

const DEFAULT_DISCOVERY_CHIPS = [
  'A relationship', 'My future', 'Work stress', 'A loss',
  'Big changes', 'Starting over', 'Feeling stuck', 'Health',
  'Loneliness', 'Family', 'A decision', 'Letting go',
  'Faith doubts', 'Finding purpose', 'Need rest', 'Forgiveness',
];

const CONTEXTUAL_SITUATION_CHIPS: Record<string, string[]> = {
  trust: ['Letting go', 'Control', 'Betrayed', 'Guarded', 'Vulnerable', 'Uncertain', 'Rebuilding', 'Suspicious'],
  identity: ['Lost', 'Comparing', 'Performing', 'Unseen', 'Shifting', 'Questioning', 'Torn', 'Rebuilding'],
  rest: ['Burned out', "Can't stop", 'Guilty resting', 'Running on empty', 'Wired', 'Depleted', 'Striving', 'Overcommitted'],
  presence: ['Distracted', 'Distant from God', 'Going through motions', 'Longing', 'Numb', 'Disconnected', 'Seeking', 'Dry season'],
  healing: ['Wounded', 'Processing', 'Stuck in pain', 'Ready', 'Afraid to hope', 'Scarred', 'Tired of hurting', 'Slowly mending'],
  joy: ['Joyless', 'Faking it', 'Grateful but heavy', 'Searching for lightness', 'Nostalgic', 'Flat', 'Wanting to celebrate', 'Suppressing'],
  gratitude: ['Taking things for granted', 'Overwhelmed by blessings', 'Hard to be thankful', 'Rediscovering', 'Guilt about complaining', 'Noticing more', 'Humbled', 'Adjusting perspective'],
  lament: ['Crying out', 'Angry at God', 'Why me', 'Sitting in ashes', 'Raw', 'Unanswered prayers', 'Shaking fist', 'Abandoned'],
  hope: ['Barely holding on', 'Waiting', 'Discouraged', 'Flickering', 'Skeptical', 'Wanting to believe', 'Weary', 'Cynical'],
  purpose: ['Directionless', 'Stuck', 'Restless', 'Called but unclear', 'Underused', 'Pivoting', 'Searching', 'Torn between paths'],
  courage: ['Paralyzed', 'Playing it safe', 'Avoiding', 'Shrinking back', 'Afraid to step out', 'People-pleasing', 'Hiding', 'Holding back'],
  conviction: ['Compromising', 'Wavering', 'Standing alone', 'Pressured', 'Doubting beliefs', 'Torn', 'Tested', 'Conflicted'],
  surrender: ['White-knuckling', 'Controlling', 'Resisting', 'Exhausted from fighting', 'Afraid to let go', 'Bargaining', 'Stubborn', 'Clinging'],
  discipline: ['Inconsistent', 'Starting over again', 'Distracted', 'No routine', 'Falling short', 'Wanting structure', 'Undisciplined', 'Scattered'],
  justice: ['Outraged', 'Helpless', 'Burdened for others', 'Systemic weight', 'Wanting to act', 'Complicit', 'Fatigued', 'Fired up'],
  wonder: ['Dulled', 'Routine', 'Lost childlike faith', 'Craving awe', 'Overlooking beauty', 'Jaded', 'Curious again', 'Closed off'],
  grief: ['Numb', 'Missing someone', 'Angry', 'Empty', 'Guilty', 'In denial', 'Exhausted', 'Waves of sadness'],
  book_study: ['Curious', 'Intimidated', 'Excited', 'Returning to it', 'Fresh eyes', 'Looking deeper', 'Committed', 'Exploring'],
  character_study: ['Curious', 'Identifying with someone', 'Inspired', 'Challenged', 'Seeking examples', 'Learning from failure', 'Drawn to a story', 'Wanting mentorship'],
  psalm_study: ['Heavy-hearted', 'Praising', 'Lamenting', 'Grateful', 'Crying out', 'Worshiping', 'Wrestling', 'Remembering'],
  topical_study: ['Questioning', 'Seeking answers', 'Building foundation', 'Deconstructing', 'Hungry to learn', 'Confused', 'Wanting depth', 'Revisiting basics'],
  lectio_divina: ['Seeking stillness', 'Restless mind', 'Wanting to listen', 'Spiritually dry', 'Open', 'Contemplative', 'Distracted', 'Hungry for encounter'],
  soap_journal: ['Wanting structure', 'Journaling curious', 'Need accountability', 'Fresh start', 'Building habit', 'Reflective', 'Seeking consistency', 'Ready to commit'],
  verse_mapping: ['Detail-oriented', 'Wanting context', 'Digging deeper', 'Scholarly', 'Curious about original meaning', 'Seeking precision', 'Analytical', 'Thorough'],
  parables: ['Confused by parables', 'Wanting fresh perspective', 'Familiar but shallow', 'Ready for depth', 'Seeking hidden meaning', 'Storyteller', 'Practical learner', 'Curious'],
};

const TOP_CONTINUE_HIDDEN_STEP_TYPES = new Set([
  'hook',
  'solution',
  'unfoldIntro',
  'purchaseConfirmation',
  'shockStat',
  'growthGraph',
  'choice',
  'timeChoice',
  'mirrorBack',
  'featureSummary',
  'devotionalSegue',
  'readDevotional',
  'threeStepPaywall',
  'founderNote',
  'vulnerabilityValidation',
  'celebration',
  'commitment1',
  'commitment2',
]);

const FULL_SCREEN_STEP_TYPES = new Set([
  'hook',
  'solution',
  'unfoldIntro',
  'purchaseConfirmation',
  'shockStat',
  'growthGraph',
  'vulnerabilityValidation',
  'featureSummary',
  'devotionalSegue',
  'readDevotional',
  'celebration',
  'commitment1',
  'commitment2',
  'threeStepPaywall',
]);

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

export function getContextualSituationChips({
  selectedMainOption,
  selectedThemes = [],
  selectedType,
}: {
  selectedMainOption?: 'theme' | 'type' | 'guided';
  selectedThemes?: readonly string[];
  selectedType?: string;
}): string[] {
  if (selectedMainOption === 'theme' && selectedThemes.length > 0) {
    return CONTEXTUAL_SITUATION_CHIPS[selectedThemes[0]] ?? DEFAULT_DISCOVERY_CHIPS;
  }

  if (selectedMainOption === 'type' && selectedType) {
    return CONTEXTUAL_SITUATION_CHIPS[selectedType] ?? DEFAULT_DISCOVERY_CHIPS;
  }

  return DEFAULT_DISCOVERY_CHIPS;
}

export function shouldShowOnboardingTopContinue({
  canProceed,
  stepType,
}: {
  canProceed: boolean;
  stepType?: string;
}): boolean {
  return canProceed && !TOP_CONTINUE_HIDDEN_STEP_TYPES.has(stepType ?? '');
}

export function isFullScreenOnboardingStepType(stepType?: string): boolean {
  return FULL_SCREEN_STEP_TYPES.has(stepType ?? '');
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
