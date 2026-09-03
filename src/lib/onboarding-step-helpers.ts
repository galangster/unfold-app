
type OnboardingStepLike = {
  id: string;
  skipIfHasValue?: boolean;
};

type WritingStyleLike = {
  tone?: string | null;
  depth?: string | null;
  faithBackground?: string | null;
  lifeStage?: string | null;
};

type ExistingUserLike = {
  id?: string | null;
  hasCompletedOnboarding?: boolean;
  name?: string | null;
  aboutMe?: string | null;
  reminderTime?: string | null;
  bibleTranslation?: string | null;
  writingStyle?: WritingStyleLike | null;
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
  'diagnosticRound',
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

export type OnboardingStepLayoutMode = 'fullScreen' | 'selectionScroll' | 'standardScroll';

export function getOnboardingStepLayoutMode({
  baseStepType,
  themeSelectionMode = 'none',
  stepType,
}: {
  baseStepType?: string;
  themeSelectionMode?: 'none' | 'theme' | 'type';
  stepType?: string;
}): OnboardingStepLayoutMode {
  if (isFullScreenOnboardingStepType(stepType)) return 'fullScreen';

  if ((baseStepType === 'themeType' && themeSelectionMode !== 'none') || baseStepType === 'studySubject') {
    return 'selectionScroll';
  }

  return 'standardScroll';
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
  requestedStepId?: string | null,
): string {
  const filteredSteps = getFilteredOnboardingSteps(allSteps, existingUser, selectionContext);
  if (requestedStepId && filteredSteps.some((step) => step.id === requestedStepId)) {
    return requestedStepId;
  }
  return filteredSteps[0]?.id ?? 'hook';
}

type OnboardingSampleAnswers = {
  name?: string | null;
  aboutMe?: string | null;
  currentSituation?: string | null;
  spiritualSeeking?: string | null;
  aspiration?: string | null;
  tone?: string | null;
  depth?: string | null;
  faithBackground?: string | null;
  lifeStage?: string | null;
  relationshipWithGod?: string | null;
  growthGoals?: string[] | null;
  obstacles?: string[] | null;
};

export type OnboardingSampleGenerationRequest = {
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
    writingStyle: {
      tone: string;
      depth: string;
      faithBackground: string;
      lifeStage: string;
    };
    relationshipWithGod: string;
    growthGoals: string[];
    obstacles: string[];
  };
};

function sampleValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function sampleWritingStyle(
  answers: OnboardingSampleAnswers,
  existingUser: ExistingUserLike,
): OnboardingSampleGenerationRequest['userContext']['writingStyle'] {
  const existing = existingUser?.writingStyle;
  return {
    tone: sampleValue(answers.tone).trim() || sampleValue(existing?.tone).trim() || 'warm',
    depth: sampleValue(answers.depth).trim() || sampleValue(existing?.depth).trim() || 'balanced',
    faithBackground:
      sampleValue(answers.faithBackground).trim()
      || sampleValue(existing?.faithBackground).trim()
      || 'growing',
    lifeStage: sampleValue(answers.lifeStage).trim() || sampleValue(existing?.lifeStage).trim() || 'building',
  };
}


export function buildOnboardingSampleGenerationRequest({
  answers,
  existingUser,
}: {
  answers: OnboardingSampleAnswers;
  existingUser: ExistingUserLike;
}): OnboardingSampleGenerationRequest {
  return {
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
      writingStyle: sampleWritingStyle(answers, existingUser),
      relationshipWithGod: sampleValue(answers.relationshipWithGod).trim() || 'ups-and-downs',
      growthGoals: answers.growthGoals ?? [],
      obstacles: answers.obstacles ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// Key people (onboarding "who's walking through this with you?" step)
// ---------------------------------------------------------------------------

/**
 * Shapes raw keyPeople editing state (which may include chip-revealed rows
 * with no name typed yet) into the payload persisted to the user profile:
 * drop anyone without both a name and a relationship, cap at 5, trim names.
 */
export function shapeKeyPeople(
  people: readonly { name?: string | null; relationship?: string | null }[] | null | undefined,
  maxCount = 5,
  maxNameLength = 50,
): { name: string; relationship: string }[] {
  if (!people) return [];
  const shaped: { name: string; relationship: string }[] = [];
  for (const person of people) {
    const name = typeof person?.name === 'string' ? person.name.trim().slice(0, maxNameLength) : '';
    const relationship = typeof person?.relationship === 'string' ? person.relationship.trim() : '';
    if (!name || !relationship) continue;
    shaped.push({ name, relationship });
    if (shaped.length >= maxCount) break;
  }
  return shaped;
}

// ---------------------------------------------------------------------------
// Upcoming event (onboarding "what's coming up" step)
// ---------------------------------------------------------------------------

/** Shapes upcoming-event editing state into the payload — only counts when both fields are set. */
export function shapeUpcomingEvent(
  event: { label?: string | null; date?: string | null } | null | undefined,
): { label: string; date: string } | undefined {
  const label = typeof event?.label === 'string' ? event.label.trim() : '';
  const date = typeof event?.date === 'string' ? event.date.trim() : '';
  if (!label || !date) return undefined;
  return { label, date };
}

export type QuickDateChipId = 'tomorrow' | 'this-weekend' | 'next-week' | 'in-two-weeks' | 'in-a-month';

export const QUICK_DATE_CHIPS: { id: QuickDateChipId; label: string }[] = [
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this-weekend', label: 'This weekend' },
  { id: 'next-week', label: 'Next week' },
  { id: 'in-two-weeks', label: 'In two weeks' },
  { id: 'in-a-month', label: 'In a month' },
];

/** Formats a Date as a local (not UTC) yyyy-mm-dd string. */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Maps a quick-select date chip to a concrete yyyy-mm-dd date, relative to referenceDate (defaults to now). */
export function resolveQuickDateChip(chipId: QuickDateChipId, referenceDate: Date = new Date()): string {
  const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  switch (chipId) {
    case 'tomorrow':
      base.setDate(base.getDate() + 1);
      return formatDateOnly(base);
    case 'this-weekend': {
      const daysUntilSaturday = (6 - base.getDay() + 7) % 7;
      base.setDate(base.getDate() + daysUntilSaturday);
      return formatDateOnly(base);
    }
    case 'next-week':
      base.setDate(base.getDate() + 7);
      return formatDateOnly(base);
    case 'in-two-weeks':
      base.setDate(base.getDate() + 14);
      return formatDateOnly(base);
    case 'in-a-month':
      base.setMonth(base.getMonth() + 1);
      return formatDateOnly(base);
    default:
      return formatDateOnly(base);
  }
}

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats a yyyy-mm-dd string for display (e.g. "Aug 15"). Returns the input unchanged if malformed. */
export function formatDateOnlyForDisplay(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [, monthStr, dayStr] = parts;
  const monthIndex = Number(monthStr) - 1;
  const day = Number(dayStr);
  if (Number.isNaN(monthIndex) || Number.isNaN(day) || !MONTH_ABBREVIATIONS[monthIndex]) return dateStr;
  return `${MONTH_ABBREVIATIONS[monthIndex]} ${day}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => {
        if (left === right) return 0;
        return left < right ? -1 : 1;
      })
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function shouldStartOnboardingSampleGeneration({
  currentStepId,
  existingJobId,
  existingDevotionalDay,
  submittedRequest,
  nextRequest,
}: {
  currentStepId: string;
  existingJobId?: string | null;
  existingDevotionalDay?: unknown | null;
  submittedRequest?: OnboardingSampleGenerationRequest | null;
  nextRequest: OnboardingSampleGenerationRequest;
}): boolean {
  if (currentStepId !== 'aspiration' || existingDevotionalDay) return false;
  if (!existingJobId) return true;
  // A job restored from MMKV after relaunch has no in-memory submitted request,
  // so we can't tell whether this walk-through's answers match it. Resubmit and
  // let the backend's payload-aware dedupe answer: identical answers return the
  // same job, changed answers start a fresh one — no duplicate generation either way.
  if (!submittedRequest) return true;

  return stableStringify(submittedRequest) !== stableStringify(nextRequest);
}

// ---------------------------------------------------------------------------
// Resuming an abandoned onboarding walk-through
// ---------------------------------------------------------------------------

/**
 * Steps a returning person must NEVER be dropped back onto: cutscenes, emotional
 * payoffs and marketing beats. Watching the hook a second time, or the
 * celebration for a devotional already read, reads as the app forgetting them.
 * A saved step in this set resolves forward to the next step that is not.
 */
const NEVER_RESUME_STEP_IDS = new Set([
  'hook',
  'solution',
  'unfoldIntro',
  'shockStat',
  'growthGraph',
  'vulnerabilityValidation',
  'featureSummary',
  'founderNote',
  'celebration',
  'commitment2',
  'purchaseConfirmation',
]);

/** Steps a person who already bought during onboarding must not be shown again. */
const POST_PURCHASE_SKIP_STEP_IDS = new Set(['threeStepPaywall', 'purchaseConfirmation']);

function isResumableOnboardingStep(stepId: string, purchasedDuringOnboarding: boolean): boolean {
  if (NEVER_RESUME_STEP_IDS.has(stepId)) return false;
  if (purchasedDuringOnboarding && POST_PURCHASE_SKIP_STEP_IDS.has(stepId)) return false;
  return true;
}

/**
 * Where a returning person picks the flow back up.
 *
 * `allStepIds` is the authoring order (ALL_STEPS); `filteredStepIds` is what
 * this person will actually be shown. The result is always a step that exists
 * in `filteredStepIds`, so the caller can set it as the current step directly.
 */
export function resolveOnboardingResumeStep({
  savedStepId,
  allStepIds,
  filteredStepIds,
  hasSampleDevotionalDay = false,
  purchasedDuringOnboarding = false,
}: {
  savedStepId?: string | null;
  allStepIds: readonly string[];
  filteredStepIds: readonly string[];
  hasSampleDevotionalDay?: boolean;
  purchasedDuringOnboarding?: boolean;
}): string {
  const firstFiltered = filteredStepIds[0] ?? allStepIds[0] ?? 'hook';
  if (!savedStepId) return firstFiltered;

  const savedIndex = allStepIds.indexOf(savedStepId);
  if (savedIndex === -1) return firstFiltered;

  // Walk forward off any step this person must not see again.
  let index = savedIndex;
  while (index < allStepIds.length && !isResumableOnboardingStep(allStepIds[index], purchasedDuringOnboarding)) {
    index += 1;
  }
  if (index >= allStepIds.length) {
    return filteredStepIds[filteredStepIds.length - 1] ?? firstFiltered;
  }

  // The reader is only warm when the sample devotional came back with the
  // draft. Without it, the segue re-polls the SAME persisted job rather than
  // opening an empty reading screen.
  let resolved = allStepIds[index];
  if (resolved === 'readDevotional' && !hasSampleDevotionalDay && allStepIds.includes('devotionalSegue')) {
    resolved = 'devotionalSegue';
  }
  const resolvedIndex = allStepIds.indexOf(resolved);

  // Someone holding a generated devotional has already watched the segue and
  // read the devotional — clamping back past the reader would replay both.
  const readDevotionalIndex = allStepIds.indexOf('readDevotional');
  const floorIndex =
    hasSampleDevotionalDay && readDevotionalIndex !== -1 && savedIndex >= readDevotionalIndex
      ? readDevotionalIndex
      : 0;

  // The resolved step may not survive this person's step filter (e.g. a name
  // they already gave). Take the nearest earlier step that does.
  for (let i = resolvedIndex; i >= floorIndex; i -= 1) {
    const candidate = allStepIds[i];
    if (filteredStepIds.includes(candidate) && isResumableOnboardingStep(candidate, purchasedDuringOnboarding)) {
      return candidate;
    }
  }

  // Nothing earlier survived — the first later step that did is the next best
  // place to land.
  for (let i = resolvedIndex + 1; i < allStepIds.length; i += 1) {
    const candidate = allStepIds[i];
    if (filteredStepIds.includes(candidate) && isResumableOnboardingStep(candidate, purchasedDuringOnboarding)) {
      return candidate;
    }
  }

  return firstFiltered;
}
