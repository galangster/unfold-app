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
 * When the reader chose to replace the series. The end that lands later is
 * dated from then, so a resume the reader makes elsewhere after the choice
 * still wins on the server. A record an older build wrote has none.
 */
export const REPLACED_SERIES_CHOSEN_AT_KEY = 'replaced-series-chosen-at-v1';

/**
 * The new series that replaces it: the first one the server names for the
 * request made after the choice, in the submission's response or in the
 * result of the job that answered that request. Only its result ends the
 * replaced series. An older job that lands meanwhile (a notification for an
 * earlier attempt) leaves it alone.
 *
 * The binding holds while that request is on its way: stored, or answered by
 * the live in-flight job. Dismissing a lost connection on Today retires the
 * request but keeps that job, and its result still ends the replaced series.
 * Start over supersedes the job, and a failed job's verdict clears it with the
 * request, so the next request binds the series it generates.
 */
export const REPLACEMENT_SERIES_KEY = 'replaced-series-replacement-v1';

interface ReplacementBinding {
  requestId: string;
  devotionalId: string;
}

export function recordReplacedSeries(devotionalId: string, seenStateAt = '', chosenAt = new Date().toISOString()): void {
  mmkvStorage.setItem(REPLACED_SERIES_KEY, devotionalId);
  mmkvStorage.setItem(REPLACED_SERIES_STATE_KEY, seenStateAt);
  mmkvStorage.setItem(REPLACED_SERIES_CHOSEN_AT_KEY, chosenAt);
  mmkvStorage.removeItem(REPLACEMENT_SERIES_KEY);
}

/** Binds a pending replacement to the first series the server names for the current request. */
export function bindReplacementSeries(replacementId: string): void {
  const requestId = readInitialGenerationRequestId();
  if (!requestId || !readReplacedSeries() || readReplacementSeries()) return;
  const binding: ReplacementBinding = { requestId, devotionalId: replacementId };
  mmkvStorage.setItem(REPLACEMENT_SERIES_KEY, JSON.stringify(binding));
}

/** The bound replacement, while the request it was bound for is on its way. */
export function readReplacementSeries(): string | null {
  const stored = mmkvStorage.getItem(REPLACEMENT_SERIES_KEY) as string | null;
  if (!stored) return null;
  let binding: Partial<ReplacementBinding>;
  try {
    binding = JSON.parse(stored) as Partial<ReplacementBinding>;
  } catch {
    return null;
  }
  return binding.requestId && binding.devotionalId && isPendingRequest(binding.requestId) ? binding.devotionalId : null;
}

/**
 * The request is still on its way: stored, or answered by the in-flight job.
 * The record Start over leaves for an abandoned job carries no request.
 */
function isPendingRequest(requestId: string): boolean {
  return requestId === readInitialGenerationRequestId() || readInflightGenerationJob()?.requestId === requestId;
}

/** The lifecycle clock recorded with the choice, or null for an older build's record. */
export function readReplacedSeriesState(): string | null {
  const stored = mmkvStorage.getItem(REPLACED_SERIES_STATE_KEY) as string | null;
  return stored ?? null;
}

/** When the reader chose to replace the series, or null for an older build's record. */
export function readReplacedSeriesChosenAt(): string | null {
  const stored = mmkvStorage.getItem(REPLACED_SERIES_CHOSEN_AT_KEY) as string | null;
  return stored || null;
}

export function readReplacedSeries(): string | null {
  const stored = mmkvStorage.getItem(REPLACED_SERIES_KEY) as string | null;
  return stored || null;
}

export function clearReplacedSeries(): void {
  mmkvStorage.removeItem(REPLACED_SERIES_KEY);
  mmkvStorage.removeItem(REPLACED_SERIES_STATE_KEY);
  mmkvStorage.removeItem(REPLACED_SERIES_CHOSEN_AT_KEY);
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
