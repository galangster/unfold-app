// src/lib/sync-service.ts
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useUnfoldStore } from './store';
import { useCompanionChatStore } from './companion-chat-store';
import { mmkvStorage } from './mmkv-storage';
import { logger } from './logger';
import { PRIMARY_BACKEND_URL } from './api-config';
import { getClerkToken } from './clerk';
import type { SyncTable, DirtyRecord, SyncPushChange, SyncPullResponse } from './sync-types';

const SYNC_DIRTY_KEY = 'unfold-sync-dirty';
const SYNC_LAST_PULLED_KEY = 'unfold-sync-last-pulled';
const PUSH_INTERVAL_MS = 15_000;
const PULL_INTERVAL_MS = 15_000;

class SyncService {
  private dirtySet: Map<string, DirtyRecord> = new Map();
  private pushTimer: ReturnType<typeof setInterval> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private unsubscribeMain: (() => void) | null = null;
  private unsubscribeCompanion: (() => void) | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;
  private unsubscribeAppState: any = null;

  /** Start sync engine -- uses getClerkToken() from clerk.ts for auth */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load persisted dirty set
    this.loadDirtySet();

    // Subscribe to store changes
    this.unsubscribeMain = useUnfoldStore.subscribe(
      (state, prevState) => this.onMainStoreChange(state, prevState)
    );
    this.unsubscribeCompanion = useCompanionChatStore.subscribe(
      (state, prevState) => this.onCompanionStoreChange(state, prevState)
    );

    // Start push/pull timers
    this.pushTimer = setInterval(() => this.push(), PUSH_INTERVAL_MS);
    this.pullTimer = setInterval(() => this.pull(), PULL_INTERVAL_MS);

    // Foreground: immediate pull
    this.unsubscribeAppState = AppState.addEventListener('change', this.onAppStateChange);

    // Connectivity restored: immediate push + pull
    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        this.push();
        this.pull();
      }
    });

    // Initial pull on start
    this.pull();

    logger.log('[sync] SyncService started');
  }

  stop() {
    this.isRunning = false;
    if (this.pushTimer) clearInterval(this.pushTimer);
    if (this.pullTimer) clearInterval(this.pullTimer);
    this.pushTimer = null;
    this.pullTimer = null;
    this.unsubscribeMain?.();
    this.unsubscribeCompanion?.();
    this.unsubscribeNetInfo?.();
    this.unsubscribeAppState?.remove();
    this.unsubscribeMain = null;
    this.unsubscribeCompanion = null;
    this.unsubscribeNetInfo = null;
    this.unsubscribeAppState = null;
    logger.log('[sync] SyncService stopped');
  }

  private onAppStateChange = (state: AppStateStatus) => {
    if (state === 'active') this.pull();
    if (state === 'background') this.push();
  };

  // --- Dirty set management ---

  private loadDirtySet() {
    try {
      const raw = mmkvStorage.getItem(SYNC_DIRTY_KEY);
      if (raw) {
        const entries: [string, DirtyRecord][] = JSON.parse(raw);
        this.dirtySet = new Map(entries);
      }
    } catch { /* start fresh */ }
  }

  private saveDirtySet() {
    mmkvStorage.setItem(SYNC_DIRTY_KEY, JSON.stringify([...this.dirtySet.entries()]));
  }

  private markDirty(table: SyncTable, id: string, updatedAt: string) {
    const key = `${table}:${id}`;
    this.dirtySet.set(key, { table, id, updatedAt });
    this.saveDirtySet();
  }

  // --- Store change detection ---

  /**
   * Slices to watch in the main store, with their sync table name and ID accessor.
   * NOTE: The store key for note folders is 'folders' (not 'noteFolders').
   */
  private static MAIN_SLICES: Array<{
    key: string; table: SyncTable; getId: (r: any) => string;
  }> = [
    { key: 'devotionals', table: 'devotionals', getId: (r) => r.id },
    { key: 'journalEntries', table: 'journal_entries', getId: (r) => r.id },
    { key: 'bookmarks', table: 'bookmarks', getId: (r) => r.id },
    { key: 'highlights', table: 'highlights', getId: (r) => r.id },
    { key: 'bibleHighlights', table: 'bible_highlights', getId: (r) => r.id },
    { key: 'bibleReadingHistory', table: 'bible_reading_positions', getId: (r) => r.id },
    { key: 'checkIns', table: 'check_ins', getId: (r) => r.id },
    { key: 'notes', table: 'notes', getId: (r) => r.id },
    { key: 'folders', table: 'note_folders', getId: (r) => r.id },
    { key: 'usedScriptures', table: 'used_scriptures', getId: (r) => r.id },
    { key: 'seriesPersonaHistory', table: 'series_persona_history', getId: (r) => r.id },
    { key: 'methodUsageHistory', table: 'method_usage_history', getId: (r) => r.id },
  ];

  private onMainStoreChange(state: any, prevState: any) {
    // Check user profile changes
    if (state.userUpdatedAt !== prevState.userUpdatedAt && state.userUpdatedAt) {
      this.markDirty('users', state.user?.authUserId || 'self', state.userUpdatedAt);
    }

    // Check each syncable array slice
    for (const { key, table, getId } of SyncService.MAIN_SLICES) {
      const curr: any[] = state[key] ?? [];
      const prev: any[] = prevState[key] ?? [];
      if (curr === prev) continue; // same reference = no change

      // Build prev map for O(1) lookup
      const prevMap = new Map(prev.map((r: any) => [getId(r), r]));

      for (const record of curr) {
        if (!record?.updatedAt) continue;
        const id = getId(record);
        const old = prevMap.get(id);
        if (!old || old.updatedAt !== record.updatedAt) {
          this.markDirty(table, id, record.updatedAt);
        }
      }

      // Also handle devotional_days nested inside devotionals
      if (key === 'devotionals') {
        for (const devo of curr) {
          if (!devo?.days) continue;
          const oldDevo = prevMap.get(devo.id);
          const oldDays = oldDevo?.days ?? [];
          const oldDayMap = new Map(oldDays.map((d: any) => [d.id, d]));
          for (const day of devo.days) {
            if (!day?.id || !day?.updatedAt) continue;
            const oldDay = oldDayMap.get(day.id);
            if (!oldDay || oldDay.updatedAt !== day.updatedAt) {
              this.markDirty('devotional_days', day.id, day.updatedAt);
            }
          }
        }
      }
    }
  }

  private onCompanionStoreChange(state: any, prevState: any) {
    const curr: any[] = state.conversations ?? [];
    const prev: any[] = prevState.conversations ?? [];
    if (curr === prev) return;

    const prevMap = new Map(prev.map((c: any) => [c.id, c]));

    for (const conv of curr) {
      if (!conv?.updatedAt) continue;
      const old = prevMap.get(conv.id);
      // Convert epoch -> ISO for dirty record timestamp if needed
      const updatedAtISO = typeof conv.updatedAt === 'number'
        ? new Date(conv.updatedAt).toISOString() : conv.updatedAt;

      if (!old || old.updatedAt !== conv.updatedAt) {
        this.markDirty('companion_conversations', conv.id, updatedAtISO);
      }

      // Check messages within conversation (only complete/error status)
      const oldMsgMap = new Map((old?.messages ?? []).map((m: any) => [m.id, m]));
      for (const msg of conv.messages ?? []) {
        if (!msg?.id || (msg.status !== 'complete' && msg.status !== 'error')) continue;
        const oldMsg = oldMsgMap.get(msg.id);
        const msgUpdatedISO = typeof msg.updatedAt === 'number'
          ? new Date(msg.updatedAt).toISOString() : msg.updatedAt;
        if (!oldMsg || oldMsg.updatedAt !== msg.updatedAt) {
          this.markDirty('companion_messages', msg.id, msgUpdatedISO || updatedAtISO);
        }
      }
    }
  }

  // --- Push ---

  async push() {
    if (this.dirtySet.size === 0) return;
    const token = await getClerkToken();
    if (!token) return;

    const changes: SyncPushChange[] = [];

    // Build changes from dirty set + current store state
    const mainState = useUnfoldStore.getState() as any;
    const companionState = useCompanionChatStore.getState() as any;

    // Lookup tables: syncTable -> store state key
    // NOTE: note_folders maps to 'folders' in the store (not 'noteFolders')
    const MAIN_LOOKUP: Record<string, string> = {
      devotionals: 'devotionals', journal_entries: 'journalEntries',
      bookmarks: 'bookmarks', highlights: 'highlights',
      bible_highlights: 'bibleHighlights', bible_reading_positions: 'bibleReadingHistory',
      check_ins: 'checkIns', notes: 'notes', note_folders: 'folders',
      used_scriptures: 'usedScriptures', series_persona_history: 'seriesPersonaHistory',
      method_usage_history: 'methodUsageHistory',
    };

    for (const [, dirty] of this.dirtySet) {
      let data: Record<string, unknown> | null = null;

      if (dirty.table === 'users') {
        // Serialize user profile from root state
        data = mainState.user ? { ...mainState.user } : null;
      } else if (dirty.table === 'devotional_days') {
        // Find nested day inside devotionals
        for (const devo of mainState.devotionals ?? []) {
          const day = (devo.days ?? []).find((d: any) => d.id === dirty.id);
          if (day) { data = { ...day, devotionalId: devo.id }; break; }
        }
      } else if (dirty.table === 'companion_conversations') {
        const conv = companionState.conversations?.find((c: any) => c.id === dirty.id);
        if (conv) {
          // Convert epoch ms -> ISO for server
          data = {
            ...conv,
            createdAt: new Date(conv.createdAt).toISOString(),
            lastMessageAt: new Date(conv.lastMessageAt).toISOString(),
            messages: undefined, // Don't nest messages in conversation push
          };
        }
      } else if (dirty.table === 'companion_messages') {
        for (const conv of companionState.conversations ?? []) {
          const msg = conv.messages?.find((m: any) => m.id === dirty.id);
          if (msg) {
            data = {
              ...msg,
              conversationId: conv.id,
              timestamp: new Date(msg.timestamp).toISOString(),
            };
            break;
          }
        }
      } else {
        const stateKey = MAIN_LOOKUP[dirty.table];
        if (stateKey) {
          data = (mainState[stateKey] ?? []).find((r: any) => r.id === dirty.id) ?? null;
        }
      }

      if (data) {
        changes.push({
          table: dirty.table,
          id: dirty.id,
          data,
          clientUpdatedAt: dirty.updatedAt,
          deleted: false,
        });
      }
    }

    if (changes.length === 0) return;

    try {
      const res = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ changes }),
      });

      if (!res.ok) {
        logger.warn('[sync] Push failed:', res.status);
        return;
      }

      const { results } = await res.json();

      for (const result of results) {
        const key = `${result.table}:${result.id}`;
        if (result.status === 'accepted') {
          this.dirtySet.delete(key);
        } else if (result.status === 'conflict') {
          // Server wins -- apply server data to local store
          this.applyServerRecord(result.table, result.serverData);
          this.dirtySet.delete(key);
        }
      }

      this.saveDirtySet();
      logger.log(`[sync] Push complete: ${results.length} results`);
    } catch (err) {
      logger.warn('[sync] Push error:', err);
    }
  }

  // --- Pull ---

  async pull() {
    const token = await getClerkToken();
    if (!token) return;

    const lastPulledAt = mmkvStorage.getItem(SYNC_LAST_PULLED_KEY) || null;

    try {
      const res = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lastPulledAt }),
      });

      if (!res.ok) {
        logger.warn('[sync] Pull failed:', res.status);
        return;
      }

      const data: SyncPullResponse = await res.json();

      // Apply changes to stores -- parent tables first so child records
      // (devotional_days, companion_messages) find their parents
      const TABLE_ORDER: SyncTable[] = [
        'users', 'devotionals', 'devotional_days',
        'journal_entries', 'bookmarks', 'highlights',
        'bible_highlights', 'bible_reading_positions', 'check_ins',
        'notes', 'note_folders',
        'companion_conversations', 'companion_messages',
        'used_scriptures', 'series_persona_history', 'method_usage_history',
      ];

      let appliedCount = 0;
      for (const table of TABLE_ORDER) {
        const records = data.changes[table];
        if (!records) continue;
        for (const record of records) {
          if (record.deleted) {
            this.removeLocalRecord(table, record.id);
          } else {
            this.applyServerRecord(table, record.data);
          }
          appliedCount++;
        }
      }

      mmkvStorage.setItem(SYNC_LAST_PULLED_KEY, data.timestamp);
      if (appliedCount > 0) {
        logger.log(`[sync] Pull complete: ${appliedCount} records applied`);
      }
    } catch (err) {
      logger.warn('[sync] Pull error:', err);
    }
  }

  // --- Apply server data to local stores ---

  private applyServerRecord(table: SyncTable, data: any) {
    if (!data) return;

    // Route to correct store based on table name
    if (table === 'companion_conversations' || table === 'companion_messages') {
      // Companion store -- convert ISO -> epoch ms for timestamps
      const companionState = useCompanionChatStore.getState();
      if (table === 'companion_conversations') {
        const convData = {
          ...data,
          messages: data.messages ?? [],  // Ensure messages array always exists
          topicTags: data.topicTags ?? [],  // Ensure topicTags array always exists
          createdAt: new Date(data.createdAt).getTime(),
          lastMessageAt: new Date(data.lastMessageAt).getTime(),
        };
        const conversations = companionState.conversations ?? [];
        const idx = conversations.findIndex((c: any) => c.id === data.id);
        const updated = [...conversations];
        if (idx >= 0) {
          // Merge but preserve local messages if server doesn't have them
          updated[idx] = { ...updated[idx], ...convData, messages: convData.messages.length > 0 ? convData.messages : (updated[idx].messages ?? []) };
        } else {
          updated.unshift(convData);
        }
        useCompanionChatStore.setState({ conversations: updated });
      }
      // companion_messages: find parent conversation, update/add message
      if (table === 'companion_messages') {
        const msgData = { ...data, timestamp: new Date(data.timestamp).getTime() };
        const convs = [...(companionState.conversations ?? [])];
        let found = false;
        for (const conv of convs) {
          if (data.conversationId && conv.id !== data.conversationId) continue;
          const convMessages = conv.messages ?? [];
          const msgIdx = convMessages.findIndex((m: any) => m.id === data.id);
          if (msgIdx >= 0) {
            convMessages[msgIdx] = { ...convMessages[msgIdx], ...msgData };
            conv.messages = convMessages;
            found = true;
            break;
          }
        }
        // If not found in any conversation but has conversationId, add to that conversation
        if (!found && data.conversationId) {
          for (const conv of convs) {
            if (conv.id === data.conversationId) {
              if (!conv.messages) conv.messages = [];
              conv.messages.push(msgData);
              break;
            }
          }
        }
        useCompanionChatStore.setState({ conversations: convs });
      }
      return;
    }

    // Main store -- use setState to merge
    const state = useUnfoldStore.getState();

    // Routing table: SyncTable -> store state key
    // NOTE: note_folders maps to 'folders' in the store
    const MAIN_ROUTES: Record<string, string> = {
      users: '_user', devotionals: 'devotionals', devotional_days: '_nested',
      journal_entries: 'journalEntries', bookmarks: 'bookmarks',
      highlights: 'highlights', bible_highlights: 'bibleHighlights',
      bible_reading_positions: 'bibleReadingHistory', check_ins: 'checkIns',
      notes: 'notes', note_folders: 'folders',
      used_scriptures: 'usedScriptures', series_persona_history: 'seriesPersonaHistory',
      method_usage_history: 'methodUsageHistory',
    };

    const stateKey = MAIN_ROUTES[table];
    if (!stateKey) return;

    if (stateKey === '_user') {
      // Merge into user profile -- update the user object and userUpdatedAt
      const currentUser = (state as any).user;
      if (currentUser) {
        useUnfoldStore.setState({
          user: { ...currentUser, ...data },
          userUpdatedAt: data.updatedAt,
        } as any);
      }
      return;
    }

    if (stateKey === '_nested') {
      // devotional_days: find parent devotional by data.devotionalId, update/add day
      const devos = [...(state as any).devotionals];
      const devo = devos.find((d: any) => d.id === data.devotionalId);
      if (devo) {
        // Ensure days array exists (server-synced devotionals may not include it)
        if (!Array.isArray(devo.days)) devo.days = [];
        const dayIdx = devo.days.findIndex((d: any) => d.id === data.id);
        if (dayIdx >= 0) devo.days[dayIdx] = { ...devo.days[dayIdx], ...data };
        else devo.days.push(data);
        useUnfoldStore.setState({ devotionals: devos } as any);
      }
      return;
    }

    // Standard array merge: find by id, update or append
    const arr = [...((state as any)[stateKey] ?? [])];
    const idx = arr.findIndex((r: any) => r.id === data.id);
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...data };
    } else {
      // Devotionals from server won't have a days array (days are in a separate table).
      // Initialize it so nested devotional_days records can be applied later.
      if (stateKey === 'devotionals' && !Array.isArray(data.days)) {
        data.days = [];
      }
      arr.push(data);
    }
    useUnfoldStore.setState({ [stateKey]: arr } as any);
  }

  private removeLocalRecord(table: SyncTable, id: string) {
    if (table === 'companion_conversations') {
      const convs = (useCompanionChatStore.getState().conversations ?? []).filter((c: any) => c.id !== id);
      useCompanionChatStore.setState({ conversations: convs });
      return;
    }
    if (table === 'companion_messages') {
      const convs = [...(useCompanionChatStore.getState().conversations ?? [])];
      for (const conv of convs) {
        conv.messages = (conv.messages ?? []).filter((m: any) => m.id !== id);
      }
      useCompanionChatStore.setState({ conversations: convs });
      return;
    }

    // NOTE: note_folders maps to 'folders' in the store
    const MAIN_ROUTES: Record<string, string> = {
      devotionals: 'devotionals', journal_entries: 'journalEntries',
      bookmarks: 'bookmarks', highlights: 'highlights',
      bible_highlights: 'bibleHighlights', bible_reading_positions: 'bibleReadingHistory',
      check_ins: 'checkIns', notes: 'notes', note_folders: 'folders',
      used_scriptures: 'usedScriptures', series_persona_history: 'seriesPersonaHistory',
      method_usage_history: 'methodUsageHistory',
    };

    const stateKey = MAIN_ROUTES[table];
    if (!stateKey) return;

    if (table === 'devotional_days') {
      // Remove day from parent devotional
      const devos = [...(useUnfoldStore.getState() as any).devotionals];
      for (const devo of devos) {
        devo.days = (devo.days ?? []).filter((d: any) => d.id !== id);
      }
      useUnfoldStore.setState({ devotionals: devos } as any);
      return;
    }

    const arr = ((useUnfoldStore.getState() as any)[stateKey] ?? []).filter((r: any) => r.id !== id);
    useUnfoldStore.setState({ [stateKey]: arr } as any);
  }
}

export const syncService = new SyncService();
