import { PRIMARY_BACKEND_URL, getAuthHeaders } from './api-config';
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

export async function pullDevotionalContent(devotionalId: string): Promise<PulledDevotionalContent> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/pull`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lastPulledAt: null }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Sync pull failed: ${response.status} ${body.slice(0, 120)}`);
  }

  const payload = await response.json() as SyncPullResponse;
  return extractPulledDevotionalContent(payload, devotionalId);
}
