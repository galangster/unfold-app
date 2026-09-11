import type { Href } from 'expo-router';
import { PRIMARY_BACKEND_URL } from '@/lib/backend-url';
import type { AutoTrialIntentV1 } from '@/lib/auto-trial-intent';
import { isLocalFixtureEnvironment } from '@/lib/qa-tools';
import type { Devotional, DevotionalDay } from '@/lib/store';
import { roundTrialDays, type AllowedTrialDays } from '@/lib/trial-facts';
import { canonicalGeneratedDayId } from './devotional-canonical-days';
import type { TrialSeriesFixtureState } from './trial-series-fixtures';

export {
  TRIAL_SERIES_FIXTURE_STATES,
  isTrialSeriesFixtureState,
  type TrialSeriesFixtureState,
} from './trial-series-fixtures';

export const TRIAL_SERIES_FIXTURE_GUARD_MESSAGE =
  'Trial series fixtures require the isolated local environment.';

export const TRIAL_SERIES_FIXTURE_PERSONA = {
  name: 'Riven Hale',
  aboutMe: 'A fictional reader used only for fixture captures.',
  currentSituation: 'Walking a short series through an ordinary week.',
  emotionalState: 'Steady',
} as const;

const QA_DEVOTIONAL_ID = 'qa-auto-trial-series';
const QA_JOB_GENERATING = 'qa-fixture-generating';
const QA_JOB_FAILED = 'qa-fixture-failed';
const QA_JOB_LANDED = 'qa-fixture-landed';
const QA_INTENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const QA_REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const TRIAL_LENGTH_MS = 259_200_000;

const REVEAL_SEEDS: Partial<Record<TrialSeriesFixtureState, {
  status: AutoTrialIntentV1['status'];
  jobId: string;
}>> = {
  'reveal-generating': { status: 'submitted', jobId: QA_JOB_GENERATING },
  'reveal-failed': { status: 'submitted', jobId: QA_JOB_FAILED },
  'reveal-exhausted': { status: 'failed', jobId: QA_JOB_FAILED },
};

const FIXTURE_PLAN: Partial<Record<TrialSeriesFixtureState, {
  dayOffset: number;
  readThroughDay: 0 | 1 | 2 | 3;
  includeDay3: boolean;
}>> = {
  'today-day1': { dayOffset: 0, readThroughDay: 0, includeDay3: true },
  'today-day2': { dayOffset: 1, readThroughDay: 1, includeDay3: true },
  'today-day2-read': { dayOffset: 1, readThroughDay: 2, includeDay3: true },
  'today-day3': { dayOffset: 2, readThroughDay: 2, includeDay3: true },
  'today-lapsed-before-day3': { dayOffset: 2, readThroughDay: 2, includeDay3: false },
  'series-complete': { dayOffset: 2, readThroughDay: 3, includeDay3: true },
};

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
  devotionalId = QA_DEVOTIONAL_ID,
): Devotional {
  const nowIso = now.toISOString();
  const start = atLocalNoon(now, dayOffset);
  const days: DevotionalDay[] = [];
  const lastDay = includeDay3 ? 3 : 2;
  for (const dayNumber of [1, 2, 3] as const) {
    if (dayNumber > lastDay) continue;
    const readAt = dayNumber <= readThroughDay ? readAtForDay(now, dayOffset, dayNumber) : undefined;
    days.push(fictionalDay(devotionalId, dayNumber, nowIso, readAt));
  }
  const unread = days.find((day) => !day.isRead)?.dayNumber;
  return {
    id: devotionalId,
    title: 'Ordinary Hours',
    totalDays: trialDays,
    currentDay: unread ?? trialDays,
    createdAt: nowIso,
    updatedAt: nowIso,
    seriesStartDate: start.toISOString(),
    generationMode: 'progressive',
    userContext: {
      ...TRIAL_SERIES_FIXTURE_PERSONA,
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

  const reveal = REVEAL_SEEDS[i.state];
  if (reveal) {
    return {
      intent: { ...baseIntent(i.now, trialDays, reveal.status), jobId: reveal.jobId },
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

  const plan = FIXTURE_PLAN[i.state] ?? { dayOffset: 0, readThroughDay: 2, includeDay3: true };
  const devotional = buildSeriesDevotional(
    i.now,
    plan.dayOffset,
    plan.readThroughDay,
    plan.includeDay3,
    trialDays,
    i.devotionalId ?? QA_DEVOTIONAL_ID,
  );
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
  if (!isLocalFixtureEnvironment(backendUrl)) {
    throw new Error(TRIAL_SERIES_FIXTURE_GUARD_MESSAGE);
  }
}
