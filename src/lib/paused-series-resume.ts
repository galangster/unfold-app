import { PRIMARY_BACKEND_URL, getAuthHeaders } from './api-config';
import { authenticatedFetch } from './device-credential';
import { isEphemeralDeviceId } from './device-id';
import { getDeviceId } from './mmkv-storage';
import { useUnfoldStore } from './store';
import { buildPersonalDataSyncChange } from './personal-data-sync-records';
import { extractDevotionalLifecycle } from './devotional-lifecycle';
import { correlateSyncAcknowledgements } from './sync-acknowledgements';
import { createSyncPushBodyEnvelope, selectEncodedSyncPushBatch } from './sync-push-body';
import { createSyncOperation } from './sync-operation';
import { pullDevotionalContent } from './devotional-sync-pull';
import { isStrictActiveSeriesWinner } from './devotional-active-selection';
import { pausedSeriesResumeClocks } from './paused-series-recovery';

/** One confirmed, view-owned resume. It never becomes background outbox work. */
export function createPausedSeriesResume(options: {
  devotionalId: string;
  expectedActiveId: string | null;
  session: number;
  isViewCurrent: () => boolean;
}) {
  const previous = useUnfoldStore.getState().devotionals.find((series) => series.id === options.devotionalId);
  if (!previous) throw new Error('Series is unavailable');
  const deadlineAt = Date.now() + 15_000;
  const operation = createSyncOperation({ action: 'series continuation', session: options.session, deadlineAt });
  let intentClock: string | undefined;
  const isSelectionCompatible = () => {
    const state = useUnfoldStore.getState();
    const target = state.devotionals.find((series) => series.id === options.devotionalId);
    const exactApplied = intentClock !== undefined && target?.archivedAt === null && target.archivedStateAt === intentClock;
    return !!target && (state.currentDevotionalId === options.expectedActiveId || (state.currentDevotionalId === options.devotionalId && exactApplied))
      && (target.archivedStateAt === previous.archivedStateAt || exactApplied);
  };
  const assertCurrent = () => {
    operation.assertCurrent();
    if (!options.isViewCurrent() || !isSelectionCompatible()) { operation.cancel(); throw new Error('Series continuation cancelled'); }
  };
  return {
    cancel: operation.cancel, isSelectionCompatible, isViewCurrent: options.isViewCurrent,
    async run() {
      try {
        assertCurrent();
        if (isEphemeralDeviceId(getDeviceId())) throw new Error('Series continuation requires a restored identity');
        // The push route is an upsert. Verify an existing canonical target
        // before sending a lifecycle-only intent instead of recreating stale content.
        const before = await operation.wait(pullDevotionalContent(options.devotionalId, {
          forceFull: true, timeoutMs: deadlineAt - Date.now(), signal: operation.signal,
        }));
        assertCurrent();
        if (!before.canonicalSeries?.some((series) => series.id === options.devotionalId && series.generationMode === 'progressive')) {
          throw new Error('Canonical series is unavailable');
        }
        pausedSeriesResumeClocks.observeCanonical(options.session, before.canonicalSeries);
        intentClock = pausedSeriesResumeClocks.nextIntentAt(options.session, options.devotionalId, useUnfoldStore.getState().devotionals);
        const headers = await operation.wait(getAuthHeaders());
        assertCurrent();
        const latest = useUnfoldStore.getState().devotionals.find((series) => series.id === options.devotionalId)!;
        // Keep content's own timestamp; a lifecycle intent must not promote stale progress.
        const change = buildPersonalDataSyncChange('devotionals', options.devotionalId,
          { archivedAt: null, archivedStateAt: intentClock }, latest.updatedAt ?? latest.createdAt);
        const { batch, body } = selectEncodedSyncPushBatch([change], 0, () => true, createSyncPushBodyEnvelope(), 1, 5 * 1024 * 1024);
        if (batch.length !== 1) throw new Error('Series continuation is too large');
        assertCurrent();
        const response = await operation.wait(authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
          method: 'POST', headers, body, signal: operation.signal,
        }));
        if (!response.ok) throw new Error('Series continuation push failed');
        const payload = await operation.wait(response.json()) as { results?: unknown[] };
        assertCurrent();
        const result = correlateSyncAcknowledgements([change], payload.results ?? [])[0]?.result;
        const conflictLifecycle = extractDevotionalLifecycle(result?.serverData);
        const lifecycleAcknowledged = result?.status === 'accepted' || (result?.status === 'conflict'
          && result.id === options.devotionalId && conflictLifecycle.archivedAt === null && conflictLifecycle.archivedStateAt === intentClock);
        if (!lifecycleAcknowledged) throw new Error('Series continuation was not acknowledged');
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) throw new Error('Series continuation timed out');
        const pulled = await operation.wait(pullDevotionalContent(options.devotionalId, {
          forceFull: true, timeoutMs: remainingMs, signal: operation.signal,
        }));
        assertCurrent();
        if (!pulled.canonicalSeries) throw new Error('Canonical selection evidence is unavailable');
        pausedSeriesResumeClocks.observeCanonical(options.session, pulled.devotional
          ? [...pulled.canonicalSeries, pulled.devotional] : pulled.canonicalSeries);
        const canonical = pulled.canonicalSeries.map((series) => series.id === options.devotionalId
          ? { ...previous, ...series, createdAt: series.createdAt ?? previous.createdAt, generationMode: series.generationMode ?? previous.generationMode } : series);
        if (pulled.devotional?.id !== options.devotionalId || pulled.devotional.archivedAt !== null
          || pulled.devotional.archivedStateAt !== intentClock || !isStrictActiveSeriesWinner(options.devotionalId, canonical)) {
          throw new Error('Canonical series selection did not confirm this resume');
        }
        assertCurrent();
        if (!useUnfoldStore.getState().activateAcknowledgedDevotionalResume(options.devotionalId, options.expectedActiveId, previous.archivedStateAt, intentClock)) {
          throw new Error('Series changed before activation');
        }
        if (pulled.days.length > 0) useUnfoldStore.getState().updateDevotionalDays(options.devotionalId, pulled.days);
        return pulled;
      } finally { operation.dispose(); }
    },
  };
}

export type PausedSeriesResume = ReturnType<typeof createPausedSeriesResume>;
