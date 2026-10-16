/**
 * The onboarding mirror-back fallback names the reader as they typed their
 * name. Two of its lines used to lowercase it mid-sentence, so "Anna Lee"
 * read as "anna lee". The onboarding screen's own line set had the same line.
 */
import {
  buildFallbackMirrorBack,
  onboardingMirrorBackReflection,
  type MirrorBackAnswers,
} from '@/lib/mirror-back-fallback';

const NAME = 'Anna Lee';
const SITUATION_AND_HOPE: MirrorBackAnswers = { currentSituation: 'Starting a new job', spiritualSeeking: 'peace' };
const SITUATION_ONLY: MirrorBackAnswers = { currentSituation: 'Starting a new job' };

/** A pick that takes line `index` of a set, or its last line when the set is shorter. */
const lineAt = (index: number) => (lines: string[]) => lines[Math.min(index, lines.length - 1)];

describe('the mirror-back fallback keeps the name as typed (APP-35)', () => {
  it.each([
    ['a situation and a hope', SITUATION_AND_HOPE],
    ['a situation only', SITUATION_ONLY],
    ['no answers', {}],
  ])('names the reader as typed in every line after %s', (_label, answers) => {
    for (const index of [0, 1, 2]) {
      const named = { ...answers, name: NAME };
      expect(buildFallbackMirrorBack(named, lineAt(index)).reflection).toContain(NAME);
      expect(onboardingMirrorBackReflection(named, lineAt(index))).toContain(NAME);
    }
  });

  it.each([
    [
      'a situation and a hope',
      SITUATION_AND_HOPE,
      "Between where you are and where you're reaching, Anna Lee, God is already at work.",
    ],
    [
      'a situation only',
      SITUATION_ONLY,
      "What you shared took courage, Anna Lee, and it's exactly the right place to begin.",
    ],
  ])('keeps the name mid-sentence in the service line after %s', (_label, answers, reflection) => {
    expect(buildFallbackMirrorBack({ ...answers, name: NAME }, lineAt(1)).reflection).toBe(reflection);
  });

  it('keeps the name mid-sentence in the screen line', () => {
    expect(onboardingMirrorBackReflection({ ...SITUATION_AND_HOPE, name: NAME }, lineAt(1))).toBe(
      "Between where you are and where you're reaching, Anna Lee, God is already at work.",
    );
  });

  it('reads cleanly without a name', () => {
    expect(buildFallbackMirrorBack(SITUATION_AND_HOPE, lineAt(1)).reflection).toBe(
      "Between where you are and where you're reaching, God is already at work.",
    );
    expect(onboardingMirrorBackReflection(SITUATION_AND_HOPE, lineAt(1))).toBe(
      "Between where you are and where you're reaching, God is already at work.",
    );
  });
});
