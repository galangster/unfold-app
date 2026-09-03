import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../app/onboarding.tsx'),
  'utf-8',
);

const indexSrc = fs.readFileSync(
  path.join(__dirname, '../../app/index.tsx'),
  'utf-8',
);

/** Slices one function body out of the screen source; throws if either anchor moved. */
function sliceBody(marker: string, endMarker: string): string {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`anchor not found: ${marker}`);
  const end = src.indexOf(endMarker, start);
  if (end <= start) throw new Error(`end anchor not found after ${marker}: ${endMarker}`);
  return src.slice(start, end);
}

/** Step ids in authoring order, read from the screen's own ALL_STEPS block. */
const ALL_STEP_IDS: string[] = Array.from(src.matchAll(/\{\s*id: '([a-zA-Z0-9]+)'/g)).map(
  (match) => match[1],
);

describe('onboarding answer draft lifecycle (ONB-RESUME-1)', () => {
  it('writes the draft on a debounce and again when the app backgrounds', () => {
    expect(src).toContain('ONBOARDING_DRAFT_DEBOUNCE_MS = 300');
    // The shared controller, not a bare timer: its max-wait ceiling is what
    // makes a draft land while someone types steadily through the debounce.
    expect(src).toContain('createAutosaveController({');
    expect(src).toContain('maxWaitMs: ONBOARDING_DRAFT_MAX_WAIT_MS');
    expect(src).toContain("AppState.addEventListener('change'");
    expect(src).toContain('shouldFlushAutosaveOnAppState(nextState)');
    expect(src).toContain('draftAutosave.flush()');
  });

  it('never persists a draft on the opening cutscenes', () => {
    // The rule is positional: nothing before the name step is worth keeping,
    // which covers every opening cutscene without naming them.
    expect(src).toContain("DRAFT_FIRST_SAVED_STEP_INDEX = ALL_STEP_IDS.indexOf('name')");
    expect(src).toContain('index >= DRAFT_FIRST_SAVED_STEP_INDEX');
    const openingCutscenes = ['hook', 'solution', 'unfoldIntro'];
    const nameIndex = ALL_STEP_IDS.indexOf('name');
    for (const id of openingCutscenes) {
      expect(ALL_STEP_IDS.indexOf(id)).toBeLessThan(nameIndex);
    }
  });

  it('carries the purchase flag and the sample devotional in every write', () => {
    const write = sliceBody('const writeOnboardingDraft = useCallback', '// The generated day');
    expect(write).toContain('purchasedDuringOnboarding,');
    expect(write).toContain('sampleDevotionalId: onboardingDevotionalId || null');
    // The day itself is deliberately NOT in this record — it is hundreds of
    // words that never change, written once under its own key instead of being
    // re-serialized on every keystroke burst.
    expect(write).not.toContain('sampleDevotionalDay');
    expect(src).toContain('saveOnboardingSampleDay(onboardingDevotionalDay)');
  });

  it('keeps the persisted sample job until onboarding actually finishes', () => {
    const segue = sliceBody('onDevotionalReady={(result) => {', 'onContinue={advanceToNextStep}');
    expect(segue).not.toContain('clearOnboardingSampleJob()');
  });

  it('clears the draft in proceedToGeneration, right after the profile is written', () => {
    const proceed = sliceBody('const proceedToGeneration = useCallback', '}, [router, saveOnboardingData]');
    expect(proceed).toContain('saveOnboardingData();');
    expect(proceed).toContain('clearOnboardingDraft();');
    expect(proceed.indexOf('saveOnboardingData();')).toBeLessThan(
      proceed.indexOf('clearOnboardingDraft();'),
    );
  });

  it('writes hasCompletedOnboarding true on both profile paths', () => {
    const save = sliceBody('const saveOnboardingData = useCallback', 'const proceedToGeneration');
    expect(save.match(/hasCompletedOnboarding: true/g)?.length).toBe(2);
  });

  it('resumes from the draft while letting an explicit startAt win', () => {
    const init = sliceBody('const [currentStepId, setCurrentStepId]', '// Warm re-entry');
    expect(init).toContain('resolveOnboardingResumeStep({');
    expect(init).toContain('savedStepId: restoredDraft?.stepId ?? null');
    // startAt short-circuits before the draft is consulted at all.
    expect(init).toContain('if (requestedStartStepId && filteredStepIds.includes(requestedStartStepId))');
    expect(init.indexOf('requestedStartStepId')).toBeLessThan(
      init.indexOf('resolveOnboardingResumeStep({'),
    );
  });

  it('shows the warm re-entry only after a real absence', () => {
    expect(src).toContain('ONBOARDING_WELCOME_BACK_MIN_AGE_MS = 30 * 60 * 1000');
    expect(src).toContain(
      'Date.now() - restoredDraft.savedAt > ONBOARDING_WELCOME_BACK_MIN_AGE_MS',
    );
    expect(src).toContain('<WelcomeBackStep');
    // Rendered instead of the step, so the paywall video behind it never starts.
    expect(src).toContain('if (showWelcomeBack) {');
    // Still not a step: ALL_STEPS indices must be untouched.
    expect(src).not.toContain("id: 'welcomeBack'");
  });

  it('sends a returning person with a draft back into onboarding, never to the welcome animation', () => {
    expect(indexSrc).toContain("import { getOnboardingDraft } from '@/lib/onboarding-draft-store';");
    expect(indexSrc).toContain("router.replace('/onboarding');");
    expect(indexSrc).toContain('if (user?.hasCompletedOnboarding || hasOnboardingDraft) {');
  });
});

describe('paywall "I\'ll decide later" exit', () => {
  let handler = '';
  beforeAll(() => {
    handler = sliceBody('const handleDecideLater = useCallback', 'const completeOnboarding');
  });

  it('is wired to the paywall', () => {
    expect(src).toContain('onDecideLater={handleDecideLater}');
  });

  it('writes the profile with hasCompletedOnboarding true and no premium override', () => {
    // saveOnboardingData() with no argument falls through to
    // purchasedDuringOnboarding, which is false on this path — isPremium false.
    expect(handler).toContain('saveOnboardingData();');
    expect(handler).not.toContain('saveOnboardingData(true)');
    expect(handler).not.toContain('setPurchasedDuringOnboarding(true)');
  });

  it('hands over the sample devotional with a seriesStartDate', () => {
    expect(handler).toContain('addDevotional({');
    expect(handler).toContain('seriesStartDate: createdAt');
  });

  it('clears the draft and the sample job', () => {
    expect(handler).toContain('clearOnboardingDraft();');
    expect(handler).toContain('clearOnboardingSampleJob();');
  });

  it('routes to Today and never triggers a paid generation', () => {
    expect(handler).toContain("router.replace('/(tabs)/(today)')");
    expect(handler).not.toContain("router.replace('/generating')");
  });
});
