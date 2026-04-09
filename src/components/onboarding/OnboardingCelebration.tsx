import { CompletionCelebration } from '@/components/CompletionCelebration';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onContinue: () => void;
}

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
