# Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync all user data across devices via Railway Postgres, keyed by Clerk user ID, using local-first optimistic architecture.

**Architecture:** MMKV remains on-device source of truth. A SyncService module subscribes to both Zustand stores (main + companion), tracks dirty records, and pushes/pulls to Railway Postgres via two endpoints. Last-write-wins conflict resolution via timestamps.

**Tech Stack:** Zustand + MMKV (client), Express + Drizzle + PostgreSQL (backend), Clerk JWT auth, uuid v5 for deterministic IDs

**Spec:** `docs/superpowers/specs/2026-03-28-cloud-sync-design.md`

---

## File Structure

### Client (Mobile App)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/sync-ids.ts` | Create | UUID v5 deterministic ID generation for types lacking `id` |
| `src/lib/sync-types.ts` | Create | Shared type definitions for sync protocol (DirtyRecord, SyncChange, etc.) |
| `src/lib/sync-service.ts` | Create | Core sync engine: dirty set, push/pull cycle, store subscriptions |
| `src/lib/store.ts` | Modify | v28→v29 migration: add `updatedAt` + `id` to all syncable records |
| `src/lib/companion-chat-store.ts` | Modify | v2→v3 migration: add `updatedAt` ISO strings |
| `src/app/_layout.tsx` | Modify | Initialize SyncService on app load |
| `src/lib/clerk.ts` | Modify | Remove `continueAsGuest()` |
| `src/hooks/useAuth.ts` | Modify | Remove guest fallback logic |

### Backend

| File | Action | Responsibility |
|------|--------|---------------|
| `src/db/schema.ts` | Modify | Add 15 sync tables with Drizzle schema definitions |
| `src/routes/sync.ts` | Create | `POST /api/sync/push` and `POST /api/sync/pull` handlers |
| `src/index.ts` | Modify | Register sync routes |
| `src/middleware/rate-limit.ts` | Modify | Add `sync` cost group |

---

## Phase 1: Store Migration (Client)

### Task 1: Create sync ID utility

**Files:**
- Create: `src/lib/sync-ids.ts`

- [ ] **Step 1: Create sync-ids.ts**

Note: `uuid` v11.1.0 and `@types/uuid` are already installed — no need to add them.

```typescript
// src/lib/sync-ids.ts
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

// Custom namespace UUID for Unfold (generated via uuidv5('unfold.app', DNS_NAMESPACE))
// This avoids collisions with other apps that use the raw DNS namespace.
const UNFOLD_NAMESPACE = 'a1b2c3d4-e5f6-5a7b-8c9d-0e1f2a3b4c5d';

/**
 * Generate a deterministic UUID from a composite key.
 * Used for records that lack an `id` field — produces the same UUID
 * for the same input every time, so IDs are stable across migrations.
 */
export function compositeId(...parts: (string | number)[]): string {
  return uuidv5(parts.join(':'), UNFOLD_NAMESPACE);
}

/** Generate a new random UUID for new records. */
export function newId(): string {
  return uuidv4();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sync-ids.ts
git commit -m "feat(sync): add UUID utility for sync ID generation"
```

---

### Task 2: Create sync type definitions

**Files:**
- Create: `src/lib/sync-types.ts`

- [ ] **Step 1: Create sync-types.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sync-types.ts
git commit -m "feat(sync): add shared type definitions for sync protocol"
```

---

### Task 3: Add `updatedAt` and `id` to main store types + migration

This is the largest task. It modifies the Zustand store interfaces and adds a v28→v29 migration that backfills `updatedAt` and `id` on all existing records.

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Add `updatedAt` to interfaces that lack it**

Types that already have `updatedAt`: `JournalEntry`, `Note`, `NoteFolder`.
Types that already have `id`: `Devotional`, `JournalEntry`, `CheckIn`, `Bookmark`, `Highlight`, `BibleHighlight`, `Note`, `NoteFolder`.

Add `updatedAt` to these interfaces (add after existing fields, before closing brace):

**`DevotionalDay`** (line ~196) — add:
```typescript
  id?: string; // Added for sync — composite from devotionalId:dayNumber
  updatedAt?: string; // ISO timestamp
```

**`Devotional`** (line ~221) — add:
```typescript
  updatedAt?: string; // ISO timestamp
```

**`CheckIn`** (line ~270) — already has `id` and `createdAt`, add:
```typescript
  updatedAt?: string; // ISO timestamp
```

**`UsedScripture`** (line ~278) — add:
```typescript
  id?: string; // Added for sync — composite from reference:devotionalId
  updatedAt?: string; // ISO timestamp
```

**`Bookmark`** (line ~290) — add:
```typescript
  updatedAt?: string; // ISO timestamp
```

**`Highlight`** (line ~308) — add:
```typescript
  updatedAt?: string; // ISO timestamp
```

**`BibleHighlight`** (line ~103) — add:
```typescript
  updatedAt?: string; // ISO timestamp
```

**`BibleReadingPosition`** (line ~111) — add:
```typescript
  id?: string; // Added for sync — composite from bookId:translation
  updatedAt?: string; // ISO timestamp
```

**`SeriesPersonaRecord`** (line ~406) — add:
```typescript
  id?: string; // Added for sync — composite from devotionalId
  updatedAt?: string; // ISO timestamp
```

**`MethodUsageRecord`** (line ~414) — add:
```typescript
  id?: string; // Added for sync — composite from methodId:devotionalId:dayNumber
  updatedAt?: string; // ISO timestamp
```

- [ ] **Step 2: Update all store mutation actions to set `updatedAt`**

Every action that modifies a syncable record must set `updatedAt = new Date().toISOString()`. Find each action in the store and add the timestamp update. Key actions to modify:

- `addDevotional` — set `updatedAt` on the devotional
- `updateDevotionalDays` — set `updatedAt` on modified days and the parent devotional
- `markDayAsRead` — set `updatedAt` on the day and parent devotional
- `advanceDay` — set `updatedAt` on the devotional
- `addJournalEntry` — already has `updatedAt` in its creation
- `updateJournalEntry` — already sets `updatedAt`
- `addBookmark` / `removeBookmark` — set `updatedAt`
- `addHighlight` / `removeHighlight` — set `updatedAt`
- `addCheckIn` — set `updatedAt`, change ID from `` `checkin_${Date.now()}` `` to `newId()` from `sync-ids.ts`
- `addBibleHighlight` / `updateBibleHighlight` / `removeBibleHighlight` — set `updatedAt`
- `updateBibleReadingPosition` — set `updatedAt`
- `addUsedScripture` — set `updatedAt`
- `addNote` / `updateNote` / `deleteNote` — set `updatedAt`
- `addFolder` / `updateFolder` / `deleteFolder` — set `updatedAt`
- `addSeriesPersonaRecord` — set `updatedAt`
- `addMethodUsageRecord` — set `updatedAt`
- `updateUser` — set a top-level `userUpdatedAt` field (user profile doesn't have `updatedAt`)

For each action, add `updatedAt: new Date().toISOString()` to the object being created or updated. Example pattern:

```typescript
// Before:
addBookmark: (bookmark) => set((state) => ({
  bookmarks: [...state.bookmarks, bookmark],
})),

// After:
addBookmark: (bookmark) => set((state) => ({
  bookmarks: [...state.bookmarks, { ...bookmark, updatedAt: new Date().toISOString() }],
})),
```

- [ ] **Step 3: Write v28→v29 migration**

First, add a static import at the top of `store.ts` (with other imports):

```typescript
import { compositeId, newId } from './sync-ids';
```

Then add after the `version < 28` migration block (around line 1964):

```typescript
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
          if (!day.id) day.id = compositeId(d.id, day.dayNumber);
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

    logger.info('[store] Migration v28→29: Backfilled updatedAt + id for sync');
  } catch (err) {
    console.error('[store] Migration v28→29 failed:', err);
  }
}
```

- [ ] **Step 4: Bump persist version**

Change line ~1655:
```typescript
version: 29, // v29: Add updatedAt + id to all syncable records for cloud sync
```

- [ ] **Step 5: Build and verify no crashes**

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

Wait for build, take screenshot to confirm app loads without red screen:
```bash
sleep 8 && xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(sync): add updatedAt + id to all syncable types, store migration v29"
```

---

### Task 4: Add `updatedAt` to companion chat store + migration

**Files:**
- Modify: `src/lib/companion-chat-store.ts`

- [ ] **Step 1: Add `updatedAt` to Conversation and CompanionMessage interfaces**

```typescript
// Add to CompanionMessage interface (after feedback field):
  updatedAt?: string; // ISO timestamp for sync

// Add to Conversation interface (after archived field):
  updatedAt?: string; // ISO timestamp for sync
```

- [ ] **Step 2: Update actions to set `updatedAt`**

In `addMessage`: set `updatedAt: new Date().toISOString()` on the message and parent conversation.
In `updateMessage`: set `updatedAt: new Date().toISOString()` on the message and parent conversation.
In `setFeedback`: set `updatedAt: new Date().toISOString()` on the message and parent conversation.
In `archiveActiveConversation`: set `updatedAt: new Date().toISOString()` on the conversation.
In `startNewConversation`: set `updatedAt: new Date().toISOString()` on the new conversation.

- [ ] **Step 3: Write v2→v3 migration**

In the persist config (around line 260), change `version: 2` to `version: 3` and update the `migrate` function:

```typescript
version: 3, // v3: Add updatedAt for cloud sync
migrate: (persistedState: unknown, version: number) => {
  const state = persistedState as Partial<CompanionChatState>;
  if (version < 3) {
    const now = new Date().toISOString();
    const conversations = (state as any).conversations ?? [];
    for (const conv of conversations) {
      if (!conv) continue;
      if (!conv.updatedAt) conv.updatedAt = new Date(conv.lastMessageAt || Date.now()).toISOString();
      for (const msg of conv.messages ?? []) {
        if (!msg) continue;
        if (!msg.updatedAt) msg.updatedAt = new Date(msg.timestamp || Date.now()).toISOString();
      }
    }
  }
  return state as CompanionChatState;
},
```

- [ ] **Step 4: Build and verify**

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/companion-chat-store.ts
git commit -m "feat(sync): add updatedAt to companion chat store, migration v3"
```

---

## Phase 2: Backend Schema + Sync API

### Task 5: Add sync tables to Drizzle schema

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/db/schema.ts`

- [ ] **Step 1: Add all 15 sync tables**

Add after existing table definitions. Every table follows the same pattern: UUID primary key, `clerk_user_id` TEXT NOT NULL, `created_at`, `updated_at`, `deleted_at`, `client_updated_at`, plus table-specific columns.

See the full table definitions in the spec: `docs/superpowers/specs/2026-03-28-cloud-sync-design.md` (Database Schema section).

Use Drizzle's `pgTable` syntax matching the existing `stories` and `aiUsage` patterns. Example:

```typescript
import { pgTable, text, uuid, timestamp, boolean, integer, jsonb, real, varchar, serial, uniqueIndex, index } from 'drizzle-orm/pg-core';

// Common sync columns helper
const syncColumns = {
  id: uuid('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
};

export const syncUsers = pgTable('sync_users', {
  ...syncColumns,
  name: text('name'),
  aboutMe: text('about_me'),
  // ... all user fields as JSONB for settings, streak, etc.
  settings: jsonb('settings'),
  streakData: jsonb('streak_data'),
  reviewPromptData: jsonb('review_prompt_data'),
  notificationSchedule: jsonb('notification_schedule'),
}, (table) => [
  index('sync_users_clerk_idx').on(table.clerkUserId),
]);

// ... repeat for all 15 tables per spec
```

Tables to create: `sync_users`, `sync_devotionals`, `sync_devotional_days`, `sync_journal_entries`, `sync_bookmarks`, `sync_highlights`, `sync_bible_highlights`, `sync_bible_reading_positions`, `sync_check_ins`, `sync_notes`, `sync_note_folders`, `sync_companion_conversations`, `sync_companion_messages`, `sync_used_scriptures`, `sync_series_persona_history`, `sync_method_usage_history`.

Prefix with `sync_` to avoid collision with any future app tables.

- [ ] **Step 2: Generate and apply migration**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run db:generate
npm run db:push
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(sync): add 15 sync tables to Drizzle schema"
```

---

### Task 6: Create sync route handler

**Files:**
- Create: `/Users/galangster/clawd/work/unfold/backend/src/routes/sync.ts`

- [ ] **Step 1: Create sync.ts with push endpoint**

```typescript
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, gt } from 'drizzle-orm';
import * as schema from '../db/schema';
import { logger } from '../utils/logger'; // or console

const router = Router();

// DB guard
router.use((req: Request, res: Response, next) => {
  if (!db) {
    res.status(503).json({ error: { code: 'DB_UNAVAILABLE' } });
    return;
  }
  next();
});

// Table name → Drizzle table mapping
const SYNC_TABLES: Record<string, any> = {
  users: schema.syncUsers,
  devotionals: schema.syncDevotionals,
  devotional_days: schema.syncDevotionalDays,
  journal_entries: schema.syncJournalEntries,
  bookmarks: schema.syncBookmarks,
  highlights: schema.syncHighlights,
  bible_highlights: schema.syncBibleHighlights,
  bible_reading_positions: schema.syncBibleReadingPositions,
  check_ins: schema.syncCheckIns,
  notes: schema.syncNotes,
  note_folders: schema.syncNoteFolders,
  companion_conversations: schema.syncCompanionConversations,
  companion_messages: schema.syncCompanionMessages,
  used_scriptures: schema.syncUsedScriptures,
  series_persona_history: schema.syncSeriesPersonaHistory,
  method_usage_history: schema.syncMethodUsageHistory,
};

const ALLOWED_TABLES = new Set(Object.keys(SYNC_TABLES));

// POST /api/sync/push
router.post('/push', async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const { changes } = req.body;

  if (!Array.isArray(changes) || changes.length === 0) {
    res.status(400).json({ error: 'changes must be a non-empty array' });
    return;
  }

  // Cap batch size
  if (changes.length > 500) {
    res.status(400).json({ error: 'max 500 changes per push' });
    return;
  }

  // All writes in a single Postgres transaction per spec
  const results = await db!.transaction(async (tx) => {
    const txResults = [];

    for (const change of changes) {
      const { table, id, data, clientUpdatedAt, deleted } = change;

      if (!ALLOWED_TABLES.has(table)) {
        txResults.push({ table, id, status: 'rejected', reason: 'invalid table' });
        continue;
      }

      const drizzleTable = SYNC_TABLES[table];

      try {
        // Look up existing record
        const existing = await tx
          .select()
          .from(drizzleTable)
          .where(and(eq(drizzleTable.id, id), eq(drizzleTable.clerkUserId, uid)))
          .limit(1);

        if (existing.length === 0) {
          // INSERT
          await tx.insert(drizzleTable).values({
            id,
            clerkUserId: uid,
            ...data,
            clientUpdatedAt: new Date(clientUpdatedAt),
            updatedAt: new Date(),
            deletedAt: deleted ? new Date() : null,
          });
          txResults.push({ table, id, serverUpdatedAt: new Date().toISOString(), status: 'accepted' });
        } else {
          const serverRecord = existing[0];
          const serverUpdatedAt = new Date(serverRecord.updatedAt).getTime();
          const clientTime = new Date(clientUpdatedAt).getTime();

          if (serverUpdatedAt <= clientTime) {
            // Client wins — UPDATE
            await tx
              .update(drizzleTable)
              .set({
                ...data,
                clientUpdatedAt: new Date(clientUpdatedAt),
                updatedAt: new Date(),
                deletedAt: deleted ? new Date() : null,
              })
              .where(and(eq(drizzleTable.id, id), eq(drizzleTable.clerkUserId, uid)));
            txResults.push({ table, id, serverUpdatedAt: new Date().toISOString(), status: 'accepted' });
          } else {
            // Server wins — CONFLICT
            txResults.push({
              table,
              id,
              serverUpdatedAt: serverRecord.updatedAt,
              status: 'conflict',
              serverData: serverRecord,
            });
          }
        }
      } catch (err) {
        console.error(`[sync/push] Error for ${table}:${id}:`, err);
        txResults.push({ table, id, status: 'error', reason: 'internal' });
      }
    }

    return txResults;
  });

  res.json({ results });
});

// POST /api/sync/pull
router.post('/pull', async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const { lastPulledAt } = req.body;

  const timestamp = new Date().toISOString();
  const since = lastPulledAt ? new Date(lastPulledAt) : null;

  const changes: Record<string, any[]> = {};

  for (const [tableName, drizzleTable] of Object.entries(SYNC_TABLES)) {
    try {
      let rows;
      if (since) {
        rows = await db!
          .select()
          .from(drizzleTable)
          .where(and(eq(drizzleTable.clerkUserId, uid), gt(drizzleTable.updatedAt, since)));
      } else {
        // First sync — get everything
        rows = await db!
          .select()
          .from(drizzleTable)
          .where(eq(drizzleTable.clerkUserId, uid));
      }

      if (rows.length > 0) {
        changes[tableName] = rows.map((row: any) => ({
          id: row.id,
          data: row,
          updatedAt: row.updatedAt,
          deleted: !!row.deletedAt,
        }));
      }
    } catch (err) {
      console.error(`[sync/pull] Error for ${tableName}:`, err);
    }
  }

  res.json({ changes, timestamp });
});

export default router;
```

- [ ] **Step 2: Register sync routes in index.ts**

In `/Users/galangster/clawd/work/unfold/backend/src/index.ts`, add after other route imports:

```typescript
import syncRouter from './routes/sync';
```

And in the route registration section:

```typescript
app.use('/api/sync', authMiddleware, rateLimitMiddleware, syncRouter);
```

- [ ] **Step 3: Add sync cost group to rate limiter**

In `/Users/galangster/clawd/work/unfold/backend/src/middleware/rate-limit.ts`:

1. Add `"db-write"` to the `CostGroup` union type:
```typescript
type CostGroup = "ai-expensive" | "ai-moderate" | "ai-cheap" | "companion" | "tts" | "db-read" | "db-write" | "misc" | "health";
```

2. Add the `db-write` rate limiter to `perMinuteLimiters` (after the `db-read` entry):
```typescript
"db-write": new RateLimiterMemory({
  keyPrefix: "rl-db-write-min",
  points: 20,
  duration: 60, // 20 sync pushes per minute
}),
```

3. Add to `ENDPOINT_GROUPS`:
```typescript
'/api/sync/push': 'db-write',
'/api/sync/pull': 'db-read',
```

- [ ] **Step 4: Test endpoints locally**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run dev
```

Test with curl:
```bash
# Push test (will fail auth in dev mode, but should return 200 with dev-user)
curl -X POST http://localhost:3001/api/sync/pull \
  -H "Content-Type: application/json" \
  -d '{"lastPulledAt": null}'
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/sync.ts src/index.ts src/middleware/rate-limit.ts
git commit -m "feat(sync): add push/pull API endpoints"
```

---

## Phase 3: Client SyncService

### Task 7: Create SyncService module

**Files:**
- Create: `src/lib/sync-service.ts`

- [ ] **Step 1: Create sync-service.ts**

This is the core sync engine. It:
1. Subscribes to both Zustand stores
2. Maintains a dirty set in a separate MMKV key
3. Pushes dirty records on a 15-second debounced timer
4. Pulls changes on a 15-second offset timer and on app foreground
5. Handles first sync (full download)

Key implementation details:
- Use `mmkvStorage` for dirty set persistence (key: `unfold-sync-dirty`)
- Use `mmkvStorage` for `lastPulledAt` persistence (key: `unfold-sync-last-pulled`)
- Use `NetInfo` from `@react-native-community/netinfo` for connectivity detection
- Use `AppState` for foreground/background detection
- Companion store timestamps must be converted: `new Date(epochMs).toISOString()` on push, `new Date(isoString).getTime()` on pull
- Only push records with status `complete` or `error` for companion messages (skip `streaming`, `sending`)
- Clerk token obtained via the existing `getToken()` bridge in `clerk.ts`

```typescript
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

  /** Start sync engine — uses getClerkToken() from clerk.ts for auth */
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
  }

  stop() {
    this.isRunning = false;
    if (this.pushTimer) clearInterval(this.pushTimer);
    if (this.pullTimer) clearInterval(this.pullTimer);
    this.unsubscribeMain?.();
    this.unsubscribeCompanion?.();
    this.unsubscribeNetInfo?.();
    this.unsubscribeAppState?.remove();
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

  /** Slices to watch in the main store, with their table name and ID accessor */
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
    { key: 'noteFolders', table: 'note_folders', getId: (r) => r.id },
    { key: 'usedScriptures', table: 'used_scriptures', getId: (r) => r.id },
    { key: 'seriesPersonaHistory', table: 'series_persona_history', getId: (r) => r.id },
    { key: 'methodUsageHistory', table: 'method_usage_history', getId: (r) => r.id },
  ];

  private onMainStoreChange(state: any, prevState: any) {
    // Check user profile changes
    if (state.userUpdatedAt !== prevState.userUpdatedAt && state.userUpdatedAt) {
      this.markDirty('users', state.clerkUserId || 'self', state.userUpdatedAt);
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
      // Convert epoch → ISO for dirty record timestamp
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

    // Lookup tables: stateKey → array of records (or special handling)
    const MAIN_LOOKUP: Record<string, string> = {
      devotionals: 'devotionals', journal_entries: 'journalEntries',
      bookmarks: 'bookmarks', highlights: 'highlights',
      bible_highlights: 'bibleHighlights', bible_reading_positions: 'bibleReadingHistory',
      check_ins: 'checkIns', notes: 'notes', note_folders: 'noteFolders',
      used_scriptures: 'usedScriptures', series_persona_history: 'seriesPersonaHistory',
      method_usage_history: 'methodUsageHistory',
    };

    for (const [, dirty] of this.dirtySet) {
      let data: Record<string, unknown> | null = null;

      if (dirty.table === 'users') {
        // Serialize user profile from root state
        const { name, aboutMe, settings, streakData } = mainState;
        data = { name, aboutMe, settings, streakData };
      } else if (dirty.table === 'devotional_days') {
        // Find nested day inside devotionals
        for (const devo of mainState.devotionals ?? []) {
          const day = (devo.days ?? []).find((d: any) => d.id === dirty.id);
          if (day) { data = { ...day, devotionalId: devo.id }; break; }
        }
      } else if (dirty.table === 'companion_conversations') {
        const conv = companionState.conversations?.find((c: any) => c.id === dirty.id);
        if (conv) {
          // Convert epoch ms → ISO for server
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
          // Server wins — apply server data to local store
          this.applyServerRecord(result.table, result.serverData);
          this.dirtySet.delete(key);
        }
      }

      this.saveDirtySet();
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

      // Apply changes to stores — parent tables first so child records
      // (devotional_days, companion_messages) find their parents
      const TABLE_ORDER: SyncTable[] = [
        'users', 'devotionals', 'devotional_days',
        'journal_entries', 'bookmarks', 'highlights',
        'bible_highlights', 'bible_reading_positions', 'check_ins',
        'notes', 'note_folders',
        'companion_conversations', 'companion_messages',
        'used_scriptures', 'series_persona_history', 'method_usage_history',
      ];

      for (const table of TABLE_ORDER) {
        const records = data.changes[table];
        if (!records) continue;
        for (const record of records) {
          if (record.deleted) {
            this.removeLocalRecord(table, record.id);
          } else {
            this.applyServerRecord(table, record.data);
          }
        }
      }

      mmkvStorage.setItem(SYNC_LAST_PULLED_KEY, data.timestamp);
    } catch (err) {
      logger.warn('[sync] Pull error:', err);
    }
  }

  // --- Apply server data to local stores ---

  private applyServerRecord(table: SyncTable, data: any) {
    // Route to correct store based on table name
    if (table === 'companion_conversations' || table === 'companion_messages') {
      // Companion store — convert ISO → epoch ms for timestamps
      const companionState = useCompanionChatStore.getState();
      if (table === 'companion_conversations') {
        const convData = {
          ...data,
          createdAt: new Date(data.createdAt).getTime(),
          lastMessageAt: new Date(data.lastMessageAt).getTime(),
        };
        const idx = companionState.conversations.findIndex((c: any) => c.id === data.id);
        const updated = [...companionState.conversations];
        if (idx >= 0) updated[idx] = { ...updated[idx], ...convData };
        else updated.unshift(convData);
        useCompanionChatStore.setState({ conversations: updated });
      }
      // companion_messages: find parent conversation, update/add message
      if (table === 'companion_messages') {
        const msgData = { ...data, timestamp: new Date(data.timestamp).getTime() };
        const convs = [...companionState.conversations];
        for (const conv of convs) {
          const msgIdx = conv.messages.findIndex((m: any) => m.id === data.id);
          if (msgIdx >= 0) { conv.messages[msgIdx] = { ...conv.messages[msgIdx], ...msgData }; break; }
        }
        useCompanionChatStore.setState({ conversations: convs });
      }
      return;
    }

    // Main store — use setState to merge
    const state = useUnfoldStore.getState();

    // Routing table: SyncTable → { stateKey, merge }
    const MAIN_ROUTES: Record<string, string> = {
      users: '_user', devotionals: 'devotionals', devotional_days: '_nested',
      journal_entries: 'journalEntries', bookmarks: 'bookmarks',
      highlights: 'highlights', bible_highlights: 'bibleHighlights',
      bible_reading_positions: 'bibleReadingHistory', check_ins: 'checkIns',
      notes: 'notes', note_folders: 'noteFolders',
      used_scriptures: 'usedScriptures', series_persona_history: 'seriesPersonaHistory',
      method_usage_history: 'methodUsageHistory',
    };

    const stateKey = MAIN_ROUTES[table];
    if (!stateKey) return;

    if (stateKey === '_user') {
      // Merge into user profile fields at state root
      useUnfoldStore.setState({ ...data, userUpdatedAt: data.updatedAt });
      return;
    }

    if (stateKey === '_nested') {
      // devotional_days: find parent devotional by data.devotionalId, update/add day
      const devos = [...(state as any).devotionals];
      const devo = devos.find((d: any) => d.id === data.devotionalId);
      if (devo) {
        const dayIdx = devo.days.findIndex((d: any) => d.id === data.id);
        if (dayIdx >= 0) devo.days[dayIdx] = { ...devo.days[dayIdx], ...data };
        else devo.days.push(data);
        useUnfoldStore.setState({ devotionals: devos });
      }
      return;
    }

    // Standard array merge: find by id, update or append
    const arr = [...((state as any)[stateKey] ?? [])];
    const idx = arr.findIndex((r: any) => r.id === data.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...data };
    else arr.push(data);
    useUnfoldStore.setState({ [stateKey]: arr });
  }

  private removeLocalRecord(table: SyncTable, id: string) {
    if (table === 'companion_conversations') {
      const convs = useCompanionChatStore.getState().conversations.filter((c: any) => c.id !== id);
      useCompanionChatStore.setState({ conversations: convs });
      return;
    }
    if (table === 'companion_messages') {
      const convs = [...useCompanionChatStore.getState().conversations];
      for (const conv of convs) {
        conv.messages = conv.messages.filter((m: any) => m.id !== id);
      }
      useCompanionChatStore.setState({ conversations: convs });
      return;
    }

    const MAIN_ROUTES: Record<string, string> = {
      devotionals: 'devotionals', journal_entries: 'journalEntries',
      bookmarks: 'bookmarks', highlights: 'highlights',
      bible_highlights: 'bibleHighlights', bible_reading_positions: 'bibleReadingHistory',
      check_ins: 'checkIns', notes: 'notes', note_folders: 'noteFolders',
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
      useUnfoldStore.setState({ devotionals: devos });
      return;
    }

    const arr = ((useUnfoldStore.getState() as any)[stateKey] ?? []).filter((r: any) => r.id !== id);
    useUnfoldStore.setState({ [stateKey]: arr });
  }
}

export const syncService = new SyncService();
```

Note: `@react-native-community/netinfo` v11.5.2 is already installed — no need to add it.

- [ ] **Step 2: Initialize SyncService in _layout.tsx**

In `src/app/_layout.tsx`, import and start the sync service after Clerk is loaded and user is authenticated:

```typescript
import { syncService } from '@/lib/sync-service';

// Inside the component, after useAuth():
useEffect(() => {
  if (userId) {
    syncService.start();
    return () => syncService.stop();
  }
}, [userId]);
```

- [ ] **Step 3: Build and verify**

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync-service.ts src/app/_layout.tsx
git commit -m "feat(sync): add SyncService with push/pull cycle and store subscriptions"
```

---

## Phase 4: Guest Mode Removal

### Task 8: Remove guest mode infrastructure

**Files:**
- Modify: `src/lib/clerk.ts` — remove `continueAsGuest()`
- Modify: `src/hooks/useAuth.ts` — remove `isAnonymous`, guest fallback
- Modify: `src/lib/store.ts` — remove `'guest'` from `authProvider` union
- Modify: `src/lib/analytics.ts` — remove `SIGN_IN_SKIPPED` event
- Modify: `src/lib/api-config.ts` — remove guest mode fallback comments
- Modify: `src/app/generating.tsx` — remove `authProvider === 'guest'` check
- Modify: `src/app/(tabs)/(you)/settings.tsx` — remove guest sign-in section
- Modify: `src/app/(tabs)/(today)/reading.tsx` — remove `SignInSheet` import, `showSignInSheet` state, and `<SignInSheet>` component usage
- Delete: `src/components/SignInSheet.tsx` — entire file (guest-to-auth conversion sheet, no longer needed)

- [ ] **Step 1: Remove `continueAsGuest()` from clerk.ts**

Search for and delete the `continueAsGuest` function and any references.

- [ ] **Step 2: Remove guest checks from useAuth.ts**

Remove `isAnonymous` computed property and any `storeProvider === 'guest'` logic.

- [ ] **Step 3: Remove `'guest'` from authProvider union in store.ts**

Change:
```typescript
authProvider?: 'apple' | 'google' | 'facebook' | 'guest' | null;
```
To:
```typescript
authProvider?: 'apple' | 'google' | 'facebook' | null;
```

- [ ] **Step 4: Remove SignInSheet.tsx and its references in reading.tsx**

Delete `src/components/SignInSheet.tsx` entirely. In `src/app/(tabs)/(today)/reading.tsx`, remove:
- `import { SignInSheet } from '@/components/SignInSheet';`
- `const [showSignInSheet, setShowSignInSheet] = useState(false);`
- All `setShowSignInSheet(true)` calls
- The `<SignInSheet visible={showSignInSheet} ...>` JSX

- [ ] **Step 5: Clean up api-config.ts guest comments**

In `src/lib/api-config.ts`, remove guest mode fallback comments (e.g., "guest mode, requests will get 401").

- [ ] **Step 6: Clean up remaining guest references**

Search for `guest` across the codebase and remove any dead code paths:
```bash
grep -rn "guest" --include="*.ts" --include="*.tsx" src/ | grep -v node_modules
```

- [ ] **Step 7: Build and verify**

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/clerk.ts src/hooks/useAuth.ts src/lib/store.ts src/lib/analytics.ts src/lib/api-config.ts src/app/generating.tsx src/app/(tabs)/(you)/settings.tsx src/app/(tabs)/(today)/reading.tsx
git rm src/components/SignInSheet.tsx
git commit -m "chore: remove guest mode infrastructure (sign-in now required)"
```

---

## Execution Order

1. **Task 1** → Task 2 → Task 3 → Task 4 (Phase 1: client store migration — no backend dependency)
2. **Task 5** → Task 6 (Phase 2: backend — can be done in parallel with Phase 1)
3. **Task 7** (Phase 3: client sync engine — depends on Phase 1 + 2)
4. **Task 8** (Phase 4: cleanup — independent, can be done anytime)

Tasks 1-4 and Tasks 5-6 can be executed in parallel by separate agents.
