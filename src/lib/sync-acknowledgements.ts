import type { SyncPushChange, SyncPushResult, SyncTable } from './sync-types';

const COMPOSITE_REMAP_TABLES: ReadonlySet<SyncTable> = new Set([
  'bible_reading_positions',
  'devotional_days',
]);

const KNOWN_STATUSES: ReadonlySet<SyncPushResult['status']> = new Set([
  'accepted',
  'conflict',
  'rejected',
]);

export type SyncAcknowledgementPair = {
  change: SyncPushChange;
  result: SyncPushResult;
};

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidTimestamp(value: unknown): value is string {
  return isNonemptyString(value) && Number.isFinite(Date.parse(value));
}

function isKnownStatus(value: unknown): value is SyncPushResult['status'] {
  return typeof value === 'string' && KNOWN_STATUSES.has(value as SyncPushResult['status']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasRequestedIdField(result: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(result, 'requestedId');
}

function asPartialResult(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function validateResult(raw: Record<string, unknown>): SyncPushResult | null {
  if (!isKnownStatus(raw.status) || !isNonemptyString(raw.table) || !isNonemptyString(raw.id) || !isValidTimestamp(raw.serverUpdatedAt)) {
    return null;
  }

  const result: SyncPushResult = {
    table: raw.table as SyncTable,
    id: raw.id,
    serverUpdatedAt: raw.serverUpdatedAt,
    status: raw.status,
  };
  if (typeof raw.reason === 'string') result.reason = raw.reason;
  if (isRecord(raw.serverData)) result.serverData = raw.serverData;
  if (isNonemptyString(raw.requestedId)) result.requestedId = raw.requestedId;
  return result;
}

export function syncSnapshotsEqual(left: SyncPushChange, right: SyncPushChange): boolean {
  return left.table === right.table
    && left.id === right.id
    && left.clientUpdatedAt === right.clientUpdatedAt
    && left.deleted === right.deleted
    && JSON.stringify(left.data) === JSON.stringify(right.data);
}

export function isValidConflictResult(result: SyncPushResult): boolean {
  return result.status === 'conflict' && isRecord(result.serverData);
}

export function acknowledgementResolvesChange(result: SyncPushResult): boolean {
  return result.status === 'accepted' || isValidConflictResult(result);
}

function submittedKey(table: string, id: string): string {
  return `${table}:${id}`;
}

function namesAnotherSubmittedRow(
  submitted: readonly SyncPushChange[],
  changeIndex: number,
  table: SyncTable,
  id: string,
): boolean {
  return submitted.some((change, index) => (
    index !== changeIndex && change.table === table && change.id === id
  ));
}

function identitySubmittedIndex(
  submitted: readonly SyncPushChange[],
  submittedByKey: ReadonlyMap<string, number>,
  raw: Record<string, unknown>,
  index: number,
): number | undefined {
  if (hasRequestedIdField(raw)) {
    if (!isNonemptyString(raw.requestedId) || !isNonemptyString(raw.table)) return undefined;
    return submittedByKey.get(submittedKey(raw.table, raw.requestedId));
  }
  if (index >= submitted.length) return undefined;
  return index;
}

function explicitValidatedPair(
  change: SyncPushChange,
  raw: Record<string, unknown>,
  validated: SyncPushResult | null,
): SyncAcknowledgementPair | null {
  if (!validated || !isNonemptyString(raw.requestedId)) return null;
  if (validated.id !== change.id && !COMPOSITE_REMAP_TABLES.has(change.table)) return null;
  return { change, result: validated };
}

function legacyValidatedPair(
  submitted: readonly SyncPushChange[],
  submittedIndex: number,
  validated: SyncPushResult | null,
): SyncAcknowledgementPair | null {
  if (!validated) return null;
  const change = submitted[submittedIndex];
  if (validated.table !== change.table) return null;
  if (validated.id !== change.id) {
    if (!COMPOSITE_REMAP_TABLES.has(change.table)) return null;
    if (namesAnotherSubmittedRow(submitted, submittedIndex, change.table, validated.id)) return null;
  }
  return { change, result: validated };
}

/**
 * Pair a submitted batch with push results. A longer response is malformed
 * and acknowledges nothing. Identity claims are counted before payload
 * validation, so a malformed duplicate cannot let another claim win.
 */
export function correlateSyncAcknowledgements(
  submitted: readonly SyncPushChange[],
  rawResults: readonly unknown[],
): SyncAcknowledgementPair[] {
  if (rawResults.length > submitted.length) return [];

  const submittedByKey = new Map<string, number>();
  submitted.forEach((change, index) => {
    submittedByKey.set(submittedKey(change.table, change.id), index);
  });

  const identityIndexes = rawResults.map((value, index) => {
    const raw = asPartialResult(value);
    return raw ? identitySubmittedIndex(submitted, submittedByKey, raw, index) : undefined;
  });

  const claimCounts = new Map<number, number>();
  for (const submittedIndex of identityIndexes) {
    if (submittedIndex === undefined) continue;
    claimCounts.set(submittedIndex, (claimCounts.get(submittedIndex) ?? 0) + 1);
  }

  const pairs: SyncAcknowledgementPair[] = [];
  rawResults.forEach((value, index) => {
    const submittedIndex = identityIndexes[index];
    if (submittedIndex === undefined || claimCounts.get(submittedIndex) !== 1) return;
    const raw = asPartialResult(value);
    if (!raw) return;
    const validated = validateResult(raw);
    const pair = hasRequestedIdField(raw)
      ? explicitValidatedPair(submitted[submittedIndex], raw, validated)
      : legacyValidatedPair(submitted, submittedIndex, validated);
    if (pair) pairs.push(pair);
  });
  return pairs;
}

export function resolvingAcknowledgementPairs(
  submitted: readonly SyncPushChange[],
  rawResults: readonly unknown[],
): SyncAcknowledgementPair[] {
  return correlateSyncAcknowledgements(submitted, rawResults)
    .filter((pair) => acknowledgementResolvesChange(pair.result));
}
