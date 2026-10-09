import type { Devotional, DevotionalDay } from './store';
import type { PulledDevotionalContent } from './devotional-sync-pull';
import type { ActiveSeriesCandidate } from './devotional-active-selection';
import { canonicalGeneratedDayId } from './devotional-canonical-days';
import {
  didDevotionalLifecycleChange,
  isDevotionalArchived,
  mergeDevotionalLifecycle,
  parseLifecycleTimestamp,
} from './devotional-lifecycle';
import { assertSyncSessionCurrent } from './sync-session-fence';
import { peekSyncOutbox } from './sync-outbox';
import { buildDevotionalSyncMetadataPatch } from './devotional-sync-metadata';
import {
  clampCurrentDayToSeriesBoundary,
  filterDaysWithinSeriesBoundary,
  getServerOwnedSeriesTotalDays,
} from './devotional-series-boundary';

const pullSessions = new WeakMap<PulledDevotionalContent, number>();

export function bindPulledDevotionalSession(pulled: PulledDevotionalContent, session: number): void {
  pullSessions.set(pulled, session);
}

function assertBoundPulledSession(pulled: PulledDevotionalContent): void {
  const session = pullSessions.get(pulled);
  if (session === undefined) return;
  assertSyncSessionCurrent(session, 'devotional apply');
}

function normalizePulledDaysForDevotional(
  devotionalId: string,
  days: DevotionalDay[],
  updatedAt: string,
): DevotionalDay[] {
  return days
    .map((day) => ({
      ...day,
      id: day.id ?? canonicalGeneratedDayId(devotionalId, day.dayNumber),
      devotionalId,
      updatedAt: day.updatedAt ?? updatedAt,
    }))
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

function buildPulledDevotionalShell(
  devotionalId: string,
  pulled: PulledDevotionalContent,
): Devotional | null {
  if (!pulled.devotional && pulled.days.length === 0) return null;

  const updatedAt = pulled.devotional?.updatedAt ?? pulled.timestamp ?? new Date().toISOString();
  const normalizedDays = normalizePulledDaysForDevotional(devotionalId, pulled.days, updatedAt);
  const boundarySource = {
    totalDays: pulled.devotional?.totalDays ?? 0,
    seriesArc: pulled.devotional?.seriesArc,
  };
  const days = filterDaysWithinSeriesBoundary(normalizedDays, boundarySource);
  const highestPulledDayNumber = days.reduce((highest, day) => Math.max(highest, day.dayNumber), 0);
  const boundaryTotalDays = getServerOwnedSeriesTotalDays(boundarySource);
  const totalDays = Math.max(
    boundaryTotalDays,
    highestPulledDayNumber,
    days.length,
    1,
  );
  const currentDay = clampCurrentDayToSeriesBoundary(
    Math.max(1, pulled.devotional?.currentDay ?? days[0]?.dayNumber ?? 1),
    { totalDays, seriesArc: pulled.devotional?.seriesArc },
  );

  // The calendar anchor decides which day is due today and, once pushed back
  // on the first read, becomes the server's anchor too. The server's own
  // seriesStartDate is authoritative; a shell rebuilt from a pull used to
  // derive it from the first pulled day (or the row's updatedAt — days after
  // the real start), which could lock a restored reader out of days they were
  // owed and then push that wrong anchor upstream.
  const seriesStartDate = pulled.devotional?.seriesStartDate ?? days[0]?.generatedAt ?? updatedAt;
  const lifecycle = mergeDevotionalLifecycle({
    incoming: {
      archivedAt: pulled.devotional?.archivedAt,
      archivedStateAt: pulled.devotional?.archivedStateAt,
    },
  });

  return {
    id: devotionalId,
    title: pulled.devotional?.title ?? days[0]?.title ?? 'Your Devotional',
    totalDays,
    currentDay,
    days,
    createdAt: seriesStartDate,
    updatedAt,
    seriesStartDate,
    userContext: {
      name: '',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    generationMode: 'progressive',
    ...(pulled.devotional?.seriesArc ? { seriesArc: pulled.devotional.seriesArc } : {}),
    ...lifecycle,
  };
}

export function applyPulledDevotionalMetadataToDevotionals(
  devotionals: Devotional[],
  devotionalId: string,
  pulled: PulledDevotionalContent,
): Devotional[] {
  assertBoundPulledSession(pulled);
  if (!pulled.devotional) return devotionals;

  let didChange = false;
  const nextDevotionals = devotionals.map((devotional) => {
    if (devotional.id !== devotionalId) return devotional;

    const patch = buildDevotionalSyncMetadataPatch(devotional, pulled.devotional);
    if (Object.keys(patch).length === 0) return devotional;

    didChange = true;
    return { ...devotional, ...patch };
  });

  return didChange ? nextDevotionals : devotionals;
}

function pulledSeriesBesides(pulled: PulledDevotionalContent, devotionalId: string) {
  return pulled.canonicalSeries?.filter((series) => series.id !== devotionalId) ?? [];
}

/** The reader deleted this series here, and the delete has not reached the server yet. */
export function hasQueuedSeriesDelete(devotionalId: string): boolean {
  return peekSyncOutbox().some((change) => change.table === 'devotionals' && change.deleted && change.id === devotionalId);
}

/** Lifecycle clocks still waiting in the outbox count as local, as in the full sync. */
function pendingLifecycleClocksById(): Map<string, string> {
  const pending = new Map<string, string>();
  for (const change of peekSyncOutbox()) {
    if (change.table !== 'devotionals' || change.deleted) continue;
    const archivedStateAt = parseLifecycleTimestamp(change.data.archivedStateAt);
    if (typeof archivedStateAt !== 'string') continue;
    const existing = pending.get(change.id);
    if (!existing || existing < archivedStateAt) pending.set(change.id, archivedStateAt);
  }
  return pending;
}

/**
 * The other rows' archive and resume clocks, with the same compare-and-set
 * as the full sync. Their content and progress, and rows this device does not
 * hold, wait for the full sync.
 */
function applyPulledSeriesLifecycleToDevotionals(
  devotionals: Devotional[],
  devotionalId: string,
  pulled: PulledDevotionalContent,
): Devotional[] {
  assertBoundPulledSession(pulled);
  const incomingById = new Map(pulledSeriesBesides(pulled, devotionalId).map((series) => [series.id, series]));
  if (incomingById.size === 0) return devotionals;

  const pending = pendingLifecycleClocksById();
  let didChange = false;
  const nextDevotionals = devotionals.map((devotional) => {
    const incoming = incomingById.get(devotional.id);
    if (!incoming) return devotional;
    const lifecycle = mergeDevotionalLifecycle({
      local: devotional,
      incoming: { archivedAt: incoming.archivedAt, archivedStateAt: incoming.archivedStateAt },
      pendingArchivedStateAt: pending.get(devotional.id),
    });
    if (!didDevotionalLifecycleChange(devotional, lifecycle)) return devotional;
    didChange = true;
    return { ...devotional, ...lifecycle };
  });

  return didChange ? nextDevotionals : devotionals;
}

function applyPulledRequestedSeries(
  devotionals: Devotional[],
  devotionalId: string,
  pulled: PulledDevotionalContent,
): Devotional[] {
  const existing = devotionals.some((devotional) => devotional.id === devotionalId);
  if (existing) {
    return applyPulledDevotionalMetadataToDevotionals(devotionals, devotionalId, pulled);
  }

  const shell = buildPulledDevotionalShell(devotionalId, pulled);
  return shell ? [shell, ...devotionals] : devotionals;
}

function endsCurrentSeries(
  before: readonly Devotional[],
  after: readonly Devotional[],
  currentDevotionalId: string | null | undefined,
): boolean {
  if (!currentDevotionalId) return false;
  const current = before.find((devotional) => devotional.id === currentDevotionalId);
  if (!current || isDevotionalArchived(current)) return false;
  return isDevotionalArchived(after.find((devotional) => devotional.id === currentDevotionalId));
}

/**
 * A pull of one series returns every series row that changed. "Continue this
 * series" on another device resumes one series and pauses the current one on
 * the same clock. When this pull ends the series Today shows, apply the other
 * rows' archive and resume clocks with it, so the resume it carries can
 * still take Today. Otherwise leave them for the full sync, as before this
 * release: a resume applied while the current series stays live no longer
 * reads as newer once the pause lands, and Today would stay empty for good.
 */
export function applyPulledDevotionalContentToDevotionals(
  devotionals: Devotional[],
  devotionalId: string,
  pulled: PulledDevotionalContent,
  currentDevotionalId?: string | null,
): Devotional[] {
  assertBoundPulledSession(pulled);
  const withLifecycle = applyPulledSeriesLifecycleToDevotionals(devotionals, devotionalId, pulled);
  if (withLifecycle !== devotionals) {
    const withSeriesLifecycle = applyPulledRequestedSeries(withLifecycle, devotionalId, pulled);
    if (endsCurrentSeries(devotionals, withSeriesLifecycle, currentDevotionalId)) return withSeriesLifecycle;
  }
  return applyPulledRequestedSeries(devotionals, devotionalId, pulled);
}

export function applyPulledDevotionalContent({
  devotionalId,
  pulled,
  updateDevotionalDays,
  updateDevotionals,
}: {
  devotionalId: string;
  pulled: PulledDevotionalContent;
  updateDevotionalDays: (devotionalId: string, days: DevotionalDay[], title?: string) => void;
  /**
   * Applies the updater and selects the current series. The updater needs
   * the current series id: only a pull that ends it applies the other rows'
   * lifecycle clocks. It receives every pulled series row too: a row this
   * device does not hold can still be the series the server writes, and
   * Today must not follow an older one.
   */
  updateDevotionals: (
    updater: (devotionals: Devotional[], currentDevotionalId?: string | null) => Devotional[],
    pulledSeries?: readonly ActiveSeriesCandidate[],
  ) => void;
}): void {
  assertBoundPulledSession(pulled);
  // A series this device deleted stays deleted while the delete waits in the
  // outbox: until it lands, the server still returns its live copy.
  if (hasQueuedSeriesDelete(devotionalId)) return;
  if (pulled.devotional || pulled.days.length > 0 || pulledSeriesBesides(pulled, devotionalId).length > 0) {
    updateDevotionals(
      (devotionals, currentDevotionalId) => applyPulledDevotionalContentToDevotionals(
        devotionals,
        devotionalId,
        pulled,
        currentDevotionalId,
      ),
      pulled.canonicalSeries,
    );
  }

  const daysToApply = pulled.days.length > 0
    ? filterDaysWithinSeriesBoundary(pulled.days, {
      totalDays: pulled.devotional?.totalDays ?? 0,
      seriesArc: pulled.devotional?.seriesArc,
    })
    : [];

  if (daysToApply.length > 0) {
    updateDevotionalDays(devotionalId, daysToApply, pulled.devotional?.title);
  }
}
