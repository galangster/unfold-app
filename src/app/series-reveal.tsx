import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AutoTrialNotifyCard, type AutoTrialNotifyPhase } from '@/components/onboarding/AutoTrialNotifyCard';
import { SeriesPath } from '@/components/home/SeriesPath';
import { useAutoTrialGeneration } from '@/hooks/useAutoTrialGeneration';
import { useOnboardingDarkColors } from '@/hooks/useOnboardingDarkColors';
import { DarkColors } from '@/constants/colors';
import { readAutoTrialIntent } from '@/lib/auto-trial-intent';
import { getServerOwnedSeriesTotalDays } from '@/lib/devotional-series-boundary';
import { DEFAULT_SERIES_TITLE } from '@/lib/initial-arc-result';
import { logger } from '@/lib/logger';
import {
  askNotificationPermissionInContext,
  readNotificationPermissionState,
  type NotificationPermissionState,
} from '@/lib/notification-ask';
import { firstParam } from '@/lib/reveal-params';
import { buildPlannedSeriesPath, buildSeriesPath } from '@/lib/series-path';
import { useUnfoldStore } from '@/lib/store';

// DG-1: visual treatment pending 07-design-final.md
export default function SeriesRevealScreen() {
  const colors = useOnboardingDarkColors();
  const params = useLocalSearchParams<{ intentId?: string | string[] }>();
  const intentId = firstParam(params.intentId) ?? '';
  const { state, tryAgain, goToToday, setUpSeries, beginDayOne } = useAutoTrialGeneration(intentId);
  const [permission, setPermission] = useState<NotificationPermissionState>('undetermined');
  const [notifyPhase, setNotifyPhase] = useState<AutoTrialNotifyPhase>('idle');
  const devotionals = useUnfoldStore((store) => store.devotionals);

  useEffect(() => {
    void readNotificationPermissionState().then(setPermission);
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void readNotificationPermissionState().then(setPermission);
    });
    return () => sub.remove();
  }, []);

  const intent = readAutoTrialIntent();
  const landedId = state.kind === 'revealed' ? state.devotionalId : intent?.devotionalId;
  const devotional = devotionals.find((row) => row.id === landedId);

  const title = devotional?.title ?? DEFAULT_SERIES_TITLE;
  const promise = devotional?.seriesArc?.promise;
  const serverDays = getServerOwnedSeriesTotalDays(devotional);
  if (devotional && intent && serverDays !== intent.trialDays) {
    logger.warn('[series-reveal] day-count mismatch', { serverDays, trialDays: intent.trialDays });
  }

  const nodes = useMemo(() => {
    if (devotional) return buildSeriesPath(devotional, new Date(), { isCurrentSeries: true });
    if (intent?.trialDays) return buildPlannedSeriesPath(intent.trialDays);
    return [];
  }, [devotional, intent?.trialDays]);

  const showNotify = state.kind === 'generating' || state.kind === 'revealed';
  const showGoToToday = !(state.kind === 'generating' && state.jobId == null);
  const showBegin = state.kind === 'revealed';
  const showTryAgain = state.kind === 'failed';
  const showSetUp = state.kind === 'retry_exhausted' || state.kind === 'declined';

  return (
    <View testID="series-reveal-root" style={{ flex: 1, backgroundColor: colors.background }}>
      <Text>{title}</Text>
      {promise ? <Text testID="series-promise">{promise}</Text> : null}
      <Text>{`days:${serverDays || intent?.trialDays || 0}`}</Text>
      <SeriesPath nodes={nodes} variant="reveal" />
      <Text>{`state:${state.kind}`}</Text>
      {showNotify ? (
        <AutoTrialNotifyCard
          permission={permission}
          phase={notifyPhase}
          onAsk={() => {
            setNotifyPhase('requesting');
            void askNotificationPermissionInContext({
              trigger: 'series_reveal',
              registration: 'await',
            }).then((result) => {
              setPermission(result === 'denied' ? 'denied' : 'granted');
              setNotifyPhase(result === 'registration_failed' ? 'registration_failed' : 'idle');
            });
          }}
          onOpenSettings={() => undefined}
        />
      ) : null}
      {showBegin ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Begin Day 1" onPress={beginDayOne}>
          <Text>Begin Day 1</Text>
        </Pressable>
      ) : null}
      {showTryAgain ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={tryAgain}>
          <Text>Try again</Text>
        </Pressable>
      ) : null}
      {showGoToToday && (state.kind === 'generating' || state.kind === 'failed' || state.kind === 'retry_exhausted') ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go to Today" onPress={goToToday}>
          <Text>Go to Today</Text>
        </Pressable>
      ) : null}
      {showSetUp ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Set up my series" onPress={setUpSeries}>
          <Text>Set up my series</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: DarkColors.text }}>{`palette:${DarkColors.background}`}</Text>
    </View>
  );
}
