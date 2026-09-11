import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { LogBox } from 'react-native';

import type { OnboardingData } from '@/app/onboarding';
import {
  AUTO_TRIAL_INTENT_KEY,
  createAutoTrialIntent,
  transitionAutoTrialIntent,
} from '@/lib/auto-trial-intent';
import {
  assertTrialSeriesFixtureEnvironment,
  buildTrialSeriesSeed,
  isTrialSeriesFixtureState,
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
    name: 'Riven Hale',
    bibleTranslation: 'BSB',
    aboutMe: 'A fictional reader used only for fixture captures.',
    faithBackground: 'growing',
    lifeStage: 'building',
    tone: 'warm',
    depth: 'balanced',
    selectedThemes: [],
    currentSituation: 'Walking a short series through an ordinary week.',
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
    name: 'Riven Hale',
    aboutMe: 'A fictional reader used only for fixture captures.',
    personaTraits: [],
    currentSituation: 'Walking a short series through an ordinary week.',
    emotionalState: 'Steady',
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

function writeIntentFromSeed(seed: TrialSeriesSeed, now: Date): void {
  mmkvStorage.removeItem(AUTO_TRIAL_INTENT_KEY);
  if (!seed.intent) return;
  createAutoTrialIntent({
    deviceId: getDeviceId(),
    entry: seed.intent.entry,
    surface: seed.intent.surface,
    source: seed.intent.source,
    simulated: true,
    trialDays: seed.intent.trialDays,
    purchasedAt: seed.intent.purchasedAt,
    expiresAt: seed.intent.expiresAt,
    timeZone: seed.intent.timeZone,
    isSandbox: true,
    productIdentifier: seed.intent.productIdentifier,
    switchFetchedAt: seed.intent.switchFetchedAt,
    nowMs: now.getTime(),
  });
  const nowMs = now.getTime();
  if (seed.intent.status === 'purchased') return;
  if (seed.intent.status === 'failed') {
    transitionAutoTrialIntent('failed', {
      failureCode: seed.intent.failureCode ?? 'max_retries',
    }, { nowMs });
    return;
  }
  transitionAutoTrialIntent('submitted', {
    ...(seed.intent.jobId ? { jobId: seed.intent.jobId } : {}),
    ...(seed.intent.devotionalId ? { devotionalId: seed.intent.devotionalId } : {}),
  }, { nowMs });
  if (seed.intent.status === 'submitted') return;
  transitionAutoTrialIntent('landed', {
    ...(seed.intent.devotionalId ? { devotionalId: seed.intent.devotionalId } : {}),
  }, { nowMs });
  if (seed.intent.status === 'landed') return;
  if (seed.intent.status === 'revealed') {
    transitionAutoTrialIntent('revealed', {}, { nowMs });
    return;
  }
  if (seed.intent.status === 'completed') {
    transitionAutoTrialIntent('completed', {}, { nowMs });
  }
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
  const store = useUnfoldStore.getState();
  store.setUser(fixtureUser({
    completed: i.state !== 'confirmation',
    trialDays,
    theme: i.theme,
  }));
  useUnfoldStore.setState({
    devotionals: [],
    currentDevotionalId: null,
  });
  store.clearGenerationSession();
  if (seed.devotional) {
    store.addDevotional(seed.devotional);
    store.setCurrentDevotional(seed.devotional.id);
  }
  writeIntentFromSeed(seed, i.now);
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

  useEffect(() => {
    if (!enabled) return;
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
