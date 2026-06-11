import { useRef } from 'react';
import * as StoreReview from 'expo-store-review';
import { CompletionCelebration } from '@/components/CompletionCelebration';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onContinue: () => void;
}

export function OnboardingCelebration({ colors: _colors, onContinue }: Props) {
  const reviewFiredRef = useRef(false);

  // Fire the native rating sheet only AFTER the celebration is dismissed —
  // it lands over the next onboarding step instead of interrupting the moment.
  // Apple decides whether to actually show it (3/year cap).
  const handleDismiss = () => {
    onContinue();
    if (reviewFiredRef.current) return;
    reviewFiredRef.current = true;
    void (async () => {
      try {
        const available = await StoreReview.isAvailableAsync();
        if (available) await StoreReview.requestReview();
      } catch {
        // Silently fail — review prompt is best-effort
      }
    })();
  };

  return (
    <CompletionCelebration
      visible={true}
      onDismiss={handleDismiss}
      type="day"
      message="Your first devotional, complete."
    />
  );
}
