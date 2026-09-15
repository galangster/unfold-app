import { useEffect, useState } from 'react';
import { CompletionCelebration } from '@/components/CompletionCelebration';
import type { ColorTheme } from '@/constants/colors';
import {
  ONBOARDING_FIRST_READING_COMPLETE_MESSAGE,
  ONBOARDING_FIRST_READING_SAVED_MESSAGE,
  persistOnboardingFirstReading,
} from '@/lib/onboarding-first-reading';
import { flushUnfoldStorePersistAsync, type Devotional } from '@/lib/store';
import { logger } from '@/lib/logger';

interface Props {
  colors: ColorTheme;
  onContinue: () => void;
  firstReadingId?: string;
  firstReadingDay?: unknown;
  userContext?: Devotional['userContext'];
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
export function OnboardingCelebration({
  colors: _colors,
  onContinue,
  firstReadingId,
  firstReadingDay,
  userContext,
}: Props) {
  const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const save = async () => {
      if (!persistOnboardingFirstReading({ id: firstReadingId, day: firstReadingDay, userContext })) return;
      await flushUnfoldStorePersistAsync();
      if (active && firstReadingId) setSavedId(firstReadingId);
    };
    void save().catch(() => {
      logger.warn('[onboarding] Could not persist the first reading at completion.');
    });
    return () => { active = false; };
  }, [firstReadingId, firstReadingDay, userContext]);

  return (
    <CompletionCelebration
      visible={true}
      onDismiss={onContinue}
      type="day"
      message={ONBOARDING_FIRST_READING_COMPLETE_MESSAGE}
      detail={savedId && savedId === firstReadingId ? ONBOARDING_FIRST_READING_SAVED_MESSAGE : undefined}
    />
  );
}
