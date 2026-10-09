/**
 * The series "Start a new series" replaces, kept until the new one lands.
 *
 * Confirming "Start a new series?" used to end the current series at once,
 * before a new one existed. A reader who backed out of the first question,
 * quit mid-questionnaire, or gave up on a failed generation was left with no
 * series, and the server stopped writing the old one: it generates only a
 * series that has not been ended. Now the confirm records the series here
 * and leaves it current. `applyInitialArcResult` ends it when the new series
 * lands, wherever that happens (/generating, Today's watch, a later visit
 * after an app kill), which is why the record lives in MMKV and not in a
 * screen. A reader who leaves the flow with no new series on its way keeps
 * reading; the record is forgotten.
 *
 * `full-reset.ts` wipes the key with the account's other data.
 */
import { mmkvStorage } from '@/lib/mmkv-storage';
import { readInflightGenerationJob } from '@/lib/inflight-generation-job';
import { readInitialGenerationRequestId } from '@/lib/initial-generation-request';

export const REPLACED_SERIES_KEY = 'replaced-series-v1';
/**
 * The replaced series' lifecycle clock (archivedStateAt, '' for none) when the
 * reader chose to replace it. Any later pause or resume moves that clock, and
 * comparing it to itself needs no device clock. A record an older build wrote
 * has none.
 */
export const REPLACED_SERIES_STATE_KEY = 'replaced-series-state-v1';

/**
 * The new series that replaces it, bound when that series' generation job is
 * recorded. Only its result ends the replaced series. An older job that lands
 * meanwhile (a notification for an earlier attempt) leaves it alone.
 */
export const REPLACEMENT_SERIES_KEY = 'replaced-series-replacement-v1';

export function recordReplacedSeries(devotionalId: string, seenStateAt = ''): void {
  mmkvStorage.setItem(REPLACED_SERIES_KEY, devotionalId);
  mmkvStorage.setItem(REPLACED_SERIES_STATE_KEY, seenStateAt);
  mmkvStorage.removeItem(REPLACEMENT_SERIES_KEY);
}

/** Binds a pending replacement to the series its first recorded job generates. */
export function bindReplacementSeries(replacementId: string): void {
  if (!readReplacedSeries() || readReplacementSeries()) return;
  mmkvStorage.setItem(REPLACEMENT_SERIES_KEY, replacementId);
}

export function readReplacementSeries(): string | null {
  const stored = mmkvStorage.getItem(REPLACEMENT_SERIES_KEY) as string | null;
  return stored || null;
}

/** The lifecycle clock recorded with the choice, or null for an older build's record. */
export function readReplacedSeriesState(): string | null {
  const stored = mmkvStorage.getItem(REPLACED_SERIES_STATE_KEY) as string | null;
  return stored ?? null;
}

export function readReplacedSeries(): string | null {
  const stored = mmkvStorage.getItem(REPLACED_SERIES_KEY) as string | null;
  return stored || null;
}

export function clearReplacedSeries(): void {
  mmkvStorage.removeItem(REPLACED_SERIES_KEY);
  mmkvStorage.removeItem(REPLACED_SERIES_STATE_KEY);
  mmkvStorage.removeItem(REPLACEMENT_SERIES_KEY);
}

/**
 * The reader left the new-series flow. Keep the record while a new series is
 * still on its way: a submitted job, or a request Today still offers to
 * continue. Either can land later and must still end the series it replaces.
 */
export function forgetReplacedSeriesUnlessPending(): void {
  const inflight = readInflightGenerationJob();
  if ((inflight && !inflight.superseded) || readInitialGenerationRequestId()) return;
  clearReplacedSeries();
}
