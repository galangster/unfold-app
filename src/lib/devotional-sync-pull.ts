import * as Application from 'expo-application';

import { PRIMARY_BACKEND_URL, getAuthHeaders } from './api-config';
import {
  DEVOTIONAL_PULL_CURSOR_KEY,
  DEVOTIONAL_PULL_CURSOR_SCHEMA,
  buildNextDevotionalPullCursor,
  isValidTimestamp,
  parseDevotionalPullCursor,
  resolvePullCursor,
  serializeDevotionalPullCursor,
} from './devotional-pull-cursor';
import type { CommittedDevotionalPull, DevotionalPullCursor, DevotionalPullScope } from './devotional-pull-cursor';
import { logger } from './logger';
import { getDeviceId, mmkvStorage } from './mmkv-storage';
import { useUnfoldStore } from './store';
import type { Devotional, DevotionalDay } from './store';
import type { SyncPullResponse, SyncPulledRecord } from './sync-types';
import { normalizeWordStudy } from './word-study';

type PulledDevotionalMetadata = {
  id: string;
  title?: string;
  totalDays?: number;
  currentDay?: number;
  seriesArc?: Devotional['seriesArc'];
  // Calendar anchor for day gating; a missing value makes the reader's
  // tomorrow-lock fail closed. See devotional-day-access.getCalendarDayNumber.
  seriesStartDate?: string;
  updatedAt?: string;
};

export type PulledDevotionalContent = {
  devotional?: PulledDevotionalMetadata;
  days: DevotionalDay[];
  timestamp: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : undefined;
}

function mapPulledDevotionalDay(record: SyncPulledRecord): DevotionalDay | null {
  if (record.deleted) return null;

  const row = asRecord(record.data);
  const content = asRecord(row.content);
  const devotionalId = asString(row.devotionalId) ?? asString(content.devotionalId);
  const dayNumber = asNumber(row.dayNumber) ?? asNumber(content.dayNumber);

  if (!devotionalId || !dayNumber || dayNumber < 1) return null;

  const title = asString(row.title) ?? asString(content.title);
  const scriptureReference = asString(row.scriptureReference) ?? asString(content.scriptureReference);
  const scriptureText = asString(row.scriptureText) ?? asString(content.scriptureText);
  const bodyText = asString(row.bodyText) ?? asString(content.bodyText);
  const quotableLine = asString(row.quotableLine) ?? asString(content.quotableLine);

  if (!title || !scriptureReference || !scriptureText || !bodyText || !quotableLine) {
    return null;
  }

  const quotes = Array.isArray(content.quotes) ? content.quotes as DevotionalDay['quotes'] : undefined;
  const crossReferences = Array.isArray(content.crossReferences) ? content.crossReferences as DevotionalDay['crossReferences'] : undefined;
  const wordStudy = normalizeWordStudy(content.wordStudy);

  return {
    ...content,
    id: asString(row.id) ?? asString(content.id) ?? record.id,
    devotionalId,
    dayNumber,
    title,
    scriptureReference,
    scriptureText,
    bodyText,
    quotableLine,
    isRead: asBoolean(row.isRead) ?? asBoolean(content.isRead) ?? false,
    readAt: asString(row.readAt) ?? asString(content.readAt),
    isRevealed: asBoolean(content.isRevealed),
    quotes,
    crossReferences,
    reflectionQuestions: asStringArray(content.reflectionQuestions),
    contextNote: asString(content.contextNote),
    wordStudy,
    closingPrayer: asString(content.closingPrayer),
    act: asString(content.act),
    carryLine: asString(content.carryLine),
    checkInQuestion: asString(content.checkInQuestion),
    checkInChips: asStringArray(content.checkInChips),
    eveningScriptureRef: asString(content.eveningScriptureRef),
    studyMethod: asString(content.studyMethod),
    generatedAt: asString(content.generatedAt),
    contextSignals: asStringArray(content.contextSignals),
    storyId: asString(content.storyId),
    seriesReflectionSummary: asString(content.seriesReflectionSummary),
    closureArchetype: asString(content.closureArchetype),
    updatedAt: record.updatedAt,
  };
}

function mapPulledDevotionalMetadata(record: SyncPulledRecord): PulledDevotionalMetadata | null {
  if (record.deleted) return null;
  const data = asRecord(record.data);
  const seriesArc = asRecord(data.seriesArc);
  return {
    id: record.id,
    title: asString(data.title),
    totalDays: asNumber(data.totalDays),
    currentDay: asNumber(data.currentDay),
    seriesArc: seriesArc as unknown as Devotional['seriesArc'] | undefined,
    seriesStartDate: asString(data.seriesStartDate),
    updatedAt: record.updatedAt,
  };
}

export function extractPulledDevotionalContent(
  payload: SyncPullResponse,
  devotionalId: string,
): PulledDevotionalContent {
  const days = (payload.changes.devotional_days ?? [])
    .map(mapPulledDevotionalDay)
    .filter((day): day is DevotionalDay => !!day && day.devotionalId === devotionalId)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const devotional = (payload.changes.devotionals ?? [])
    .map(mapPulledDevotionalMetadata)
    .find((candidate): candidate is PulledDevotionalMetadata => !!candidate && candidate.id === devotionalId);

  return {
    devotional,
    days,
    timestamp: payload.timestamp,
  };
}

export type PullDevotionalContentOptions = {
  /**
   * Request the whole dataset regardless of the stored cursor. Used by the
   * reader's missing-day recovery, where the cheapest correct answer is to
   * distrust the cursor.
   */
  forceFull?: boolean;
};

/**
 * Cursor waiting for the caller to apply the content it belongs to. Keyed by
 * the returned object so a cursor can only ever be committed for content
 * that was actually produced by a pull — and only after the caller applied it
 * (a cancelled or failed apply never advances the cursor).
 */
const pendingCursors = new WeakMap<PulledDevotionalContent, CommittedDevotionalPull>();

function readStoredDevotionalPullCursor(): DevotionalPullCursor | null {
  const raw = mmkvStorage.getItem(DEVOTIONAL_PULL_CURSOR_KEY);
  return parseDevotionalPullCursor(raw instanceof Promise ? null : raw);
}

/**
 * Fingerprint of everything that could change how pulled rows are mapped or
 * stored. A change invalidates the cursor so the next pull is full.
 */
export function getDevotionalPullVersionMarker(): string {
  const appVersion = Application.nativeApplicationVersion ?? 'unknown';
  const buildVersion = Application.nativeBuildVersion ?? 'unknown';
  const persistVersion = useUnfoldStore.persist?.getOptions?.().version ?? 0;
  return `app:${appVersion}+${buildVersion}|store:v${persistVersion}|cursor:v${DEVOTIONAL_PULL_CURSOR_SCHEMA}`;
}

function currentDevotionalPullScope(devotionalId: string): DevotionalPullScope {
  return {
    deviceId: getDeviceId(),
    devotionalId,
    versionMarker: getDevotionalPullVersionMarker(),
  };
}

function hasLocalDevotionalContent(devotionalId: string): boolean {
  const local = useUnfoldStore.getState().devotionals.find((devotional) => devotional.id === devotionalId);
  return !!local && local.days.length > 0;
}

/**
 * Pull the devotional's rows from `/api/sync/pull`.
 *
 * Incremental by default: sends the server timestamp persisted by the last
 * committed pull, falling back to a full pull whenever the cursor cannot be
 * trusted (see `resolvePullCursor`). The returned content must be applied by
 * the caller and then handed to `commitDevotionalPullCursor` — the cursor
 * only advances once the content is actually in the store.
 */
export async function pullDevotionalContent(
  devotionalId: string,
  options: PullDevotionalContentOptions = {},
): Promise<PulledDevotionalContent> {
  const scope = currentDevotionalPullScope(devotionalId);
  const startedAt = Date.now();
  const decision = resolvePullCursor({
    cursor: readStoredDevotionalPullCursor(),
    scope,
    now: startedAt,
    forceFull: options.forceFull,
    hasLocalContent: hasLocalDevotionalContent(devotionalId),
  });

  logger.log(
    decision.mode === 'incremental'
      ? `[sync/devotional-pull] pull: incremental since ${decision.lastPulledAt}`
      : `[sync/devotional-pull] pull: full (${decision.reason})`,
  );

  const headers = await getAuthHeaders();
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/pull`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lastPulledAt: decision.lastPulledAt }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // The body stays out of the Error message: a captured exception's `value`
    // is allowlisted through to Sentry, and a backend error body can quote the
    // devotional or journal text it failed on. `logger` is __DEV__-only.
    logger.warn('[sync/devotional-pull] pull failed', response.status, body.slice(0, 120));
    throw new Error(`Sync pull failed: ${response.status}`);
  }

  const payload = await response.json() as SyncPullResponse;
  const pulled = extractPulledDevotionalContent(payload, devotionalId);

  if (isValidTimestamp(payload.timestamp)) {
    pendingCursors.set(pulled, { scope, mode: decision.mode, timestamp: payload.timestamp, startedAt });
  } else {
    logger.warn('[sync/devotional-pull] response has no server timestamp; cursor will not advance');
  }

  return pulled;
}

/**
 * Persist the cursor for content returned by `pullDevotionalContent` — call
 * only after the content has been applied. No-op (returns false) for content
 * that did not come from a pull, for a response without a server timestamp,
 * or for a delta whose baseline record disappeared mid-flight.
 */
export function commitDevotionalPullCursor(pulled: PulledDevotionalContent): boolean {
  const committed = pendingCursors.get(pulled);
  if (!committed) return false;
  pendingCursors.delete(pulled);

  const next = buildNextDevotionalPullCursor(readStoredDevotionalPullCursor(), committed);
  if (!next) return false;

  mmkvStorage.setItem(DEVOTIONAL_PULL_CURSOR_KEY, serializeDevotionalPullCursor(next));
  return true;
}
