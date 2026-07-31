import { CompletionCelebration } from '@/components/CompletionCelebration';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onContinue: () => void;
}

/**
 * Celebrates the first completed devotional during onboarding.
 *
 * Deliberately does NOT request an App Store review. It used to, firing the
 * native rating sheet as this celebration was dismissed — which landed it on
 * top of the next onboarding step, in front of someone who had used the app
 * for about five minutes. Apple's HIG advises against prompting during
 * onboarding or mid-task, and a first-session prompt spends one of the three
 * requests Apple allows per year on the least-invested users. The review
 * request now happens only from the Today screen, where someone has come back
 * of their own accord (see (tabs)/(today)/index.tsx).
 */
export function OnboardingCelebration({ colors: _colors, onContinue }: Props) {
  return (
    <CompletionCelebration
      visible={true}
      onDismiss={onContinue}
      type="day"
      message="Your first devotional, complete."
    />
  );
}
