import type { Href } from 'expo-router';
import { PRIMARY_BACKEND_URL } from '@/lib/backend-url';
import type { AutoTrialIntentV1 } from '@/lib/auto-trial-intent';
import type { Devotional, DevotionalDay } from '@/lib/store';
import { roundTrialDays, type AllowedTrialDays } from '@/lib/trial-facts';
import { canonicalGeneratedDayId } from './devotional-canonical-days';

export const TRIAL_SERIES_FIXTURE_STATES = [
  'reveal-generating',
  'reveal-failed',
  'reveal-exhausted',
  'confirmation',
  'later-entry-notify',
  'today-day1',
  'today-day2',
  'today-day2-read',
  'today-day3',
  'today-lapsed-before-day3',
  'series-complete',
] as const;

export type TrialSeriesFixtureState = (typeof TRIAL_SERIES_FIXTURE_STATES)[number];

export const TRIAL_SERIES_FIXTURE_GUARD_MESSAGE =
  'Trial series fixtures require the isolated local environment.';

const QA_DEVOTIONAL_ID = 'qa-auto-trial-series';
const QA_JOB_GENERATING = 'qa-fixture-generating';
const QA_JOB_FAILED = 'qa-fixture-failed';
const QA_JOB_LANDED = 'qa-fixture-landed';
const QA_INTENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const QA_REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const TRIAL_LENGTH_MS = 259_200_000;

const DAY_OFFSET: Partial<Record<TrialSeriesFixtureState, number>> = {
  'today-day1': 0,
  'today-day2': 1,
  'today-day2-read': 1,
  'today-day3': 2,
  'today-lapsed-before-day3': 2,
  'series-complete': 2,
};

export function isTrialSeriesFixtureState(value: string | undefined): value is TrialSeriesFixtureState {
  return value != null && (TRIAL_SERIES_FIXTURE_STATES as readonly string[]).includes(value);
}

export function buildDevotionalSeed({
  devotionalId = 'seeded-qa-devotional',
  nowIso = new Date().toISOString(),
}: {
  devotionalId?: string;
  nowIso?: string;
} = {}): Devotional {
  return {
    id: devotionalId,
    title: 'Quiet Path Series',
    totalDays: 3,
    currentDay: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    // Day gating (tomorrow lock, unlock labels) keys off this anchor and
    // fails closed without it, so a seed without one hides those states.
    seriesStartDate: nowIso,
    generationMode: 'progressive',
    userContext: {
      name: 'Nick',
      aboutMe: 'Seeded devotional for runtime QA.',
      currentSituation: 'Verifying reveal and reading handoff.',
      emotionalState: 'Hopeful',
    },
    days: [
      {
        devotionalId,
        id: canonicalGeneratedDayId(devotionalId, 1),
        dayNumber: 1,
        title: 'When the Path Is Quiet',
        scriptureReference: 'Psalm 46:10',
        scriptureText: 'Be still, and know that I am God.',
        bodyText:
          'God often meets us in stillness before He moves us into action. The quiet path is not empty; it is the place where attention returns, hurry loosens its grip, and the soul learns to recognize His presence again.',
        quotableLine: 'Stillness is not absence; it is attention.',
        isRead: false,
        isRevealed: false,
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
      {
        devotionalId,
        id: canonicalGeneratedDayId(devotionalId, 2),
        dayNumber: 2,
        title: 'Strength for the Middle',
        scriptureReference: 'Isaiah 40:31',
        scriptureText: 'But those who wait on the Lord shall renew their strength.',
        bodyText:
          'The second day is present so reading navigation can move through a realistic multi-day series during QA.',
        quotableLine: 'Waiting is where strength is quietly renewed.',
        isRead: false,
        isRevealed: false,
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
      {
        devotionalId,
        id: canonicalGeneratedDayId(devotionalId, 3),
        dayNumber: 3,
        title: 'A Faithful Next Step',
        scriptureReference: 'Proverbs 3:5-6',
        scriptureText: 'In all your ways acknowledge Him, and He shall direct your paths.',
        bodyText:
          'The final seeded day gives the series a believable ending state for downstream reading and progression checks.',
        quotableLine: 'The next faithful step is enough for today.',
        isRead: false,
        isRevealed: false,
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
    ],
  };
}

export interface TrialSeriesSeed {
  devotional?: Devotional;
  intent?: AutoTrialIntentV1;
  uiFlags: Partial<{
    debugForceTrialExpired: boolean;
    laterEntryNotifyAskPending: boolean;
  }>;
  target: Href;
}

function atLocalNoon(now: Date, minusDays: number): Date {
  const next = new Date(now);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() - minusDays);
  return next;
}

function readAtForDay(now: Date, dayOffset: number, dayNumber: number): string {
  if (dayNumber === dayOffset + 1) return now.toISOString();
  return atLocalNoon(now, dayOffset - dayNumber + 1).toISOString();
}

function fictionalDay(
  devotionalId: string,
  dayNumber: 1 | 2 | 3,
  nowIso: string,
  readAt?: string,
): DevotionalDay {
  const copy: Record<1 | 2 | 3, { title: string; reference: string; scripture: string; body: string; quote: string }> = {
    1: {
      title: 'A Quiet Beginning',
      reference: 'Psalm 23:2',
      scripture: 'He makes me lie down in green pastures.',
      body: 'The first morning of this series is ordinary on purpose. Nothing here asks you to become someone else.',
      quote: 'Stillness is a place you can return to.',
    },
    2: {
      title: 'The Middle Hour',
      reference: 'Isaiah 30:15',
      scripture: 'In quietness and in trust shall be your strength.',
      body: 'Day two stays with the same story. The work is to keep walking without rushing the ending.',
      quote: 'Trust grows in the hours no one applauds.',
    },
    3: {
      title: 'The Faithful Close',
      reference: 'Philippians 1:6',
      scripture: 'He who began a good work in you will bring it to completion.',
      body: 'The last seeded morning names what is already finished and leaves the next series unforced.',
      quote: 'Completion is a kindness, not a score.',
    },
  };
  const row = copy[dayNumber];
  return {
    devotionalId,
    id: canonicalGeneratedDayId(devotionalId, dayNumber),
    dayNumber,
    title: row.title,
    scriptureReference: row.reference,
    scriptureText: row.scripture,
    bodyText: row.body,
    quotableLine: row.quote,
    isRead: readAt != null,
    readAt,
    isRevealed: readAt != null,
    generatedAt: nowIso,
    updatedAt: nowIso,
  };
}

function baseIntent(now: Date, trialDays: AllowedTrialDays, status: AutoTrialIntentV1['status']): AutoTrialIntentV1 {
  const purchasedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + TRIAL_LENGTH_MS).toISOString();
  return {
    version: 1,
    intentId: QA_INTENT_ID,
    deviceId: 'qa-fixture-device',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: true,
    trialDays,
    purchasedAt,
    expiresAt,
    purchaseLocalDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    timeZone: 'America/Chicago',
    platform: 'ios',
    isSandbox: true,
    productIdentifier: 'unfold_premium_yearly',
    switchEnabledAtPurchase: true,
    switchFetchedAt: purchasedAt,
    requestId: QA_REQUEST_ID,
    status,
    jobId: null,
    devotionalId: null,
    createdAt: purchasedAt,
    updatedAt: purchasedAt,
    submittedAt: status === 'purchased' ? null : purchasedAt,
    landedAt: status === 'landed' || status === 'revealed' || status === 'completed' ? purchasedAt : null,
    revealedAt: status === 'revealed' || status === 'completed' ? purchasedAt : null,
    completedAt: status === 'completed' ? purchasedAt : null,
    dismissedAt: null,
    failedAt: status === 'failed' ? purchasedAt : null,
    failureCode: status === 'failed' ? 'max_retries' : null,
    abandonedAt: null,
    abandonReason: null,
  };
}

function buildSeriesDevotional(
  now: Date,
  dayOffset: number,
  readThroughDay: 0 | 1 | 2 | 3,
  includeDay3: boolean,
  trialDays: AllowedTrialDays,
): Devotional {
  const nowIso = now.toISOString();
  const start = atLocalNoon(now, dayOffset);
  const days: DevotionalDay[] = [];
  const lastDay = includeDay3 ? 3 : 2;
  for (const dayNumber of [1, 2, 3] as const) {
    if (dayNumber > lastDay) continue;
    const readAt = dayNumber <= readThroughDay ? readAtForDay(now, dayOffset, dayNumber) : undefined;
    days.push(fictionalDay(QA_DEVOTIONAL_ID, dayNumber, nowIso, readAt));
  }
  const unread = Array.from({ length: trialDays }, (_, index) => index + 1)
    .find((dayNumber) => !days.some((day) => day.dayNumber === dayNumber && day.isRead));
  return {
    id: QA_DEVOTIONAL_ID,
    title: 'Ordinary Hours',
    totalDays: trialDays,
    currentDay: unread ?? trialDays,
    createdAt: nowIso,
    updatedAt: nowIso,
    seriesStartDate: start.toISOString(),
    generationMode: 'progressive',
    userContext: {
      name: 'Riven Hale',
      aboutMe: 'A fictional reader used only for fixture captures.',
      currentSituation: 'Walking a short series through an ordinary week.',
      emotionalState: 'Steady',
    },
    seriesArc: {
      totalDaysPlanned: trialDays,
      overarchingTheme: 'God in ordinary hours',
      narrativeShape: 'three quiet movements',
      dayHints: days.map((day) => ({
        dayNumber: day.dayNumber,
        themeHint: day.title,
        scriptureRegion: day.scriptureReference,
        narrativeRole: day.dayNumber === 1 ? 'foundation' : day.dayNumber === 2 ? 'deepening' : 'resolution',
        dayTitle: day.title,
      })),
      isOpenEnded: false,
      createdAt: nowIso,
      seriesKind: 'auto_trial',
      promise: 'You will notice God in the middle of the week.',
    },
    days,
  };
}

export function buildTrialSeriesSeed(i: {
  state: TrialSeriesFixtureState;
  now: Date;
  devotionalId?: string;
}): TrialSeriesSeed {
  const trialDays = roundTrialDays(TRIAL_LENGTH_MS);
  if (trialDays == null) throw new Error('Trial fixture length is not an allowed trial.');
  const today: Href = '/(tabs)/(today)';
  const generating: Href = '/generating';

  if (i.state === 'reveal-generating') {
    return {
      intent: { ...baseIntent(i.now, trialDays, 'submitted'), jobId: QA_JOB_GENERATING },
      uiFlags: {},
      target: generating,
    };
  }
  if (i.state === 'reveal-failed') {
    return {
      intent: { ...baseIntent(i.now, trialDays, 'submitted'), jobId: QA_JOB_FAILED },
      uiFlags: {},
      target: generating,
    };
  }
  if (i.state === 'reveal-exhausted') {
    return {
      intent: { ...baseIntent(i.now, trialDays, 'failed'), jobId: QA_JOB_FAILED },
      uiFlags: {},
      target: generating,
    };
  }
  if (i.state === 'confirmation') {
    return {
      intent: baseIntent(i.now, trialDays, 'purchased'),
      uiFlags: {},
      target: { pathname: '/onboarding', params: { startAt: 'purchaseConfirmation' } },
    };
  }
  if (i.state === 'later-entry-notify') {
    return {
      uiFlags: { laterEntryNotifyAskPending: true },
      target: today,
    };
  }

  const dayOffset = DAY_OFFSET[i.state] ?? 0;
  const includeDay3 = i.state !== 'today-lapsed-before-day3';
  const readThroughDay: 0 | 1 | 2 | 3 = i.state === 'today-day1'
    ? 0
    : i.state === 'today-day2'
      ? 1
      : i.state === 'series-complete'
        ? 3
        : 2;
  const devotional = buildSeriesDevotional(i.now, dayOffset, readThroughDay, includeDay3, trialDays);
  if (i.devotionalId) {
    devotional.id = i.devotionalId;
    for (const day of devotional.days) {
      day.devotionalId = i.devotionalId;
      day.id = canonicalGeneratedDayId(i.devotionalId, day.dayNumber);
    }
  }
  const intent = {
    ...baseIntent(
      i.now,
      trialDays,
      i.state === 'series-complete' ? 'completed' : 'revealed',
    ),
    jobId: QA_JOB_LANDED,
    devotionalId: devotional.id,
  };
  return {
    devotional,
    intent,
    uiFlags: i.state === 'today-lapsed-before-day3' ? { debugForceTrialExpired: true } : {},
    target: today,
  };
}

export function assertTrialSeriesFixtureEnvironment(backendUrl = PRIMARY_BACKEND_URL): void {
  let host = '';
  try {
    host = new URL(backendUrl).hostname;
  } catch {
    throw new Error(TRIAL_SERIES_FIXTURE_GUARD_MESSAGE);
  }
  if (!__DEV__ || (host !== '127.0.0.1' && host !== 'localhost')) {
    throw new Error(TRIAL_SERIES_FIXTURE_GUARD_MESSAGE);
  }
}
