import { enqueueSyncChanges } from './sync-outbox';
import type {
  BibleHighlight,
  BibleReadingPosition,
  Bookmark,
  CheckIn,
  Highlight,
  JournalEntry,
  MethodUsageRecord,
  Note,
  NoteFolder,
  SeriesPersonaRecord,
  UsedScripture,
} from './store';
import type { Conversation, CompanionMessage } from './companion-chat-store';
import type { SyncPushChange, SyncTable } from './sync-types';

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

export function buildPersonalDataSyncChange(
  table: SyncTable,
  id: string,
  data: Record<string, unknown>,
  clientUpdatedAt: string,
  deleted = false
): SyncPushChange {
  return {
    table,
    id,
    data: deleted ? {} : compact(data),
    clientUpdatedAt,
    deleted,
  };
}

export function enqueuePersonalDataSyncChange(
  table: SyncTable,
  id: string,
  data: Record<string, unknown>,
  clientUpdatedAt = new Date().toISOString(),
  deleted = false
): void {
  enqueueSyncChanges([buildPersonalDataSyncChange(table, id, data, clientUpdatedAt, deleted)]);
}

export function journalEntrySyncData(entry: JournalEntry): Record<string, unknown> {
  return compact({
    devotionalId: entry.devotionalId,
    dayNumber: entry.dayNumber,
    content: entry.content,
    journalMode: entry.journalMode,
    soapResponses: entry.soapResponses,
    prayerRequests: entry.prayerRequests,
    questionResponses: entry.questionResponses,
    deeperQuestions: entry.deeperQuestions,
  });
}

export function bookmarkSyncData(bookmark: Bookmark): Record<string, unknown> {
  return compact({
    devotionalId: bookmark.devotionalId,
    devotionalTitle: bookmark.devotionalTitle,
    dayNumber: bookmark.dayNumber,
    dayTitle: bookmark.dayTitle,
    scriptureReference: bookmark.scriptureReference,
    scriptureText: bookmark.scriptureText,
    savedAt: bookmark.savedAt,
  });
}

export function devotionalHighlightSyncData(highlight: Highlight): Record<string, unknown> {
  return compact({
    devotionalId: highlight.devotionalId,
    devotionalTitle: highlight.devotionalTitle,
    dayNumber: highlight.dayNumber,
    dayTitle: highlight.dayTitle,
    highlightedText: highlight.highlightedText,
    serializedRange: highlight.serializedRange,
    color: highlight.color,
    contextBefore: highlight.contextBefore,
    contextAfter: highlight.contextAfter,
  });
}

export function bibleHighlightSyncData(highlight: BibleHighlight): Record<string, unknown> {
  return compact({
    bookId: highlight.bookId,
    bookName: highlight.bookName,
    chapter: highlight.chapter,
    verseStart: highlight.verseStart,
    verseEnd: highlight.verseEnd,
    text: highlight.text,
    color: highlight.color,
    note: highlight.note,
    translation: highlight.translation,
  });
}

export function bibleReadingPositionSyncData(position: BibleReadingPosition): Record<string, unknown> {
  return compact({
    bookId: position.bookId,
    bookName: position.bookName,
    chapter: position.chapter,
    translation: position.translation,
    lastReadAt: position.lastReadAt,
  });
}

export function checkInSyncData(checkIn: CheckIn): Record<string, unknown> {
  return compact({
    devotionalId: checkIn.devotionalId,
    dayNumber: checkIn.dayNumber,
    mood: checkIn.mood,
    moodLabel: checkIn.moodLabel,
    chipAnswer: checkIn.chipAnswer,
    freeText: checkIn.freeText,
    timeOfDay: checkIn.timeOfDay,
  });
}

export function noteSyncData(note: Note): Record<string, unknown> {
  return compact({
    title: note.title,
    content: note.content,
    category: note.category,
    tags: note.tags,
    isFavorite: note.isFavorite,
    scriptureRefs: note.scriptureRefs,
    devotionalId: note.devotionalId,
    dayNumber: note.dayNumber,
    bibleBookId: note.bibleBookId,
    bibleChapter: note.bibleChapter,
    folderId: note.folderId,
  });
}

export function noteFolderSyncData(folder: NoteFolder): Record<string, unknown> {
  return compact({
    name: folder.name,
    color: folder.color,
    parentId: folder.parentId,
    sortOrder: folder.sortOrder,
  });
}

export function usedScriptureSyncData(scripture: UsedScripture): Record<string, unknown> {
  return compact({
    reference: scripture.reference,
    book: scripture.book,
    usedAt: scripture.usedAt,
    devotionalId: scripture.devotionalId,
  });
}

export function seriesPersonaSyncData(record: SeriesPersonaRecord): Record<string, unknown> {
  return compact({
    devotionalId: record.devotionalId,
    primaryTrait: record.primaryTrait,
    secondaryTrait: record.secondaryTrait,
    templateSeed: record.templateSeed,
  });
}

export function methodUsageSyncData(record: MethodUsageRecord): Record<string, unknown> {
  return compact({
    methodId: record.methodId,
    devotionalId: record.devotionalId,
    dayNumber: record.dayNumber,
    usedAt: record.usedAt,
  });
}

export function companionConversationSyncData(conversation: Conversation): Record<string, unknown> {
  return compact({
    lastMessageAt: new Date(conversation.lastMessageAt).toISOString(),
    summary: conversation.title,
    topicTags: conversation.topicTags,
    archived: conversation.archived,
  });
}

export function companionMessageSyncData(message: CompanionMessage, conversationId: string): Record<string, unknown> {
  return compact({
    conversationId,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp).toISOString(),
    status: message.status,
    citations: message.citations,
    suggestions: message.suggestions,
    feedback: message.feedback,
    deepLinks: message.deepLinks,
    // Only ever true; `compact` drops it otherwise, so untouched rows are unchanged.
    interrupted: message.interrupted === true ? true : undefined,
  });
}
