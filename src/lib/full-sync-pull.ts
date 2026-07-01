import NetInfo from '@react-native-community/netinfo';

import { getAuthHeaders, PRIMARY_BACKEND_URL } from './api-config';
import { mmkvStorage } from './mmkv-storage';
import { logger } from './logger';
import { useUnfoldStore } from './store';
import type {
  BibleHighlight,
  BibleReadingPosition,
  Bookmark,
  CheckIn,
  Devotional,
  DevotionalDay,
  Highlight,
  JournalEntry,
  MethodUsageRecord,
  Note,
  NoteFolder,
  SeriesPersonaRecord,
  UsedScripture,
} from './store';
import { useCompanionChatStore } from './companion-chat-store';
import type { CompanionMessage, Conversation } from './companion-chat-store';
import type { SyncPullResponse, SyncPulledRecord } from './sync-types';

export const LAST_PULLED_AT_KEY = 'unfold-last-pulled-at';

type PullAllUserDataOptions = {
  /** Force a first-sync style restore. Normal app-start pulls should stay incremental. */
  full?: boolean;
};

function syncGet(key: string): string | null {
  const value = mmkvStorage.getItem(key);
  return value instanceof Promise ? null : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function recordUpdatedAt(record: SyncPulledRecord): string {
  return record.updatedAt;
}

function localUpdatedAt(value: { updatedAt?: string; createdAt?: string } | undefined): string | undefined {
  return value?.updatedAt ?? value?.createdAt;
}

function shouldApply(record: SyncPulledRecord, current?: { updatedAt?: string; createdAt?: string }): boolean {
  const currentUpdatedAt = localUpdatedAt(current);
  return !currentUpdatedAt || recordUpdatedAt(record) > currentUpdatedAt;
}

function upsertRecord<T extends { id?: string; updatedAt?: string; createdAt?: string }>(
  items: T[],
  record: SyncPulledRecord,
  mapper: (record: SyncPulledRecord) => T | null
): T[] {
  if (record.deleted) return items.filter((item) => item.id !== record.id);
  const mapped = mapper(record);
  if (!mapped) return items;
  const mappedId = mapped.id;
  if (!mappedId) return items;
  const existing = items.find((item) => item.id === mappedId);
  if (!shouldApply(record, existing)) return items;
  return existing
    ? items.map((item) => (item.id === mappedId ? mapped : item))
    : [mapped, ...items];
}

function mapJournalEntry(record: SyncPulledRecord): JournalEntry | null {
  const row = asRecord(record.data);
  const devotionalId = asString(row.devotionalId);
  const dayNumber = asNumber(row.dayNumber);
  const content = asString(row.content) ?? '';
  if (!devotionalId || !dayNumber) return null;
  return {
    id: record.id,
    devotionalId,
    dayNumber,
    content,
    createdAt: asString(row.createdAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
    journalMode: asString(row.journalMode) as JournalEntry['journalMode'],
    soapResponses: asRecord(row.soapResponses) as unknown as JournalEntry['soapResponses'],
    prayerRequests: asArray(row.prayerRequests) as JournalEntry['prayerRequests'],
    questionResponses: asArray(row.questionResponses) as JournalEntry['questionResponses'],
    deeperQuestions: asArray<string>(row.deeperQuestions),
  };
}

function mapBookmark(record: SyncPulledRecord): Bookmark | null {
  const row = asRecord(record.data);
  const devotionalId = asString(row.devotionalId);
  const dayNumber = asNumber(row.dayNumber);
  if (!devotionalId || !dayNumber) return null;
  return {
    id: record.id,
    devotionalId,
    devotionalTitle: asString(row.devotionalTitle) ?? '',
    dayNumber,
    dayTitle: asString(row.dayTitle) ?? '',
    scriptureReference: asString(row.scriptureReference) ?? '',
    scriptureText: asString(row.scriptureText) ?? '',
    savedAt: asString(row.savedAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
  };
}

function mapHighlight(record: SyncPulledRecord): Highlight | null {
  const row = asRecord(record.data);
  const devotionalId = asString(row.devotionalId);
  const dayNumber = asNumber(row.dayNumber);
  const highlightedText = asString(row.highlightedText);
  if (!devotionalId || !dayNumber || !highlightedText) return null;
  return {
    id: record.id,
    devotionalId,
    devotionalTitle: asString(row.devotionalTitle) ?? '',
    dayNumber,
    dayTitle: asString(row.dayTitle) ?? '',
    highlightedText,
    serializedRange: asString(row.serializedRange),
    color: asString(row.color) as Highlight['color'],
    contextBefore: asString(row.contextBefore),
    contextAfter: asString(row.contextAfter),
    createdAt: asString(row.createdAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
  };
}

function mapBibleHighlight(record: SyncPulledRecord): BibleHighlight | null {
  const row = asRecord(record.data);
  const bookId = asNumber(row.bookId);
  const chapter = asNumber(row.chapter);
  const verseStart = asNumber(row.verseStart);
  const verseEnd = asNumber(row.verseEnd) ?? verseStart;
  if (!bookId || !chapter || !verseStart || !verseEnd) return null;
  return {
    id: record.id,
    bookId,
    bookName: asString(row.bookName) ?? '',
    chapter,
    verseStart,
    verseEnd,
    text: asString(row.text) ?? '',
    color: (row.color === null ? null : asString(row.color) ?? null) as BibleHighlight['color'],
    note: asString(row.note),
    translation: asString(row.translation) ?? 'BSB',
    createdAt: asString(row.createdAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
  };
}

function mapBibleReadingPosition(record: SyncPulledRecord): BibleReadingPosition | null {
  const row = asRecord(record.data);
  const bookId = asNumber(row.bookId);
  const chapter = asNumber(row.chapter);
  if (!bookId || !chapter) return null;
  return {
    id: record.id,
    bookId,
    bookName: asString(row.bookName) ?? '',
    chapter,
    translation: asString(row.translation) ?? 'BSB',
    lastReadAt: asString(row.lastReadAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
  };
}

function mapCheckIn(record: SyncPulledRecord): CheckIn | null {
  const row = asRecord(record.data);
  const devotionalId = asString(row.devotionalId);
  const dayNumber = asNumber(row.dayNumber);
  const mood = asNumber(row.mood) as CheckIn['mood'] | undefined;
  if (!devotionalId || !dayNumber || !mood) return null;
  return {
    id: record.id,
    devotionalId,
    dayNumber,
    mood,
    moodLabel: asString(row.moodLabel) ?? '',
    chipAnswer: asString(row.chipAnswer),
    freeText: asString(row.freeText),
    createdAt: asString(row.createdAt) ?? record.updatedAt,
    timeOfDay: (asString(row.timeOfDay) ?? 'companion') as CheckIn['timeOfDay'],
    updatedAt: record.updatedAt,
  };
}

function mapNote(record: SyncPulledRecord): Note | null {
  const row = asRecord(record.data);
  return {
    id: record.id,
    title: asString(row.title) ?? '',
    content: asString(row.content) ?? '',
    createdAt: asString(row.createdAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
    category: (asString(row.category) ?? 'general') as Note['category'],
    tags: asArray<string>(row.tags),
    isFavorite: asBoolean(row.isFavorite) ?? false,
    scriptureRefs: asArray(row.scriptureRefs) as Note['scriptureRefs'],
    devotionalId: asString(row.devotionalId),
    dayNumber: asNumber(row.dayNumber),
    bibleBookId: asNumber(row.bibleBookId),
    bibleChapter: asNumber(row.bibleChapter),
    folderId: asString(row.folderId),
  };
}

function mapNoteFolder(record: SyncPulledRecord): NoteFolder | null {
  const row = asRecord(record.data);
  return {
    id: record.id,
    name: asString(row.name) ?? '',
    color: asString(row.color),
    parentId: asString(row.parentId),
    sortOrder: asNumber(row.sortOrder) ?? 0,
    createdAt: asString(row.createdAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
  };
}

function mapUsedScripture(record: SyncPulledRecord): UsedScripture | null {
  const row = asRecord(record.data);
  const reference = asString(row.reference);
  const devotionalId = asString(row.devotionalId);
  if (!reference || !devotionalId) return null;
  return {
    id: record.id,
    reference,
    book: asString(row.book) ?? '',
    usedAt: asString(row.usedAt) ?? record.updatedAt,
    devotionalId,
    updatedAt: record.updatedAt,
  };
}

function mapSeriesPersona(record: SyncPulledRecord): SeriesPersonaRecord | null {
  const row = asRecord(record.data);
  const devotionalId = asString(row.devotionalId);
  if (!devotionalId) return null;
  return {
    id: record.id,
    devotionalId,
    primaryTrait: asString(row.primaryTrait) ?? '',
    secondaryTrait: asString(row.secondaryTrait) ?? '',
    templateSeed: asNumber(row.templateSeed) ?? 0,
    createdAt: asString(row.createdAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
  };
}

function mapMethodUsage(record: SyncPulledRecord): MethodUsageRecord | null {
  const row = asRecord(record.data);
  const methodId = asString(row.methodId);
  const devotionalId = asString(row.devotionalId);
  const dayNumber = asNumber(row.dayNumber);
  if (!methodId || !devotionalId || !dayNumber) return null;
  return {
    id: record.id,
    methodId,
    devotionalId,
    dayNumber,
    usedAt: asString(row.usedAt) ?? record.updatedAt,
    updatedAt: record.updatedAt,
  };
}

function mapDevotional(record: SyncPulledRecord, current?: Devotional): Devotional | null {
  const row = asRecord(record.data);
  const now = record.updatedAt;
  if (current) {
    return {
      ...current,
      title: asString(row.title) ?? current.title,
      totalDays: asNumber(row.totalDays) ?? current.totalDays,
      currentDay: asNumber(row.currentDay) ?? current.currentDay,
      seriesArc: row.seriesArc ? asRecord(row.seriesArc) as unknown as Devotional['seriesArc'] : current.seriesArc,
      updatedAt: now,
    };
  }

  return {
    id: record.id,
    title: asString(row.title) ?? 'Restored devotional',
    totalDays: asNumber(row.totalDays) ?? 1,
    currentDay: asNumber(row.currentDay) ?? 1,
    days: [],
    createdAt: asString(row.createdAt) ?? now,
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    seriesArc: asRecord(row.seriesArc) as unknown as Devotional['seriesArc'],
    progressiveMemory: asRecord(row.progressiveMemory) as unknown as Devotional['progressiveMemory'],
    generationMode: (asString(row.generationMode) ?? 'progressive') as Devotional['generationMode'],
    updatedAt: now,
  };
}

function mapDevotionalDay(record: SyncPulledRecord): DevotionalDay | null {
  const row = asRecord(record.data);
  const content = asRecord(row.content);
  const devotionalId = asString(row.devotionalId) ?? asString(content.devotionalId);
  const dayNumber = asNumber(row.dayNumber) ?? asNumber(content.dayNumber);
  const title = asString(row.title) ?? asString(content.title);
  const scriptureReference = asString(row.scriptureReference) ?? asString(content.scriptureReference);
  const scriptureText = asString(row.scriptureText) ?? asString(content.scriptureText);
  const bodyText = asString(row.bodyText) ?? asString(content.bodyText);
  const quotableLine = asString(row.quotableLine) ?? asString(content.quotableLine);
  if (!devotionalId || !dayNumber || !title || !scriptureReference || !scriptureText || !bodyText || !quotableLine) return null;

  return {
    ...content,
    id: record.id,
    devotionalId,
    dayNumber,
    title,
    scriptureReference,
    scriptureText,
    bodyText,
    quotableLine,
    isRead: asBoolean(row.isRead) ?? asBoolean(content.isRead) ?? false,
    readAt: asString(row.readAt) ?? asString(content.readAt),
    updatedAt: record.updatedAt,
  } as DevotionalDay;
}

function mapConversation(record: SyncPulledRecord, current?: Conversation): Conversation | null {
  const row = asRecord(record.data);
  const lastMessageAt = Date.parse(asString(row.lastMessageAt) ?? record.updatedAt);
  return {
    id: record.id,
    messages: current?.messages ?? [],
    createdAt: Date.parse(asString(row.createdAt) ?? record.updatedAt),
    lastMessageAt: Number.isFinite(lastMessageAt) ? lastMessageAt : Date.now(),
    title: asString(row.summary) ?? current?.title ?? null,
    topicTags: asArray<string>(row.topicTags),
    archived: asBoolean(row.archived) ?? current?.archived ?? false,
    pinned: current?.pinned,
    updatedAt: record.updatedAt,
  };
}

function mapMessage(record: SyncPulledRecord): (CompanionMessage & { conversationId: string }) | null {
  const row = asRecord(record.data);
  const conversationId = asString(row.conversationId);
  if (!conversationId) return null;
  return {
    id: record.id,
    conversationId,
    role: (asString(row.role) === 'user' ? 'user' : 'companion'),
    content: asString(row.content) ?? '',
    timestamp: Date.parse(asString(row.timestamp) ?? record.updatedAt),
    status: (asString(row.status) ?? 'complete') as CompanionMessage['status'],
    citations: asArray(row.citations) as CompanionMessage['citations'],
    suggestions: asArray<string>(row.suggestions),
    feedback: (asString(row.feedback) as CompanionMessage['feedback']) ?? null,
    deepLinks: asArray(row.deepLinks) as CompanionMessage['deepLinks'],
    updatedAt: record.updatedAt,
  };
}

function applyMainStoreChanges(payload: SyncPullResponse): void {
  const changes = payload.changes;
  useUnfoldStore.setState((state) => {
    let devotionals = state.devotionals;
    for (const record of changes.devotionals ?? []) {
      if (record.deleted) {
        devotionals = devotionals.filter((item) => item.id !== record.id);
        continue;
      }
      const current = devotionals.find((item) => item.id === record.id);
      if (!shouldApply(record, current)) continue;
      const mapped = mapDevotional(record, current);
      if (!mapped) continue;
      devotionals = current
        ? devotionals.map((item) => (item.id === record.id ? mapped : item))
        : [mapped, ...devotionals];
    }

    for (const record of changes.devotional_days ?? []) {
      const day = mapDevotionalDay(record);
      const devotionalId = day?.devotionalId ?? asString(asRecord(record.data).devotionalId);
      if (!devotionalId) continue;
      devotionals = devotionals.map((devotional) => {
        if (devotional.id !== devotionalId) return devotional;
        if (record.deleted) return { ...devotional, days: devotional.days.filter((item) => item.id !== record.id) };
        if (!day) return devotional;
        const existing = devotional.days.find((item) => item.id === day.id || item.dayNumber === day.dayNumber);
        if (!shouldApply(record, existing)) return devotional;
        const days = existing
          ? devotional.days.map((item) => (item.id === existing.id || item.dayNumber === day.dayNumber ? day : item))
          : [...devotional.days, day];
        return { ...devotional, days: days.sort((a, b) => a.dayNumber - b.dayNumber), updatedAt: record.updatedAt };
      });
    }

    return {
      devotionals,
      journalEntries: (changes.journal_entries ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapJournalEntry),
        state.journalEntries
      ),
      bookmarks: (changes.bookmarks ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapBookmark),
        state.bookmarks
      ),
      highlights: (changes.highlights ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapHighlight),
        state.highlights
      ),
      bibleHighlights: (changes.bible_highlights ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapBibleHighlight),
        state.bibleHighlights
      ),
      bibleReadingHistory: (changes.bible_reading_positions ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapBibleReadingPosition),
        state.bibleReadingHistory
      ),
      checkIns: (changes.check_ins ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapCheckIn),
        state.checkIns
      ),
      notes: (changes.notes ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapNote),
        state.notes
      ),
      folders: (changes.note_folders ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapNoteFolder),
        state.folders
      ),
      usedScriptures: (changes.used_scriptures ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapUsedScripture),
        state.usedScriptures
      ),
      seriesPersonaHistory: (changes.series_persona_history ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapSeriesPersona),
        state.seriesPersonaHistory
      ),
      methodUsageHistory: (changes.method_usage_history ?? []).reduce(
        (items, record) => upsertRecord(items, record, mapMethodUsage),
        state.methodUsageHistory
      ),
    };
  });
}

function applyCompanionChanges(payload: SyncPullResponse): void {
  const { companion_conversations: conversationRecords = [], companion_messages: messageRecords = [] } = payload.changes;
  if (conversationRecords.length === 0 && messageRecords.length === 0) return;

  useCompanionChatStore.setState((state) => {
    let conversations = state.conversations;

    for (const record of conversationRecords) {
      if (record.deleted) {
        conversations = conversations.filter((item) => item.id !== record.id);
        continue;
      }
      const current = conversations.find((item) => item.id === record.id);
      if (current?.updatedAt && recordUpdatedAt(record) <= current.updatedAt) continue;
      const mapped = mapConversation(record, current);
      if (!mapped) continue;
      conversations = current
        ? conversations.map((item) => (item.id === record.id ? mapped : item))
        : [mapped, ...conversations];
    }

    for (const record of messageRecords) {
      const message = mapMessage(record);
      const conversationId = message?.conversationId ?? asString(asRecord(record.data).conversationId);
      if (!conversationId) continue;
      conversations = conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        if (record.deleted) return { ...conversation, messages: (conversation.messages ?? []).filter((item) => item.id !== record.id) };
        if (!message) return conversation;
        const { conversationId: _conversationId, ...cleanMessage } = message;
        const existing = (conversation.messages ?? []).find((item) => item.id === message.id);
        if (!shouldApply(record, existing)) return conversation;
        const messages = existing
          ? (conversation.messages ?? []).map((item) => (item.id === message.id ? cleanMessage : item))
          : [...(conversation.messages ?? []), cleanMessage];
        return { ...conversation, messages, lastMessageAt: Math.max(conversation.lastMessageAt, cleanMessage.timestamp), updatedAt: record.updatedAt };
      });
    }

    return { conversations };
  });
}

export function applyPulledUserData(payload: SyncPullResponse): void {
  applyMainStoreChanges(payload);
  applyCompanionChanges(payload);
}

export async function pullAllUserData(options: PullAllUserDataOptions = {}): Promise<SyncPullResponse> {
  const lastPulledAt = options.full ? null : syncGet(LAST_PULLED_AT_KEY);
  const headers = await getAuthHeaders();
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/pull`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lastPulledAt }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Sync pull failed: ${response.status} ${body.slice(0, 120)}`);
  }

  const payload = await response.json() as SyncPullResponse;
  applyPulledUserData(payload);
  mmkvStorage.setItem(LAST_PULLED_AT_KEY, payload.timestamp);
  return payload;
}

let pullInFlight: Promise<void> | null = null;

export function triggerUserDataPull(reason: string, options: PullAllUserDataOptions = {}): Promise<void> {
  if (pullInFlight) return pullInFlight;
  pullInFlight = pullAllUserData(options)
    .then((payload) => {
      logger.log(`[sync/pull-all] ${reason} applied timestamp=${payload.timestamp}`);
    })
    .catch((error) => {
      logger.warn(`[sync/pull-all] ${reason} failed`, error);
    })
    .finally(() => {
      pullInFlight = null;
    });
  return pullInFlight;
}

export function registerUserDataPullOnReconnect(): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void triggerUserDataPull('reconnect');
    }
  });
  return unsubscribe;
}
