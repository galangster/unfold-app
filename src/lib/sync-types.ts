// src/lib/sync-types.ts

/** Tables that participate in sync */
export type SyncTable =
  | 'users'
  | 'devotionals'
  | 'devotional_days'
  | 'journal_entries'
  | 'bookmarks'
  | 'highlights'
  | 'bible_highlights'
  | 'bible_reading_positions'
  | 'check_ins'
  | 'notes'
  | 'note_folders'
  | 'companion_conversations'
  | 'companion_messages'
  | 'used_scriptures'
  | 'series_persona_history'
  | 'method_usage_history';

/** A record that has been modified locally but not yet pushed to the server. */
export interface DirtyRecord {
  table: SyncTable;
  id: string;
  updatedAt: string; // ISO 8601
}

/** A change to push to the server. */
export interface SyncPushChange {
  table: SyncTable;
  id: string;
  data: Record<string, unknown>;
  clientUpdatedAt: string; // ISO 8601
  deleted: boolean;
}

/** Server response for a single pushed change. */
export interface SyncPushResult {
  table: SyncTable;
  id: string;
  serverUpdatedAt: string;
  status: 'accepted' | 'conflict';
  serverData?: Record<string, unknown>;
}

/** Server response for a pull request. */
export interface SyncPullResponse {
  changes: Partial<Record<SyncTable, SyncPulledRecord[]>>;
  timestamp: string; // Use as next lastPulledAt
}

export interface SyncPulledRecord {
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
  deleted: boolean;
}
