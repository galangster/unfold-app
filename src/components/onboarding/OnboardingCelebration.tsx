import { useEffect } from 'react';
import * as StoreReview from 'expo-store-review';
import { CompletionCelebration } from '@/components/CompletionCelebration';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onContinue: () => void;
}

export function OnboardingCelebration({ colors: _colors, onContinue }: Props) {
  // Trigger native review prompt immediately — the celebration's own entrance
  // animation (expanding circles, embers) provides ~1-2s of natural delay before
  // the user can process and tap. Firing on mount ensures it always runs even if
  // the user taps quickly. Apple decides whether to actually show it (3/year cap).
  useEffect(() => {
    (async () => {
      try {
        const available = await StoreReview.isAvailableAsync();
        if (available) await StoreReview.requestReview();
      } catch {
        // Silently fail — review prompt is best-effort
      }
    })();
  }, []);

  return (
    <CompletionCelebration
      visible={true}
      onDismiss={onContinue}
      type="day"
      message="Your first devotional, complete."
    />
  );
}
