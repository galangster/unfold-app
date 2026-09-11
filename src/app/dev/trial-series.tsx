import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';

import type { OnboardingData } from '@/app/onboarding';
import { AUTO_TRIAL_INTENT_KEY } from '@/lib/auto-trial-intent';
import {
  assertTrialSeriesFixtureEnvironment,
  buildTrialSeriesSeed,
  isTrialSeriesFixtureState,
  TRIAL_SERIES_FIXTURE_PERSONA,
  type TrialSeriesFixtureState,
  type TrialSeriesSeed,
} from '@/lib/dev-seed';
import { saveOnboardingDraft } from '@/lib/onboarding-draft-store';
import { clearInflightGenerationJob, writeInflightGenerationJob } from '@/lib/inflight-generation-job';
import { getDeviceId, mmkvStorage } from '@/lib/mmkv-storage';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { QA_TRIAL_LENGTH_OPTIONS } from '@/lib/qa-simulated-trial';
import { useUnfoldStore, type UserProfile } from '@/lib/store';
import { roundTrialDays, type AllowedTrialDays } from '@/lib/trial-facts';
import { useUIState } from '@/lib/ui-state';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function fictionalOnboardingData(trialDays: AllowedTrialDays): OnboardingData {
  return {
    ...TRIAL_SERIES_FIXTURE_PERSONA,
    bibleTranslation: 'BSB',
    faithBackground: 'growing',
    lifeStage: 'building',
    tone: 'warm',
    depth: 'balanced',
    selectedThemes: [],
    diagnosticAnswers: [],
    spiritualSeeking: 'Wanting a quieter morning.',
    upcomingEvent: { label: '', date: '' },
    aspiration: '',
    growthGoals: [],
    obstacles: [],
    keyPeople: [],
    readingDuration: 15,
    devotionalLength: trialDays,
    reminderTime: '8:00 AM',
    mirrorBackCommitted: false,
  };
}

function fixtureUser(i: {
  completed: boolean;
  trialDays: AllowedTrialDays;
  theme?: 'dark' | 'light';
}): UserProfile {
  return {
    ...TRIAL_SERIES_FIXTURE_PERSONA,
    personaTraits: [],
    faithImpact: '',
    spiritualSeeking: 'Wanting a quieter morning.',
    readingDuration: 15,
    devotionalLength: i.trialDays,
    reminderTime: '8:00 AM',
    dailyReminderEnabled: true,
    hasCompletedOnboarding: i.completed,
    hasCompletedStyleOnboarding: i.completed,
    isPremium: true,
    fontSize: 'medium',
    writingStyle: {
      tone: 'warm',
      depth: 'balanced',
      faithBackground: 'growing',
      lifeStage: 'building',
    },
    bibleTranslation: 'BSB',
    themeMode: i.theme ?? 'dark',
    accentTheme: 'gold',
    readingFont: 'source-serif',
    preferredVoice: 'arman',
  };
}

function writeIntentFromSeed(seed: TrialSeriesSeed): void {
  if (!seed.intent) {
    mmkvStorage.removeItem(AUTO_TRIAL_INTENT_KEY);
    return;
  }
  mmkvStorage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(seed.intent));
}

export function applyTrialSeriesSeed(i: {
  state: TrialSeriesFixtureState;
  now: Date;
  theme?: 'dark' | 'light';
}): TrialSeriesSeed {
  assertTrialSeriesFixtureEnvironment();
  const seed = buildTrialSeriesSeed({ state: i.state, now: i.now });
  const trialDays = (seed.intent?.trialDays) as AllowedTrialDays
    ?? seed.devotional?.totalDays
    ?? roundTrialDays(QA_TRIAL_LENGTH_OPTIONS[0].trialLengthMs);
  if (trialDays == null) throw new Error('Trial fixture length is not an allowed trial.');
  const nowIso = new Date().toISOString();
  useUnfoldStore.setState({
    user: fixtureUser({
      completed: i.state !== 'confirmation',
      trialDays,
      theme: i.theme,
    }),
    userUpdatedAt: nowIso,
    devotionals: seed.devotional ? [{ ...seed.devotional, updatedAt: nowIso }] : [],
    currentDevotionalId: seed.devotional?.id ?? null,
    generationSession: {
      status: 'idle',
      devotionalId: null,
      totalDays: 0,
      generatedDayNumbers: [],
    },
    ...(seed.devotional ? { hasEverCreatedDevotional: true } : {}),
  });
  writeIntentFromSeed(seed);
  clearInflightGenerationJob();
  if (i.state === 'reveal-generating' || i.state === 'reveal-failed') {
    const jobId = seed.intent?.jobId;
    if (jobId) {
      writeInflightGenerationJob({
        jobId,
        submittedAt: i.now.getTime(),
      });
    }
  }
  if (i.state === 'confirmation' && seed.intent) {
    saveOnboardingDraft({
      deviceId: getDeviceId(),
      stepId: 'purchaseConfirmation',
      data: fictionalOnboardingData(seed.intent.trialDays),
      purchasedDuringOnboarding: true,
    });
  }
  const ui = useUIState.getState();
  ui.setQaCaptureMode(true);
  ui.setDebugForceTrialExpired(seed.uiFlags.debugForceTrialExpired === true);
  ui.setLaterEntryNotifyAskPending(seed.uiFlags.laterEntryNotifyAskPending === true);
  return seed;
}

export default function TrialSeriesFixtureRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ state?: string | string[]; theme?: string | string[] }>();
  const state = firstParam(params.state);
  const theme = firstParam(params.theme);
  const enabled = isQaToolsEnabled();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!enabled || appliedRef.current) return;
    appliedRef.current = true;
    LogBox.ignoreAllLogs(true);
    useUIState.getState().setQaCaptureMode(true);
    if (!isTrialSeriesFixtureState(state)) {
      router.replace('/');
      return;
    }
    const seed = applyTrialSeriesSeed({
      state,
      now: new Date(),
      theme: theme === 'dark' || theme === 'light' ? theme : undefined,
    });
    router.replace(seed.target);
  }, [enabled, router, state, theme]);

  if (!enabled) {
    return <Redirect href="/(tabs)/(today)" />;
  }

  return null;
}
