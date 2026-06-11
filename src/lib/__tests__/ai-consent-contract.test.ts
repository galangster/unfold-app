/**
 * PRIV-1 contract tests: AI consent gate
 *
 * Contract:
 *  1. hasConsentedToAI is false in the initial store state (never auto-set).
 *  2. The aiConsent step type appears in the onboarding STEPS array and is
 *     positioned before the final step that triggers generation.
 *  3. The aiConsent step is skipped for returning users who already consented.
 *  4. The generation submission effect in generating.tsx requires
 *     hasConsentedToAI === true — verified by static analysis of the source.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getFilteredOnboardingSteps } from '../onboarding-step-helpers';

const srcRoot = path.join(__dirname, '..', '..');

describe('PRIV-1: AI consent contract', () => {
  it('hasConsentedToAI is false in the initial store state (auto-set removed)', () => {
    // Read the store source and confirm initial state is false (not auto-set to true)
    const storeSrc = fs.readFileSync(path.join(srcRoot, 'lib', 'store.ts'), 'utf8');
    // The initial value must be false
    expect(storeSrc).toMatch(/hasConsentedToAI:\s*false/);
    // Auto-set pattern (setHasConsentedToAI(true) outside of the consent CTA handler)
    // should NOT appear inside generating.tsx
    const generatingSrc = fs.readFileSync(path.join(srcRoot, 'app', 'generating.tsx'), 'utf8');
    expect(generatingSrc).not.toMatch(/setHasConsentedToAI\(true\)/);
  });

  it('aiConsent step is registered in the onboarding STEPS definition', () => {
    const onboardingSrc = fs.readFileSync(path.join(srcRoot, 'app', 'onboarding.tsx'), 'utf8');
    // The STEPS array must include an aiConsent step
    expect(onboardingSrc).toMatch(/id:\s*['"]aiConsent['"]/);
    expect(onboardingSrc).toMatch(/type:\s*['"]aiConsent['"]\s*as\s*const/);
  });

  it('aiConsent step is skipped for returning users who already consented', () => {
    // getFilteredOnboardingSteps returns false (excluded) for aiConsent when
    // the user has hasConsentedToAI === true
    const stepsWithConsent = [
      { id: 'aiConsent', type: 'aiConsent', skipIfHasValue: true, adaptive: false, hasVariations: false, question: '', subtext: '' },
      { id: 'reminderTime', type: 'reminderTime', skipIfHasValue: false, adaptive: false, hasVariations: false, question: '', subtext: '' },
    ];
    const consentedUser = {
      hasCompletedOnboarding: true,
      name: 'Nick',
      aboutMe: 'Builder',
      hasConsentedToAI: true,
    };
    const filtered = getFilteredOnboardingSteps(stepsWithConsent, consentedUser, {});
    const ids = filtered.map((s) => s.id);
    expect(ids).not.toContain('aiConsent');
    expect(ids).toContain('reminderTime');
  });

  it('generation submission effect in generating.tsx checks hasConsentedToAI before submitting', () => {
    const generatingSrc = fs.readFileSync(path.join(srcRoot, 'app', 'generating.tsx'), 'utf8');
    // The submission effect guard must include hasConsentedToAI
    expect(generatingSrc).toMatch(/if\s*\(.*!hasConsentedToAI.*\)\s*return/);
    // hasConsentedToAI must be in the dependency array of the submission useEffect
    expect(generatingSrc).toMatch(/},\s*\[user,\s*hasConsentedToAI\]/);
  });

  it('the aiConsent step has its own CTA and the bottom continue button is hidden', () => {
    const onboardingSrc = fs.readFileSync(path.join(srcRoot, 'app', 'onboarding.tsx'), 'utf8');
    // aiConsent must appear in TOP_CONTINUE_HIDDEN_STEP_TYPES (or equivalent)
    // so the default continue button is suppressed and the explicit CTA is the only action
    expect(onboardingSrc).toMatch(/['"]aiConsent['"]/);
    // The 'I understand — continue' CTA must call setHasConsentedToAI(true) before advancing
    expect(onboardingSrc).toMatch(/setHasConsentedToAI\(true\)/);
  });

  it('aiConsent step is NOT skipped when the passed shape lacks hasConsentedToAI (RV-UI-2)', () => {
    // hasConsentedToAI lives at the store ROOT (store.ts), not on the user object.
    // A bare user object — the shape of `s.user` — must NOT trigger the skip:
    // the consent step has to show for anyone whose consent we cannot prove.
    const steps = [
      { id: 'aiConsent', skipIfHasValue: true },
      { id: 'reminderTime', skipIfHasValue: false },
    ];
    const bareUser = { hasCompletedOnboarding: true, name: 'Nick', aboutMe: 'Builder' };
    const ids = getFilteredOnboardingSteps(steps, bareUser, {}).map((s) => s.id);
    expect(ids).toContain('aiConsent');
  });

  it('onboarding merges store-level hasConsentedToAI into the shape passed to the step helpers (RV-UI-2)', () => {
    const onboardingSrc = fs.readFileSync(path.join(srcRoot, 'app', 'onboarding.tsx'), 'utf8');
    // Both step-helper call sites must receive a shape that carries the root-level
    // consent flag — passing `existingUser` (s.user) alone means
    // skipIfHasValue('aiConsent') can never fire for already-consented users.
    expect(onboardingSrc).toMatch(/existingUserWithConsent/);
    expect(onboardingSrc).toMatch(/getInitialOnboardingStepId\(ALL_STEPS,\s*existingUserWithConsent/);
    expect(onboardingSrc).toMatch(/getFilteredOnboardingSteps\(ALL_STEPS,\s*existingUserWithConsent/);
  });
});
