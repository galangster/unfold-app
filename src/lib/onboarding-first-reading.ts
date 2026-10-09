import {
  isAutoTrialSeries,
  isOnboardingFirstReading,
  isOnboardingSampleDevotionalId,
  withOnboardingFirstReadingArc,
} from '@/lib/auto-trial-series';
import { isUsableSampleDevotionalDay } from '@/lib/onboarding-sample-day-shape';
import { enqueuePersonalDataSyncChange, devotionalSyncData } from '@/lib/personal-data-sync-records';
import { normalizeDevotionalIdentity, normalizeGeneratedDayIdentity } from '@/lib/generation-reconciliation';
import { useUnfoldStore, type Devotional, type DevotionalDay } from '@/lib/store';

export { withOnboardingFirstReadingArc } from '@/lib/auto-trial-series';

export const ONBOARDING_FIRST_READING_SAVED_MESSAGE =
  'Saved to your bookshelf. Come back to this reading anytime.';
export const ONBOARDING_FIRST_READING_COMPLETE_MESSAGE = 'Your first devotional, complete.';

const EMPTY_CONTEXT: Devotional['userContext'] = {
  name: '',
  aboutMe: '',
  currentSituation: '',
  emotionalState: '',
};

function preservedTitle(existing: Devotional | undefined, day: DevotionalDay, replacesStored = false): string {
  const current = existing?.title?.trim();
  if (current && current !== 'Your First Devotional' && !replacesStored) return current;
  return day.title?.trim() || current || '';
}

function clockMs(value: string | undefined): number {
  const ms = Date.parse(value ?? '');
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * The job finished after the stored sample was last written. A reader who
 * reinstalls keeps the Keychain identity, so a new onboarding reuses the
 * sample id, and a pull can restore the old sample before the new job lands.
 * The server stamps a finished job's day with the job's completion time.
 */
function isNewerThanStored(existing: Devotional | undefined, incoming: DevotionalDay): boolean {
  const stored = existing?.days.find((day) => day.dayNumber === 1);
  if (!stored) return false;
  const completedAt = clockMs(incoming.updatedAt ?? incoming.generatedAt);
  return completedAt > Math.max(clockMs(stored.updatedAt), clockMs(existing?.updatedAt));
}

function sameContext(
  left: Devotional['userContext'] | undefined,
  right: Devotional['userContext'] | undefined,
): boolean {
  return (left?.name ?? '') === (right?.name ?? '')
    && (left?.aboutMe ?? '') === (right?.aboutMe ?? '')
    && (left?.currentSituation ?? '') === (right?.currentSituation ?? '')
    && (left?.emotionalState ?? '') === (right?.emotionalState ?? '');
}

function mergeFirstReadingDay(
  existing: Devotional | undefined,
  id: string,
  incoming: DevotionalDay,
  replacesStored: boolean,
): DevotionalDay {
  const normalized = normalizeGeneratedDayIdentity(id, { ...incoming, dayNumber: 1 }, 1);
  const current = existing?.days.find((day) => day.dayNumber === 1);
  if (replacesStored || !current || !isUsableSampleDevotionalDay(current)) return normalized;
  return {
    ...normalized,
    ...current,
    id: current.id ?? normalized.id,
    devotionalId: current.devotionalId ?? normalized.devotionalId,
    isRead: current.isRead === true || normalized.isRead === true,
    readAt: current.readAt ?? normalized.readAt,
  };
}

function shouldKeepExistingCurrent(state: {
  currentDevotionalId: string | null;
  devotionals: Devotional[];
}, incomingId: string): boolean {
  const current = state.devotionals.find((row) => row.id === state.currentDevotionalId);
  if (!current || current.id === incomingId) return false;
  if (isAutoTrialSeries(current)) return true;
  return !isOnboardingSampleDevotionalId(current.id);
}

function nextWriteAt(previous: string | undefined): string {
  const previousMs = Date.parse(previous ?? '');
  return new Date(Math.max(Date.now(), Number.isNaN(previousMs) ? 0 : previousMs + 1)).toISOString();
}

export function persistOnboardingFirstReading(input: {
  id?: string | null;
  day?: unknown;
  userContext?: Devotional['userContext'];
  createdAt?: string;
}): boolean {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!id) return false;

  const store = useUnfoldStore.getState();
  const existingSameId = store.devotionals.find((row) => row.id === id);
  if (!isUsableSampleDevotionalDay(input.day)) {
    return isOnboardingFirstReading(existingSameId)
      && isUsableSampleDevotionalDay(existingSameId?.days.find((day) => day.dayNumber === 1));
  }
  if (existingSameId && isAutoTrialSeries(existingSameId)) return false;
  if (existingSameId && (existingSameId.totalDays !== 1 || existingSameId.days.some((day) => day.dayNumber > 1))) {
    return false;
  }

  const otherFirst = store.devotionals.find((row) => isOnboardingFirstReading(row) && row.id !== id);
  if (otherFirst) return isOnboardingFirstReading(existingSameId);

  const createdAt = input.createdAt ?? existingSameId?.createdAt ?? new Date().toISOString();
  const userContext = existingSameId?.userContext?.name
    ? existingSameId.userContext
    : (input.userContext ?? existingSameId?.userContext ?? EMPTY_CONTEXT);
  const replacesStored = isNewerThanStored(existingSameId, input.day);
  const day = mergeFirstReadingDay(existingSameId, id, input.day, replacesStored);
  const seriesArc = withOnboardingFirstReadingArc(existingSameId?.seriesArc, createdAt);
  const alreadyMarked = existingSameId != null
    && isOnboardingFirstReading(existingSameId)
    && existingSameId.title === preservedTitle(existingSameId, day, replacesStored)
    && existingSameId.days[0]?.bodyText === day.bodyText
    && existingSameId.days[0]?.isRead === day.isRead
    && sameContext(existingSameId.userContext, userContext)
    && existingSameId.seriesArc?.origin === seriesArc.origin;
  if (alreadyMarked) return true;

  // The saved day carries the write's clock, so a pull of an older row of the
  // same day cannot replace it.
  const storedDayAt = existingSameId?.days.find((row) => row.dayNumber === 1)?.updatedAt;
  const updatedAt = nextWriteAt(clockMs(storedDayAt) > clockMs(existingSameId?.updatedAt) ? storedDayAt : existingSameId?.updatedAt);
  const next: Devotional = normalizeDevotionalIdentity({
    ...(existingSameId ?? {
      id,
      totalDays: 1,
      currentDay: 1,
      createdAt,
      seriesStartDate: createdAt,
      generationMode: 'progressive',
    }),
    id,
    title: preservedTitle(existingSameId, day, replacesStored),
    totalDays: existingSameId?.totalDays ?? 1,
    currentDay: existingSameId?.currentDay ?? 1,
    days: [{ ...day, updatedAt }],
    createdAt,
    seriesStartDate: existingSameId?.seriesStartDate ?? createdAt,
    userContext,
    generationMode: existingSameId?.generationMode ?? 'progressive',
    seriesArc,
    archivedAt: existingSameId?.archivedAt,
    archivedStateAt: existingSameId?.archivedStateAt,
    updatedAt,
  });

  const keepCurrent = shouldKeepExistingCurrent(store, id);
  useUnfoldStore.setState((state) => ({
    devotionals: existingSameId
      ? state.devotionals.map((row) => (row.id === id ? next : row))
      : [next, ...state.devotionals],
    currentDevotionalId: keepCurrent ? state.currentDevotionalId : id,
    hasEverCreatedDevotional: true,
  }));

  enqueuePersonalDataSyncChange(
    'devotionals',
    next.id,
    devotionalSyncData(next),
    next.updatedAt ?? next.archivedStateAt ?? createdAt,
  );
  return true;
}
