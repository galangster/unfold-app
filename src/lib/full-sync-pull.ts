import NetInfo from '@react-native-community/netinfo';

import { getAuthHeaders, PRIMARY_BACKEND_URL } from './api-config';
import { mmkvStorage } from './mmkv-storage';
import { logger } from './logger';
import { useUnfoldStore } from './store';
import { peekSyncOutbox } from './sync-outbox';
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
import type { SyncPullResponse, SyncPulledRecord, SyncTable } from './sync-types';

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

type PendingClientUpdatedAtByRecord = Map<string, string>;

function pendingKey(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

function pendingClientUpdatedAtsByRecord(): PendingClientUpdatedAtByRecord {
  const pending = new Map<string, string>();
  for (const change of peekSyncOutbox()) {
    const key = pendingKey(change.table, change.id);
    const existing = pending.get(key);
    if (!existing || change.clientUpdatedAt > existing) {
      pending.set(key, change.clientUpdatedAt);
    }
  }
  return pending;
}

function recordClientUpdatedAt(record: SyncPulledRecord): string | undefined {
  return asString(asRecord(record.data).clientUpdatedAt);
}

function recordUpdatedAt(record: SyncPulledRecord): string {
  return recordClientUpdatedAt(record) ?? record.updatedAt;
}

function localUpdatedAt(value: { updatedAt?: string; createdAt?: string } | undefined): string | undefined {
  return value?.updatedAt ?? value?.createdAt;
}

function shouldApply(
  record: SyncPulledRecord,
  current: { updatedAt?: string; createdAt?: string } | undefined,
  table: SyncTable,
  pendingClientUpdatedAtByRecord: PendingClientUpdatedAtByRecord,
): boolean {
  const pendingClientUpdatedAt = pendingClientUpdatedAtByRecord.get(pendingKey(table, record.id));
  const remoteClientUpdatedAt = recordClientUpdatedAt(record);
  if (pendingClientUpdatedAt && (!remoteClientUpdatedAt || pendingClientUpdatedAt > remoteClientUpdatedAt)) {
    return false;
  }
  const currentUpdatedAt = localUpdatedAt(current);
  return !currentUpdatedAt || recordUpdatedAt(record) > currentUpdatedAt;
}

function upsertRecord<T extends { id?: string; updatedAt?: string; createdAt?: string }>(
  items: T[],
  record: SyncPulledRecord,
  table: SyncTable,
  pendingClientUpdatedAtByRecord: PendingClientUpdatedAtByRecord,
  mapper: (record: SyncPulledRecord) => T | null
): T[] {
  const existing = items.find((item) => item.id === record.id);
  if (!shouldApply(record, existing, table, pendingClientUpdatedAtByRecord)) return items;
  if (record.deleted) return items.filter((item) => item.id !== record.id);
  const mapped = mapper(record);
  if (!mapped) return items;
  const mappedId = mapped.id;
  if (!mappedId) return items;
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
    createdAt: asString(row.createdAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    savedAt: asString(row.savedAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    createdAt: asString(row.createdAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    createdAt: asString(row.createdAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    lastReadAt: asString(row.lastReadAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    createdAt: asString(row.createdAt) ?? recordUpdatedAt(record),
    timeOfDay: (asString(row.timeOfDay) ?? 'companion') as CheckIn['timeOfDay'],
    updatedAt: recordUpdatedAt(record),
  };
}

function mapNote(record: SyncPulledRecord): Note | null {
  const row = asRecord(record.data);
  return {
    id: record.id,
    title: asString(row.title) ?? '',
    content: asString(row.content) ?? '',
    createdAt: asString(row.createdAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    createdAt: asString(row.createdAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    usedAt: asString(row.usedAt) ?? recordUpdatedAt(record),
    devotionalId,
    updatedAt: recordUpdatedAt(record),
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
    createdAt: asString(row.createdAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
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
    usedAt: asString(row.usedAt) ?? recordUpdatedAt(record),
    updatedAt: recordUpdatedAt(record),
  };
}

function mapDevotional(record: SyncPulledRecord, current?: Devotional): Devotional | null {
  const row = asRecord(record.data);
  const now = recordUpdatedAt(record);
  // Calendar anchor for day gating. If this is ever undefined,
  // getCalendarDayNumber() returns null and isCurrentDayAfterCalendarDay()
  // fails CLOSED — pinning the reader to whatever day was read today and
  // locking catch-up users out of days they are entitled to. Prefer the
  // server's value, then whatever we already had, then the creation date.
  const syncedSeriesStartDate = asString(row.seriesStartDate);

  if (current) {
    return {
      ...current,
      title: asString(row.title) ?? current.title,
      totalDays: asNumber(row.totalDays) ?? current.totalDays,
      currentDay: asNumber(row.currentDay) ?? current.currentDay,
      seriesArc: row.seriesArc ? asRecord(row.seriesArc) as unknown as Devotional['seriesArc'] : current.seriesArc,
      seriesStartDate:
        syncedSeriesStartDate ?? current.seriesStartDate ?? current.createdAt,
      archivedAt: 'archivedAt' in row ? asString(row.archivedAt) : current.archivedAt,
      updatedAt: now,
    };
  }

  const createdAt = asString(row.createdAt) ?? now;

  return {
    id: record.id,
    title: asString(row.title) ?? 'Restored devotional',
    totalDays: asNumber(row.totalDays) ?? 1,
    currentDay: asNumber(row.currentDay) ?? 1,
    days: [],
    createdAt,
    seriesStartDate: syncedSeriesStartDate ?? createdAt,
    archivedAt: asString(row.archivedAt),
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
    updatedAt: recordUpdatedAt(record),
  } as DevotionalDay;
}

function mapConversation(record: SyncPulledRecord, current?: Conversation): Conversation | null {
  const row = asRecord(record.data);
  const lastMessageAt = Date.parse(asString(row.lastMessageAt) ?? recordUpdatedAt(record));
  return {
    id: record.id,
    messages: current?.messages ?? [],
    createdAt: Date.parse(asString(row.createdAt) ?? recordUpdatedAt(record)),
    lastMessageAt: Number.isFinite(lastMessageAt) ? lastMessageAt : Date.now(),
    title: asString(row.summary) ?? current?.title ?? null,
    topicTags: asArray<string>(row.topicTags),
    archived: asBoolean(row.archived) ?? current?.archived ?? false,
    pinned: current?.pinned,
    updatedAt: recordUpdatedAt(record),
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
    timestamp: Date.parse(asString(row.timestamp) ?? recordUpdatedAt(record)),
    status: (asString(row.status) ?? 'complete') as CompanionMessage['status'],
    citations: asArray(row.citations) as CompanionMessage['citations'],
    suggestions: asArray<string>(row.suggestions),
    feedback: (asString(row.feedback) as CompanionMessage['feedback']) ?? null,
    deepLinks: asArray(row.deepLinks) as CompanionMessage['deepLinks'],
    updatedAt: recordUpdatedAt(record),
  };
}

function applyMainStoreChanges(payload: SyncPullResponse): void {
  const changes = payload.changes;
  const pendingByRecord = pendingClientUpdatedAtsByRecord();
  useUnfoldStore.setState((state) => {
    let devotionals = state.devotionals;
    for (const record of changes.devotionals ?? []) {
      if (record.deleted) {
        devotionals = devotionals.filter((item) => item.id !== record.id);
        continue;
      }
      const current = devotionals.find((item) => item.id === record.id);
      if (!shouldApply(record, current, 'devotionals', pendingByRecord)) continue;
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
        if (!shouldApply(record, existing, 'devotional_days', pendingByRecord)) return devotional;
        const days = existing
          ? devotional.days.map((item) => (item.id === existing.id || item.dayNumber === day.dayNumber ? day : item))
          : [...devotional.days, day];
        return { ...devotional, days: days.sort((a, b) => a.dayNumber - b.dayNumber), updatedAt: record.updatedAt };
      });
    }

    return {
      devotionals,
      journalEntries: (changes.journal_entries ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'journal_entries', pendingByRecord, mapJournalEntry),
        state.journalEntries
      ),
      bookmarks: (changes.bookmarks ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'bookmarks', pendingByRecord, mapBookmark),
        state.bookmarks
      ),
      highlights: (changes.highlights ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'highlights', pendingByRecord, mapHighlight),
        state.highlights
      ),
      bibleHighlights: (changes.bible_highlights ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'bible_highlights', pendingByRecord, mapBibleHighlight),
        state.bibleHighlights
      ),
      bibleReadingHistory: (changes.bible_reading_positions ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'bible_reading_positions', pendingByRecord, mapBibleReadingPosition),
        state.bibleReadingHistory
      ),
      checkIns: (changes.check_ins ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'check_ins', pendingByRecord, mapCheckIn),
        state.checkIns
      ),
      notes: (changes.notes ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'notes', pendingByRecord, mapNote),
        state.notes
      ),
      folders: (changes.note_folders ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'note_folders', pendingByRecord, mapNoteFolder),
        state.folders
      ),
      usedScriptures: (changes.used_scriptures ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'used_scriptures', pendingByRecord, mapUsedScripture),
        state.usedScriptures
      ),
      seriesPersonaHistory: (changes.series_persona_history ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'series_persona_history', pendingByRecord, mapSeriesPersona),
        state.seriesPersonaHistory
      ),
      methodUsageHistory: (changes.method_usage_history ?? []).reduce(
        (items, record) => upsertRecord(items, record, 'method_usage_history', pendingByRecord, mapMethodUsage),
        state.methodUsageHistory
      ),
    };
  });
}

function applyCompanionChanges(payload: SyncPullResponse): void {
  const { companion_conversations: conversationRecords = [], companion_messages: messageRecords = [] } = payload.changes;
  if (conversationRecords.length === 0 && messageRecords.length === 0) return;
  const pendingByRecord = pendingClientUpdatedAtsByRecord();

  useCompanionChatStore.setState((state) => {
    let conversations = state.conversations;

    for (const record of conversationRecords) {
      if (record.deleted) {
        conversations = conversations.filter((item) => item.id !== record.id);
        continue;
      }
      const current = conversations.find((item) => item.id === record.id);
      // Conversation.createdAt is a number timestamp — narrow to the string
      // updatedAt the LWW compare understands (the old inline compare did too).
      if (!shouldApply(record, current ? { updatedAt: current.updatedAt } : undefined, 'companion_conversations', pendingByRecord)) continue;
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
        if (!shouldApply(record, existing, 'companion_messages', pendingByRecord)) return conversation;
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
