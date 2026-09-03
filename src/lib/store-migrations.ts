import { logger } from './logger';
import { canonicalGeneratedDayId } from './devotional-canonical-days';
import { compositeId } from './sync-ids';
import { normalizeSoapResponses } from './journal-entry-state';
import { mergeJournalEntryDuplicates } from './journal-entry-merge';

type PersistedUnfoldState = Record<string, any>;

/**
 * A migration step that throws leaves the persisted blob half-migrated — a
 * production bug the bug log should capture, not just a dev console line.
 * report-error → bug-logger → store, and store imports this module, so the
 * import is deferred to the failure path: a static one would add a require
 * cycle and pull the whole store graph into every migration unit test.
 */
function reportMigrationFailure(step: string, err: unknown): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { reportError } = require('./report-error') as typeof import('./report-error');
    reportError('store-migration', err, { step });
  } catch (reportErr) {
    // Reporting must never break hydration — fall back to the dev logger.
    logger.error(`[store] Migration ${step} failed:`, err, reportErr);
  }
}

/**
 * Pending journal writes live in the sync outbox (its own MMKV key), not in
 * the persisted store blob this file migrates. Re-keying entries by day
 * without re-keying the queue would push the queued writes under their old
 * random ids on the next drain, and the next pull would bring those rows back
 * as duplicates of the day just merged. Rewrite them to the same canonical id,
 * keeping the newest queued write per day.
 *
 * The require is deferred for the same reason reportMigrationFailure defers
 * its own: sync-outbox → mmkv-storage → store, and store imports this module.
 */
function remapQueuedJournalWrites(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outbox = require('./sync-outbox') as typeof import('./sync-outbox');
    const changes = outbox.peekSyncOutbox();
    if (changes.length === 0) return;
    let rewritten = 0;
    const remapped = changes.map((change) => {
      if (change.table !== 'journal_entries') return change;
      const data = (change.data ?? {}) as { devotionalId?: unknown; dayNumber?: unknown };
      if (typeof data.devotionalId !== 'string' || typeof data.dayNumber !== 'number') return change;
      const canonical = compositeId(data.devotionalId, data.dayNumber);
      if (change.id === canonical) return change;
      rewritten += 1;
      return { ...change, id: canonical };
    });
    if (rewritten === 0) return;
    // Two queued writes for one day collapse to the newest, matching the
    // outbox's own last-write-wins dedup.
    const byRecord = new Map<string, (typeof remapped)[number]>();
    for (const change of remapped) {
      const key = `${change.table}:${change.id}`;
      const existing = byRecord.get(key);
      if (!existing || (change.clientUpdatedAt ?? '') >= (existing.clientUpdatedAt ?? '')) byRecord.set(key, change);
    }
    outbox.replaceSyncOutbox([...byRecord.values()]);
    logger.log(`[store] Migration v41→42: re-keyed ${rewritten} queued journal write(s) to their day`);
  } catch (err) {
    reportMigrationFailure('v41→42 outbox', err);
  }
}

export function migrateUnfoldStore(persistedState: unknown, version: number): PersistedUnfoldState {
const state = persistedState as PersistedUnfoldState;

// Migration from version 1 to 2: Add review prompt fields
if (version < 2) {
  try {
    (state as any).reviewPromptLastDate = (state as any).reviewPromptLastDate ?? null;
    (state as any).reviewPromptCount = (state as any).reviewPromptCount ?? 0;
    (state as any).hasReviewed = (state as any).hasReviewed ?? false;
    (state as any).reviewPromptDaysAtLast = (state as any).reviewPromptDaysAtLast ?? 0;
    (state as any).streakLastReadDate = (state as any).streakLastReadDate ?? null;
    (state as any).streakCurrent = (state as any).streakCurrent ?? 0;
    (state as any).streakLongest = (state as any).streakLongest ?? 0;
    (state as any).streakGraceDaysUsedThisWeek = (state as any).streakGraceDaysUsedThisWeek ?? 0;
    (state as any).streakWeekStart = (state as any).streakWeekStart ?? null;
  } catch (err) {
    reportMigrationFailure('v1→2', err);
  }
}

// Migration from version 2 to 3: Add streak tracking fields
if (version < 3) {
  try {
    (state as any).streakLastReadDate = (state as any).streakLastReadDate ?? null;
    (state as any).streakCurrent = (state as any).streakCurrent ?? 0;
    (state as any).streakLongest = (state as any).streakLongest ?? 0;
    (state as any).streakGraceDaysUsedThisWeek = (state as any).streakGraceDaysUsedThisWeek ?? 0;
    (state as any).streakWeekStart = (state as any).streakWeekStart ?? null;
  } catch (err) {
    reportMigrationFailure('v2→3', err);
  }
}

// Migration from version 3 to 4: Add streak freeze and weekend amnesty
if (version < 4) {
  try {
    (state as any).streakWeekendAmnesty = (state as any).streakWeekendAmnesty ?? true;
    (state as any).streakFreezes = (state as any).streakFreezes ?? 0;
  } catch (err) {
    reportMigrationFailure('v3→4', err);
  }
}

// Migration from version 4 to 5: Add preferredVoice default to user
if (version < 5) {
  try {
    if (state.user && typeof state.user === 'object' && !state.user.preferredVoice) {
      state.user.preferredVoice = 'arman';
    }
  } catch (err) {
    reportMigrationFailure('v4→5', err);
  }
}

// Migration from version 5 to 6: Add seriesPersonaHistory
if (version < 6) {
  try {
    (state as any).seriesPersonaHistory = (state as any).seriesPersonaHistory ?? [];
  } catch (err) {
    reportMigrationFailure('v5→6', err);
  }
}

// Migration from version 6 to 7: Add hasSeenHomeTooltips
if (version < 7) {
  try {
    (state as any).hasSeenHomeTooltips = (state as any).hasSeenHomeTooltips ?? false;
  } catch (err) {
    reportMigrationFailure('v6→7', err);
  }
}

// Migration from version 7 to 8: Add hasSeenFeatureOnboarding
if (version < 8) {
  try {
    (state as any).hasSeenFeatureOnboarding = (state as any).hasSeenFeatureOnboarding ?? false;
  } catch (err) {
    reportMigrationFailure('v7→8', err);
  }
}

// Migration from version 8 to 9: Add checkIns array
if (version < 9) {
  try {
    (state as any).checkIns = (state as any).checkIns ?? [];
  } catch (err) {
    reportMigrationFailure('v8→9', err);
  }
}

if (version < 10) {
  try {
    (state as any).hasSeenDay1Review = (state as any).hasSeenDay1Review ?? false;
  } catch (err) {
    reportMigrationFailure('v9→10', err);
  }
}

// Migration from version 11 to 12: Add companion orb state
if (version < 12) {
  try {
    (state as any).hasSeenCompanionIntro = (state as any).hasSeenCompanionIntro ?? false;
    (state as any).lastCompanionCheckInDate = (state as any).lastCompanionCheckInDate ?? null;
  } catch (err) {
    reportMigrationFailure('v10→12', err);
  }
}

if (version < 13) {
  try {
    (state as any).dismissedMiddayCardDate = (state as any).dismissedMiddayCardDate ?? null;
    (state as any).dismissedEveningCardDate = (state as any).dismissedEveningCardDate ?? null;
  } catch (err) {
    reportMigrationFailure('v12→13', err);
  }
}

// Migration from version 13 to 14: Add premium nudge system
if (version < 14) {
  try {
    (state as any).nudgeImpressions = (state as any).nudgeImpressions ?? [];
    (state as any).nudgeShownThisSession = (state as any).nudgeShownThisSession ?? false;
    (state as any).nudgeDismissals = (state as any).nudgeDismissals ?? [];
    (state as any).streakJustReset = (state as any).streakJustReset ?? false;
    (state as any).justCompletedSeriesTitle = (state as any).justCompletedSeriesTitle ?? null;
    (state as any).hasUsedAudio = (state as any).hasUsedAudio ?? false;
  } catch (err) {
    reportMigrationFailure('v13→14', err);
  }
}

// Migration from version 14 to 15: Add companion name and recent check-ins
if (version < 15) {
  try {
    (state as any).companionName = (state as any).companionName ?? null;
    (state as any).recentCompanionCheckIns = (state as any).recentCompanionCheckIns ?? [];
  } catch (err) {
    reportMigrationFailure('v14→15', err);
  }
}

// Migration from version 15 to 16: Add progressive generation
if (version < 16) {
  try {
    const devos = (state as any).devotionals ?? [];
    for (const d of devos) {
      if (!d) continue; // Skip null/undefined entries
      if (!d.generationMode) d.generationMode = 'batch';
      if (!Array.isArray(d.days)) d.days = [];
    }
    (state as any).devotionals = devos;
    (state as any).progressiveGeneration = (state as any).progressiveGeneration ?? {
      devotionalId: null,
      currentDayGeneration: null,
      isArcGenerated: false,
    };
  } catch (err) {
    reportMigrationFailure('v15→16', err);
  }
}

// Migration from version 16 to 17: Add Bible Reader state
if (version < 17) {
  try {
    (state as any).bibleHighlights = (state as any).bibleHighlights ?? [];
    (state as any).bibleReadingHistory = (state as any).bibleReadingHistory ?? [];
    (state as any).bibleReaderSettings = (state as any).bibleReaderSettings ?? {
      fontSize: 20,
      lineHeightMultiplier: 1.8,
      showVerseNumbers: true,
      paragraphMode: false,
      translation: 'BSB',
    };
  } catch (err) {
    reportMigrationFailure('v16→17', err);
  }
}

// Migration from version 17 to 18: Improve Bible Reader defaults
if (version < 18) {
  try {
    const settings = (state as any).bibleReaderSettings ?? {};
    (state as any).bibleReaderSettings = {
      ...settings,
      fontSize: 20,
      lineHeightMultiplier: 1.8,
    };
  } catch (err) {
    reportMigrationFailure('v17→18', err);
  }
}

// Migration from version 18 to 19: previously seeded the AI consent flag.
// The consent feature was removed (product decision 2026-06-11); the version
// step is kept as a no-op so the migration chain ordering is unchanged.
if (version < 19) {
  // no-op
}

// Migration from version 19 to 20: Add notebook notes
if (version < 20) {
  try {
    (state as any).notes = (state as any).notes ?? [];
  } catch (err) {
    reportMigrationFailure('v19→20', err);
  }
}

// Migration from version 20 to 21: Add notebook folders
if (version < 21) {
  try {
    (state as any).folders = (state as any).folders ?? [];
  } catch (err) {
    reportMigrationFailure('v20→21', err);
  }
}

// Migration from version 21 to 22: Add parentId to folders (subfolder support)
if (version < 22) {
  try {
    // Existing folders get parentId: undefined (top-level) — no data change needed
  } catch (err) {
    reportMigrationFailure('v21→22', err);
  }
}

// Migration from version 22 to 23: Add check-in notification toggles
if (version < 23) {
  try {
    (state as any).middayCheckInEnabled = (state as any).middayCheckInEnabled ?? true;
    (state as any).eveningWindDownEnabled = (state as any).eveningWindDownEnabled ?? true;
  } catch (err) {
    reportMigrationFailure('v22→23', err);
  }
}

if (version < 24) {
  // Clear legacy anonymous/guest auth providers — sign-in is now required
  try {
    const user = (state as any).user;
    if (user?.authProvider === 'anonymous' || user?.authProvider === 'guest') {
      user.authProvider = null;
    }
  } catch (err) {
    reportMigrationFailure('v23→24', err);
  }
}

// Migration from version 24 to 25: Map Cartesia voice UUIDs to Smallest.ai voice IDs
if (version < 25) {
  try {
    const voiceMap: Record<string, string> = {
      '694f9389-aac1-45b6-b726-9d9369183238': 'arman',   // Katie → Arman
      '03496517-369a-4db1-8236-3d3ae459ddf7': 'jasmine', // Elena → Jasmine
      '1463a4e1-56a1-4b41-b257-728d56e93605': 'arman',   // Marcus → Arman
      '3246e36c-ac8c-418d-83cd-4eaad5a3b887': 'arman',   // David → Arman
      '15a9cd88-84b0-4a8b-95f2-5d583b54c72e': 'jasmine', // Grace → Jasmine
      'emily': 'arman',
      'george': 'arman',
      'jasper': 'arman',
      'ariana': 'jasmine',
      'james': 'arman',
    };
    if (state.user && typeof state.user === 'object') {
      const oldVoice = state.user.preferredVoice;
      if (oldVoice && voiceMap[oldVoice]) {
        state.user.preferredVoice = voiceMap[oldVoice];
      } else if (!oldVoice || !['arman', 'jasmine'].includes(oldVoice)) {
        state.user.preferredVoice = 'arman';
      }
      // Flag for cache cleanup — picked up by tts-service on first use
      (state as any)._needsTtsCacheCleanup = true;
    }
  } catch (err) {
    reportMigrationFailure('v24→25', err);
  }
}

// Migration from version 25 to 26: Add custom check-in times
if (version < 26) {
  try {
    (state as any).middayCheckInTime = (state as any).middayCheckInTime ?? '12:30';
    (state as any).eveningWindDownTime = (state as any).eveningWindDownTime ?? '20:30';
    (state as any).middayCheckInByDay = (state as any).middayCheckInByDay ?? null;
    (state as any).eveningWindDownByDay = (state as any).eveningWindDownByDay ?? null;
  } catch (err) {
    reportMigrationFailure('v25→26', err);
  }
}

// Migration from version 26 to 27: Add deferred generation fields
if (version < 27) {
  try {
    (state as any).lastGenerationCutoffDate = (state as any).lastGenerationCutoffDate ?? '';
  } catch (err) {
    reportMigrationFailure('v26→27', err);
  }
}

// Migration from version 27 to 28: Add evening generation tracking
if (version < 28) {
  try {
    (state as any).lastEveningGenerationDate = (state as any).lastEveningGenerationDate ?? '';
  } catch (err) {
    reportMigrationFailure('v27→28', err);
  }
}

// Migration from version 28 to 29: Add updatedAt + id for cloud sync
if (version < 29) {
  try {
    const now = new Date().toISOString();

    // Backfill devotionals
    const devos = (state as any).devotionals ?? [];
    for (const d of devos) {
      if (!d) continue;
      if (!d.updatedAt) d.updatedAt = d.createdAt || now;
      // Backfill days
      if (Array.isArray(d.days)) {
        for (const day of d.days) {
          if (!day) continue;
          day.devotionalId = day.devotionalId || d.id;
          if (!day.id) day.id = canonicalGeneratedDayId(d.id, day.dayNumber);
          if (!day.updatedAt) day.updatedAt = day.readAt || day.generatedAt || d.createdAt || now;
        }
      }
    }

    // Backfill bookmarks
    const bookmarks = (state as any).bookmarks ?? [];
    for (const b of bookmarks) {
      if (!b) continue;
      if (!b.updatedAt) b.updatedAt = b.savedAt || now;
    }

    // Backfill highlights
    const highlights = (state as any).highlights ?? [];
    for (const h of highlights) {
      if (!h) continue;
      if (!h.updatedAt) h.updatedAt = h.createdAt || now;
    }

    // Backfill bible highlights
    const bibleHighlights = (state as any).bibleHighlights ?? [];
    for (const bh of bibleHighlights) {
      if (!bh) continue;
      if (!bh.updatedAt) bh.updatedAt = bh.createdAt || now;
    }

    // Backfill bible reading positions
    const bibleReadingHistory = (state as any).bibleReadingHistory ?? [];
    for (const pos of bibleReadingHistory) {
      if (!pos) continue;
      if (!pos.id) pos.id = compositeId(pos.bookId, pos.translation || 'BSB');
      if (!pos.updatedAt) pos.updatedAt = pos.lastReadAt || now;
    }

    // Backfill check-ins — convert `checkin_${Date.now()}` IDs to proper UUIDs
    // (backend uses uuid('id').primaryKey() so non-UUID IDs will fail on INSERT)
    const checkIns = (state as any).checkIns ?? [];
    for (const ci of checkIns) {
      if (!ci) continue;
      if (!ci.id || !ci.id.match(/^[0-9a-f]{8}-/)) {
        // Generate deterministic UUID from composite key
        ci.id = compositeId(ci.devotionalId || 'unknown', ci.dayNumber ?? 0, ci.timeOfDay || 'morning');
      }
      if (!ci.updatedAt) ci.updatedAt = ci.createdAt || now;
    }

    // Backfill used scriptures
    const usedScriptures = (state as any).usedScriptures ?? [];
    for (const us of usedScriptures) {
      if (!us) continue;
      if (!us.id) us.id = compositeId(us.reference, us.devotionalId);
      if (!us.updatedAt) us.updatedAt = us.usedAt || now;
    }

    // Backfill series persona history
    const personaHistory = (state as any).seriesPersonaHistory ?? [];
    for (const sp of personaHistory) {
      if (!sp) continue;
      if (!sp.id) sp.id = compositeId('persona', sp.devotionalId);
      if (!sp.updatedAt) sp.updatedAt = sp.createdAt || now;
    }

    // Backfill method usage history
    const methodHistory = (state as any).methodUsageHistory ?? [];
    for (const mu of methodHistory) {
      if (!mu) continue;
      if (!mu.id) mu.id = compositeId(mu.methodId, mu.devotionalId, mu.dayNumber);
      if (!mu.updatedAt) mu.updatedAt = mu.usedAt || now;
    }

    // Notes and folders already have updatedAt — no backfill needed
    // Journal entries already have updatedAt — no backfill needed

    // Add userUpdatedAt for user profile sync
    (state as any).userUpdatedAt = now;

    logger.log('[store] Migration v28→29: Backfilled updatedAt + id for sync');
  } catch (err) {
    reportMigrationFailure('v28→29', err);
  }
}

// Migration from version 29 to 30: Remove client-side generation state,
// add server-side job tracking fields
if (version < 30) {
  try {
    // Strip removed client-side generation fields
    delete (state as any).progressiveGeneration;
    delete (state as any).lastGenerationCutoffDate;
    delete (state as any).lastEveningGenerationDate;

    // Add new server-side tracking fields
    (state as any).pendingJobId = (state as any).pendingJobId ?? null;

    logger.log('[store] Migration v29→30: Removed client-side generation state');
  } catch (err) {
    reportMigrationFailure('v29→30', err);
  }
}

// Migration from version 30 to 31: Migrate WEB bible translation to BSB
if (version < 31) {
  try {
    const user = (state as any).user;
    if (user && user.bibleTranslation === 'WEB') {
      user.bibleTranslation = 'BSB';
    }
    logger.log('[store] Migration v30→31: Migrated WEB bible translation to BSB');
  } catch (err) {
    reportMigrationFailure('v30→31', err);
  }
}

// Migration from version 31 to 32: Add isRevealed to DevotionalDay, remove lastRevealShownDate
if (version < 32) {
  try {
    for (const d of (state as any).devotionals ?? []) {
      for (const day of d.days ?? []) {
        if (day.isRead || day.dayNumber === 1) {
          day.isRevealed = true;
        }
      }
    }
    delete (state as any).lastRevealShownDate;
    logger.log('[store] Migration v31→32: Added isRevealed, removed lastRevealShownDate');
  } catch (err) {
    reportMigrationFailure('v31→32', err);
  }
}

// Migration from version 32 to 33: Backfill sync IDs on usedScriptures + bibleReadingHistory
if (version < 33) {
  try {
    for (const us of (state as any).usedScriptures ?? []) {
      if (!us.id) {
        us.id = `us_${us.devotionalId}_${us.reference}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      }
    }
    for (const brp of (state as any).bibleReadingHistory ?? []) {
      if (!brp.id) {
        brp.id = `brp_${brp.bookId}_${brp.chapter}_${brp.translation}`;
      }
    }
    logger.log('[store] Migration v32→33: Backfilled sync IDs on usedScriptures + bibleReadingHistory');
  } catch (err) {
    reportMigrationFailure('v32→33', err);
  }
}

// Migration from version 33 to 34: Add faithImpact field
if (version < 34) {
  try {
    const user = (state as any).user;
    if (user && user.faithImpact === undefined) {
      user.faithImpact = '';
    }
    logger.log('[store] Migration v33→34: Added faithImpact field');
  } catch (err) {
    reportMigrationFailure('v33→34', err);
  }
}

// Migration from version 34 to 35: Add hasEverCreatedDevotional flag
if (version < 35) {
  try {
    const devos = (state as any).devotionals ?? [];
    (state as any).hasEverCreatedDevotional = devos.length > 0;
    logger.log('[store] Migration v34→35: Added hasEverCreatedDevotional flag');
  } catch (err) {
    reportMigrationFailure('v34→35', err);
  }
}

// Migration from version 35 to 36: Add check-in completion date tracking.
// Defaults to null — the owner hook will re-fingerprint on first mount
// and schedule the correct trigger regardless of whether the user
// already completed today's check-in before the update.
if (version < 36) {
  try {
    (state as any).lastMiddayCompletedDate = (state as any).lastMiddayCompletedDate ?? null;
    (state as any).lastEveningCompletedDate = (state as any).lastEveningCompletedDate ?? null;
    logger.log('[store] Migration v35→36: Added check-in completion date fields');
  } catch (err) {
    reportMigrationFailure('v35→36', err);
  }
}

// Migration from version 36 to 37: Add optional Today card dismissal dates.
if (version < 37) {
  try {
    (state as any).dismissedBridgeCardDate = (state as any).dismissedBridgeCardDate ?? null;
    (state as any).dismissedRememberThisCardDate = (state as any).dismissedRememberThisCardDate ?? null;
    logger.log('[store] Migration v36→37: Added Today optional card dismiss fields');
  } catch (err) {
    reportMigrationFailure('v36→37', err);
  }
}

// Migration from version 37 to 38: Add durable daily-reminder intent.
// Existing users with a reminder time keep reminders enabled; users without a
// reminder time stay off until they explicitly enable the toggle.
if (version < 38) {
  try {
    const user = (state as any).user;
    if (user && typeof user === 'object' && user.dailyReminderEnabled === undefined) {
      user.dailyReminderEnabled = Boolean(user.reminderTime);
    }
    logger.log('[store] Migration v37→38: Added daily reminder enabled flag');
  } catch (err) {
    reportMigrationFailure('v37→38', err);
  }
}

if (version < 39) {
  try {
    if (!Array.isArray((state as any).deletedNotes)) {
      (state as any).deletedNotes = [];
    }
    logger.log('[store] Migration v38→39: Added Recently Deleted retention');
  } catch (err) {
    reportMigrationFailure('v38→39', err);
  }
}

// Migration from version 39 to 40: repair a missing seriesStartDate.
//
// Devotionals restored from server sync were built without the calendar
// anchor. getCalendarDayNumber returns null without it and
// isCurrentDayAfterCalendarDay then fails CLOSED, which pins the reader to
// whatever day was read today — that is the "tap Day 2, get Day 1" report.
//
// The sync paths now carry the field, but only repair a devotional that a pull
// actually delivers. An affected user whose series has not changed server-side
// since their last sync would never receive that row, so upgrading alone would
// not fix them. This closes it locally on first launch.
//
// createdAt is the right proxy: both client creation paths set createdAt and
// seriesStartDate to the same instant, and the pulled shell derives both from
// day 1's generatedAt.
if (version < 40) {
  try {
    const devotionals = (state as any).devotionals;
    if (Array.isArray(devotionals)) {
      let repaired = 0;
      for (const devotional of devotionals) {
        if (devotional && !devotional.seriesStartDate && devotional.createdAt) {
          devotional.seriesStartDate = devotional.createdAt;
          repaired += 1;
        }
      }
      if (repaired > 0) {
        logger.log(`[store] Migration v39→40: repaired seriesStartDate on ${repaired} devotional(s)`);
      }
    }
  } catch (err) {
    reportMigrationFailure('v39→40', err);
  }
}

// Migration from version 40 to 41: repair journal soapResponses restored by
// sync. The pull mapper turned a NULL soap_responses column (every freewrite
// entry) into `{}`, and journal.tsx / journal-detail.tsx read the four
// fields unguarded — every synced reflection opened into the error boundary.
// The mapper now yields four strings or nothing; this repairs what an
// upgraded install already has on disk so it never hits the crash.
if (version < 41) {
  try {
    const journalEntries = (state as any).journalEntries;
    if (Array.isArray(journalEntries)) {
      let repaired = 0;
      for (const entry of journalEntries) {
        if (!entry || typeof entry !== 'object' || !('soapResponses' in entry)) continue;
        const normalized = normalizeSoapResponses(entry.soapResponses);
        const unchanged =
          normalized !== undefined &&
          JSON.stringify(normalized) === JSON.stringify(entry.soapResponses);
        if (unchanged) continue;
        if (normalized) entry.soapResponses = normalized;
        else delete entry.soapResponses;
        repaired += 1;
      }
      if (repaired > 0) {
        logger.log(`[store] Migration v40→41: repaired soapResponses on ${repaired} journal entr${repaired === 1 ? 'y' : 'ies'}`);
      }
    }
  } catch (err) {
    reportMigrationFailure('v40→41', err);
  }
}

// Migration from version 41 to 42: one journal entry per (devotionalId,
// dayNumber), under a deterministic id.
//
// Entry ids were random per device, so the same day written on a second
// device (or restored from a server row minted elsewhere) produced a second
// entry. Every day-keyed lookup is a first-match `find`, so that entry was
// invisible in the app while still syncing — the second device's writing
// looked lost. Merge the duplicates, keeping every piece of text.
if (version < 42) {
  try {
    const journalEntries = (state as any).journalEntries;
    if (Array.isArray(journalEntries) && journalEntries.length > 0) {
      const usable = journalEntries.filter(
        (entry: any) => entry && typeof entry.devotionalId === 'string' && typeof entry.dayNumber === 'number',
      );
      const merged = mergeJournalEntryDuplicates(usable);
      // Anything too malformed to key by day is kept as-is rather than dropped.
      const unusable = journalEntries.filter((entry: any) => entry && !usable.includes(entry));
      if (merged.length !== journalEntries.length || unusable.length > 0) {
        (state as any).journalEntries = [...merged, ...unusable];
        logger.log(
          `[store] Migration v41→42: merged ${journalEntries.length} journal entries into ${merged.length + unusable.length}`,
        );
      } else {
        (state as any).journalEntries = merged;
      }
      remapQueuedJournalWrites();
    }
  } catch (err) {
    reportMigrationFailure('v41→42', err);
  }
}

return state;
}
