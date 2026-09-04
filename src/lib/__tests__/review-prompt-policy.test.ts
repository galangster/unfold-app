import * as fs from 'fs';
import * as path from 'path';
import {
  getReviewPromptVersionKey,
  shouldRequestReviewForVersion,
} from '@/lib/review-prompt-policy';

const sourceRoot = path.join(__dirname, '../..');

describe('review prompt version policy', () => {
  it('keys prompts by app version and build number', () => {
    expect(getReviewPromptVersionKey('1.2.3', '45')).toBe('1.2.3:45');
    expect(getReviewPromptVersionKey(null, null)).toBe('unknown:unknown');
  });

  it('allows only one native prompt per app version/build', () => {
    expect(shouldRequestReviewForVersion(null, '1.2.3:45')).toBe(true);
    expect(shouldRequestReviewForVersion('1.2.3:44', '1.2.3:45')).toBe(true);
    expect(shouldRequestReviewForVersion('1.2.3:45', '1.2.3:45')).toBe(false);
  });
});

describe('review prompt call-site contract', () => {
  const reviewPromptSource = fs.readFileSync(
    path.join(sourceRoot, 'lib/review-prompt.ts'),
    'utf-8',
  );
  const todaySource = fs.readFileSync(
    path.join(sourceRoot, 'app/(tabs)/(today)/index.tsx'),
    'utf-8',
  );
  const onboardingCelebrationSource = fs.readFileSync(
    path.join(sourceRoot, 'components/onboarding/OnboardingCelebration.tsx'),
    'utf-8',
  );
  const onboardingSource = fs.readFileSync(
    path.join(sourceRoot, 'app/onboarding.tsx'),
    'utf-8',
  );

  it('keeps native review calls behind the shared once-per-version helper', () => {
    expect(reviewPromptSource).toContain("import * as StoreReview from 'expo-store-review'");
    expect(reviewPromptSource).toContain('export async function requestReviewOncePerVersion()');
    expect(reviewPromptSource).toContain('REVIEW_PROMPT_VERSION_STORAGE_KEY');
    expect(todaySource).not.toContain("expo-store-review");
    expect(onboardingCelebrationSource).not.toContain("expo-store-review");
    expect(onboardingSource).not.toContain("expo-store-review");
  });

  it('routes the Today prompt through the shared helper', () => {
    expect(todaySource).toContain(
      "import { requestReviewOncePerVersion } from '@/lib/review-prompt';",
    );
    expect(todaySource).toContain('await requestReviewOncePerVersion()');
  });

  it('asks once right after the onboarding reading is completed, not on the celebration', () => {
    // Ruled by Nick 2026-09-04: the rating sheet lands the moment the reader
    // completes their first devotional inside onboarding, over the celebration.
    // The celebration itself stays silent (its dismiss used to fire the sheet
    // over the next step), and the call goes through the once-per-version helper.
    expect(onboardingSource).toContain(
      "import { requestReviewOncePerVersion } from '@/lib/review-prompt';",
    );
    const readStep = onboardingSource.slice(
      onboardingSource.indexOf('<ReadDevotionalStep'),
      onboardingSource.indexOf('<OnboardingCelebration'),
    );
    expect(readStep).toContain('advanceToNextStep();');
    expect(readStep).toContain('void requestReviewOncePerVersion();');
    expect(onboardingCelebrationSource).not.toContain('requestReviewOncePerVersion');
    expect(onboardingCelebrationSource).not.toContain('@/lib/review-prompt');
  });
});
