import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { abandonPurchasedIntentBeforeNewSeries, readAutoTrialIntent } from '@/lib/auto-trial-intent';
import { getCurrentDevotional } from '@/lib/home-devotional-state';
import { readInflightGenerationJob } from '@/lib/inflight-generation-job';
import { readInitialGenerationRequestId } from '@/lib/initial-generation-request';
import { useUnfoldStore } from '@/lib/store';
import { isReadableCurrentSeries, resolveCreateNewDuringPendingInitial } from '@/lib/support-clarity';

/**
 * Starts a new series from a screen outside Today, with the same steps as
 * Today's New Series button (handleCreateNew in src/app/(tabs)/(today)/index.tsx):
 *
 *   1. The creation gate decides on resolved entitlement first.
 *   2. A series that is still being written resumes instead.
 *   3. Ending a current series asks first, then archives it.
 *   4. The new-series intake opens at its theme step.
 *
 * A reader who has not finished onboarding goes through onboarding instead,
 * which ends in their first series. Today never needs that step: only a
 * deep link reaches a screen like this before onboarding.
 *
 * The intake takes no context. Onboarding reads only `startAt` and `flow`,
 * and a new series' answers start blank by design, so callers pass nothing.
 *
 * Each step replaces the calling screen, so the intake runs on the stack
 * shape it has from Today. Its exits all land on Today.
 *
 * Haptics stay at the call site; the shared Button already fires one.
 */
export function useStartNewSeries(gate: () => boolean): () => void {
  const router = useRouter();

  return useCallback(() => {
    const state = useUnfoldStore.getState();
    if (!state.user?.hasCompletedOnboarding) {
      router.replace('/onboarding');
      return;
    }
    if (!gate()) return;

    const pending = {
      inflight: readInflightGenerationJob(),
      requestId: readInitialGenerationRequestId(),
      generationSessionStatus: state.generationSession.status,
      hasReadableCurrentSeries: isReadableCurrentSeries(
        getCurrentDevotional(state.devotionals, state.currentDevotionalId),
      ),
      autoTrialOwnsFlow: readAutoTrialIntent()?.status === 'purchased',
    };
    if (resolveCreateNewDuringPendingInitial(pending) === 'resume-existing') {
      router.replace('/generating');
      return;
    }

    const openIntake = () => {
      abandonPurchasedIntentBeforeNewSeries({ nowMs: Date.now() });
      router.replace({ pathname: '/onboarding', params: { startAt: 'themeType', flow: 'newSeries' } });
    };
    if (!state.currentDevotionalId) {
      openIntake();
      return;
    }
    Alert.alert('Start a new series?', 'Starting a new series will end your current one.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => {
          useUnfoldStore.getState().archiveCurrentDevotional();
          openIntake();
        },
      },
    ]);
  }, [gate, router]);
}
