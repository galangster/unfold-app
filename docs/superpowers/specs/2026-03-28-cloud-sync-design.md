# Unfold Cloud Sync Design Spec

**Goal:** Sync all user-generated data across devices via Railway Postgres, keyed by Clerk user ID, using a local-first optimistic architecture.

**Decision date:** 2026-03-28

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cloud store | Railway Postgres | Auth-provider-agnostic (Apple, Google, Facebook via Clerk) |
| Sync model | Local-first, optimistic | App works fully offline; MMKV is on-device source of truth |
| Conflict resolution | Last-write-wins via timestamps | Simple, deterministic, low-stakes for text data |
| Multi-device | Designed from day 1 | iPhone today, iPad and macOS planned |
| Sync UX | Invisible/automatic | No sync buttons, no progress indicators |
| Guest mode | Remove entirely | Every user must sign in; simplifies sync architecture |
| Sync scope | Everything | All user data syncs (see full audit below) |
| Account deletion | Soft delete, 30-day grace | User can recover within 30 days |
| Sync approach | Change tracking with timestamps | Per-record `updatedAt`/`syncedAt`, incremental push/pull |
| OAuth branding | Custom credentials (pre-production) | Replace Clerk shared credentials so Google shows "Unfold" |

---

## Architecture Overview

```
[MMKV (encrypted)] <-> [Zustand Store] <-> [SyncService] <-> [POST /api/sync/*] <-> [Railway Postgres]
                                                |
                                           Dirty Set (MMKV)
                                           lastPulledAt (MMKV)
```

- **Zustand store** remains the app's data layer. Components read/write through Zustand as they do today.
- **SyncService** is a new background module that subscribes to store changes, maintains a dirty set, and pushes/pulls on a timer.
- **Backend** gets new Drizzle tables and two sync endpoints (`push` and `pull`).

---

## Database Schema

All tables share common sync columns:

```sql
id            UUID PRIMARY KEY,        -- client-generated, matches MMKV IDs
clerk_user_id TEXT NOT NULL,           -- from Clerk JWT (never client-supplied)
created_at    TIMESTAMPTZ DEFAULT NOW(),
updated_at    TIMESTAMPTZ DEFAULT NOW(), -- server-set on every write
deleted_at    TIMESTAMPTZ,             -- null unless soft-deleted
client_updated_at TIMESTAMPTZ,         -- client's updatedAt for LWW comparison
```

### Tables

#### `users`
Stores user profile, all preferences, streak data, notification settings, review prompt state, Bible reader settings, companion settings, and generation tracking.

| Column | Type | Notes |
|--------|------|-------|
| `clerk_user_id` | TEXT UNIQUE | Primary key for user lookup |
| `name` | TEXT | Display name |
| `about_me` | TEXT | Bio from onboarding |
| `persona_traits` | JSONB | Selected personality traits array |
| `current_situation` | TEXT | Life context |
| `emotional_state` | TEXT | Spiritual/emotional state |
| `spiritual_seeking` | TEXT | What they're seeking |
| `profile_picture_url` | TEXT | Cloud URL (uploaded separately) |
| `auth_provider` | TEXT | apple/google/facebook |
| `auth_email` | TEXT | Email from provider |
| `auth_display_name` | TEXT | Name from provider |
| `has_completed_onboarding` | BOOLEAN | |
| `has_completed_style_onboarding` | BOOLEAN | |
| `is_premium` | BOOLEAN | RevenueCat is canonical; this is a cache |
| `has_consented_to_ai` | BOOLEAN | App Store compliance |
| `settings` | JSONB | All preferences (see below) |
| `streak_data` | JSONB | Streak state (see below) |
| `review_prompt_data` | JSONB | Review prompt tracking |
| `notification_schedule` | JSONB | Check-in notification config |

**`settings` JSONB structure:**
```json
{
  "readingDuration": 15,
  "devotionalLength": 7,
  "reminderTime": "07:00",
  "fontSize": "medium",
  "writingStyle": { "tone": "warm", "depth": "balanced", "faithBackground": "growing", "lifeStage": "building" },
  "bibleTranslation": "BSB",
  "themeMode": "system",
  "accentTheme": "default",
  "readingFont": "serif",
  "preferredVoice": "arman",
  "selectedTheme": "growth",
  "selectedType": "reflection",
  "selectedStudySubject": null,
  "bibleReaderSettings": {
    "fontSize": 18,
    "lineHeightMultiplier": 1.6,
    "showVerseNumbers": true,
    "paragraphMode": false,
    "translation": "BSB"
  },
  "companionName": null,
  "lastCompanionCheckInDate": null,
  "middayCheckInEnabled": true,
  "eveningWindDownEnabled": true,
  "middayCheckInTime": "12:00",
  "eveningWindDownTime": "21:00",
  "middayCheckInByDay": null,
  "eveningWindDownByDay": null
}
```

**`streak_data` JSONB structure:**
```json
{
  "lastReadDate": "2026-03-28",
  "current": 12,
  "longest": 30,
  "graceDaysUsedThisWeek": 0,
  "weekStart": "2026-03-23",
  "weekendAmnesty": false,
  "freezes": 0
}
```

**`review_prompt_data` JSONB structure:**
```json
{
  "lastDate": null,
  "count": 0,
  "hasReviewed": false,
  "hasSeenDay1Review": false,
  "daysAtLastPrompt": 0
}
```

#### `devotionals`
One row per generated devotional series.

| Column | Type | Notes |
|--------|------|-------|
| `title` | TEXT | Series title |
| `total_days` | INTEGER | Target length |
| `current_day` | INTEGER | Reading position |
| `user_context` | JSONB | Snapshot of user state at generation time |
| `theme_category` | TEXT | Theme categorization |
| `devotional_type` | TEXT | reflection/study/etc. |
| `study_subject` | TEXT | If study type |
| `generation_mode` | TEXT | batch/progressive |
| `used_story_ids` | JSONB | Array of story IDs for dedup |
| `series_arc` | JSONB | Full SeriesArc object (progressive only) |
| `progressive_memory` | JSONB | Full ProgressiveMemory object (progressive only) |

#### `devotional_days`
One row per day of content within a series.

| Column | Type | Notes |
|--------|------|-------|
| `devotional_id` | UUID FK | References devotionals.id |
| `day_number` | INTEGER | 1-based index |
| `title` | TEXT | Day title |
| `scripture_reference` | TEXT | Bible passage ref |
| `scripture_text` | TEXT | Full scripture text |
| `body_text` | TEXT | Main devotional content |
| `quotable_line` | TEXT | Highlighted quote |
| `is_read` | BOOLEAN | Completion status |
| `read_at` | TIMESTAMPTZ | When read |
| `content` | JSONB | All other fields: quotes, crossReferences, reflectionQuestions, contextNote, wordStudy, closingPrayer, checkInQuestion, checkInChips, eveningScriptureRef, studyMethod, contextSignals, storyId, seriesReflectionSummary, closureArchetype, generatedAt |

UNIQUE constraint: `(devotional_id, day_number)`

#### `journal_entries`
One row per journal/reflection entry.

| Column | Type | Notes |
|--------|------|-------|
| `devotional_id` | UUID FK | References devotionals.id |
| `day_number` | INTEGER | Day reference |
| `content` | TEXT | Freeform text |
| `journal_mode` | TEXT | freewrite/soap/guided |
| `soap_responses` | JSONB | S.O.A.P. method fields |
| `question_responses` | JSONB | Go Deeper Q&A |
| `prayer_requests` | JSONB | Inline prayer requests |
| `deeper_questions` | JSONB | Persisted question list |

#### `bookmarks`

| Column | Type | Notes |
|--------|------|-------|
| `devotional_id` | UUID FK | References devotionals.id |
| `devotional_title` | TEXT | Title snapshot |
| `day_number` | INTEGER | Day reference |
| `day_title` | TEXT | Day title snapshot |
| `scripture_reference` | TEXT | Bible ref |
| `scripture_text` | TEXT | Full verse text |
| `saved_at` | TIMESTAMPTZ | When bookmarked |

#### `highlights`

| Column | Type | Notes |
|--------|------|-------|
| `devotional_id` | UUID FK | References devotionals.id |
| `devotional_title` | TEXT | Title snapshot |
| `day_number` | INTEGER | Day reference |
| `day_title` | TEXT | Day title snapshot |
| `highlighted_text` | TEXT | Selected text |
| `serialized_range` | TEXT | Rangy format range |
| `color` | TEXT | yellow/green/blue/purple/red |
| `context_before` | TEXT | Surrounding text |
| `context_after` | TEXT | Surrounding text |

#### `bible_highlights`

| Column | Type | Notes |
|--------|------|-------|
| `book_id` | INTEGER | Book ID |
| `book_name` | TEXT | Book name |
| `chapter` | INTEGER | Chapter |
| `verse_start` | INTEGER | Start verse |
| `verse_end` | INTEGER | End verse |
| `text` | TEXT | Highlighted text |
| `color` | TEXT | Highlight color |
| `note` | TEXT | User's note |
| `translation` | TEXT | BSB/KJV/WEB |

#### `bible_reading_positions`

| Column | Type | Notes |
|--------|------|-------|
| `book_id` | INTEGER | Book ID |
| `book_name` | TEXT | Book name |
| `chapter` | INTEGER | Last chapter read |
| `translation` | TEXT | Translation used |
| `last_read_at` | TIMESTAMPTZ | When last read |

UNIQUE constraint: `(clerk_user_id, book_id, translation)`

#### `check_ins`

| Column | Type | Notes |
|--------|------|-------|
| `devotional_id` | UUID FK | References devotionals.id |
| `day_number` | INTEGER | Day reference |
| `mood` | INTEGER | 1-8 scale |
| `mood_label` | TEXT | Label text |
| `chip_answer` | TEXT | Selected chip |
| `free_text` | TEXT | Free response |
| `time_of_day` | TEXT | morning/midday/evening/companion |

#### ~~`prayer_requests`~~ — REMOVED

No global prayer list exists client-side. Prayer requests are inline within `journal_entries.prayer_requests` (JSONB array). They sync as part of the journal entry — no separate table needed.

If a standalone prayer list feature is added later (see `project_unfold_prayer_list_feature.md`), a dedicated table can be introduced at that time.

#### `notes`

| Column | Type | Notes |
|--------|------|-------|
| `title` | TEXT | Note title |
| `content` | TEXT | Note body |
| `category` | TEXT | sermon/quiet-time/study/prayer/general |
| `tags` | JSONB | Free-form tag array |
| `is_favorite` | BOOLEAN | Starred |
| `scripture_refs` | JSONB | Linked scripture references |
| `devotional_id` | TEXT | If linked to devotional |
| `day_number` | INTEGER | If linked to day |
| `bible_book_id` | INTEGER | If from Bible reader |
| `bible_chapter` | INTEGER | If from Bible reader |
| `folder_id` | UUID FK | Folder assignment |

#### `note_folders`

| Column | Type | Notes |
|--------|------|-------|
| `name` | TEXT | Folder name |
| `color` | TEXT | Color designation |
| `parent_id` | UUID | Parent folder (subfolder support) |
| `sort_order` | INTEGER | Display order |

#### `companion_conversations`

| Column | Type | Notes |
|--------|------|-------|
| `last_message_at` | TIMESTAMPTZ | Last activity |
| `summary` | TEXT | Auto-generated summary |
| `topic_tags` | JSONB | Topic categorization |
| `archived` | BOOLEAN | Archived status |

#### `companion_messages`

| Column | Type | Notes |
|--------|------|-------|
| `conversation_id` | UUID FK | References companion_conversations.id |
| `role` | TEXT | user/companion |
| `content` | TEXT | Message text |
| `timestamp` | TIMESTAMPTZ | When sent |
| `status` | TEXT | sending/sent/streaming/complete/error |
| `citations` | JSONB | Bible verse citations array |
| `suggestions` | JSONB | Follow-up suggestions array |
| `feedback` | TEXT | positive/negative/null |

#### `used_scriptures`

| Column | Type | Notes |
|--------|------|-------|
| `reference` | TEXT | Scripture ref string |
| `book` | TEXT | Book name |
| `used_at` | TIMESTAMPTZ | When used |
| `devotional_id` | UUID FK | References devotionals.id |

#### `series_persona_history`

| Column | Type | Notes |
|--------|------|-------|
| `devotional_id` | UUID FK | References devotionals.id |
| `primary_trait` | TEXT | Primary persona |
| `secondary_trait` | TEXT | Secondary persona |
| `template_seed` | INTEGER | Random seed |

#### `method_usage_history`

| Column | Type | Notes |
|--------|------|-------|
| `method_id` | TEXT | Study method ID |
| `devotional_id` | UUID FK | References devotionals.id |
| `day_number` | INTEGER | Day reference |
| `used_at` | TIMESTAMPTZ | When used |

---

## ID Generation Strategy

Several store types currently lack explicit `id` fields. Each needs a stable, unique identifier for sync:

| Type | Current state | Strategy |
|------|--------------|----------|
| `DevotionalDay` | No `id`, identified by `(devotionalId, dayNumber)` | **Composite key:** generate deterministic UUID from `uuidv5(devotionalId + ":" + dayNumber)` during migration. Server uses `UNIQUE(devotional_id, day_number)` constraint. |
| `BibleReadingPosition` | No `id`, identified by `(bookId, translation)` | **Composite key:** `uuidv5(bookId + ":" + translation)`. Server uses `UNIQUE(clerk_user_id, book_id, translation)`. |
| `UsedScripture` | No `id`, identified by `(reference, devotionalId)` | **Composite key:** `uuidv5(reference + ":" + devotionalId)`. |
| `SeriesPersonaRecord` | No `id`, identified by `devotionalId` | **Composite key:** `uuidv5("persona:" + devotionalId)`. |
| `MethodUsageRecord` | No `id`, identified by `(methodId, devotionalId, dayNumber)` | **Composite key:** `uuidv5(methodId + ":" + devotionalId + ":" + dayNumber)`. |
| `CheckIn` | No `id`, identified by `(devotionalId, dayNumber, timeOfDay)` | **Composite key:** `uuidv5(devotionalId + ":" + dayNumber + ":" + timeOfDay)`. |

All other types (`Devotional`, `JournalEntry`, `Bookmark`, `Highlight`, `BibleHighlight`, `Note`, `NoteFolder`, companion types) already have UUIDs.

**Implementation:** Add `id` field to each type's interface. Run a one-time migration (persist version bump) that generates deterministic UUIDs for all existing records using `uuid` library's v5 namespace. New records get `uuid.v4()` at creation time.

---

## Migration Plan: Adding `updatedAt`

Most syncable types lack `updatedAt` timestamps. This must be backfilled before sync can work.

**Approach:** Bump Zustand persist version (currently v28 → v29) with a migration function that:

1. Iterates all syncable arrays/objects in the store
2. Adds `updatedAt: new Date().toISOString()` to any record missing it
3. Adds `id: uuidv5(compositeKey)` to any record missing it (see ID Generation above)
4. For companion store (separate persist, currently v2 → v3): same migration, but converts existing `number` timestamps to also store an `updatedAt` ISO string

**Going forward:** Every store mutation that modifies a syncable record must set `updatedAt = new Date().toISOString()`. This is enforced by the store's action functions (not by callers).

---

## `devotional_id` Type Consistency

All tables referencing a devotional use `UUID` type with a foreign key to `devotionals.id`:

| Table | Column | Type |
|-------|--------|------|
| `devotional_days` | `devotional_id` | UUID FK → devotionals.id |
| `journal_entries` | `devotional_id` | UUID FK → devotionals.id |
| `bookmarks` | `devotional_id` | UUID FK → devotionals.id |
| `highlights` | `devotional_id` | UUID FK → devotionals.id |
| `check_ins` | `devotional_id` | UUID FK → devotionals.id |
| `used_scriptures` | `devotional_id` | UUID FK → devotionals.id |
| `series_persona_history` | `devotional_id` | UUID FK → devotionals.id |
| `method_usage_history` | `devotional_id` | UUID FK → devotionals.id |

The client store currently uses string IDs for devotionals — these are already UUIDs generated by `uuid.v4()`, so no conversion is needed. The schema just needs to be consistent about declaring them as `UUID FK` rather than `TEXT`.

---

## Data NOT Synced (LOCAL-ONLY)

These fields stay on-device only:

- `generationSession` — in-flight generation state
- `resumeContext` — where to resume reading
- `hasSeenHomeTooltips`, `hasSeenFeatureOnboarding` — onboarding tooltips
- `dismissedMiddayCardDate`, `dismissedEveningCardDate` — daily dismissals
- `nudgeImpressions`, `nudgeShownThisSession`, `nudgeDismissals` — premium upsell tracking
- `justCompletedSeriesTitle` — transient series completion state
- `hasUsedAudio` — device-specific usage flag
- `streakJustReset` — transient nudge flag
- `user.signInPromptCount`, `user.hasSeenSignInPrompt` — session-only
- `activeConversationId` — per-device conversation focus
- `progressiveGeneration.devotionalId`, `currentDayGeneration`, `lastGenerationTriggeredAt` — in-flight generation

---

## Sync Engine (Client)

### SyncService Module

New file: `src/lib/sync-service.ts`

**Responsibilities:**
1. Subscribe to Zustand store mutations
2. Maintain a dirty set in a separate MMKV key (`unfold-sync-dirty`)
3. Push dirty records to server on a timer
4. Pull server changes on a timer and on app foreground
5. Handle first-sync (full download) for new devices

**Dirty Set Structure:**
```typescript
interface DirtyRecord {
  table: string;      // e.g., "journal_entries"
  id: string;         // UUID (or composite key, see ID Generation below)
  updatedAt: string;  // ISO timestamp
}
// Persisted as: Map<string, DirtyRecord> keyed by `${table}:${id}`
```

**Sync Cycle:**
- **Push interval:** Every 15 seconds (debounced from last change)
- **Pull interval:** Every 15 seconds (offset from push)
- **App foreground:** Immediate pull (catch changes from other devices)
- **App background:** Immediate push (flush before suspend)
- **Connectivity restored:** Immediate push + pull via NetInfo listener

**Change Detection:**
- Zustand `subscribe()` fires on every mutation
- SyncService compares previous and current state slices
- Only records with changed `updatedAt` are added to dirty set
- Adding `updatedAt` to all syncable records (where missing) is a prerequisite

### First Sync (New Device)

1. User signs in on fresh device (MMKV is empty)
2. SyncService detects `lastPulledAt` is null
3. Pulls everything from server in a single request
4. Hydrates Zustand store from server response
5. Sets `lastPulledAt` to server timestamp

### Offline Behavior

- All writes go to MMKV immediately (no network dependency)
- Dirty set accumulates while offline
- On connectivity restore, pushes all dirty records
- Pulls any changes from server
- App is fully functional offline at all times

---

## Sync API (Backend)

### `POST /api/sync/push`

**Auth:** Clerk JWT required (extracts `clerkUserId` from token)

```typescript
// Request
{
  changes: Array<{
    table: string;
    id: string;
    data: Record<string, any>;
    clientUpdatedAt: string;  // ISO
    deleted: boolean;
  }>
}

// Response
{
  results: Array<{
    table: string;
    id: string;
    serverUpdatedAt: string;  // ISO
    status: "accepted" | "conflict";
    serverData?: Record<string, any>;  // included if conflict
  }>
}
```

**Logic per change:**
1. Look up existing record by `(table, id, clerkUserId)`
2. If not found: INSERT, return `accepted`
3. If found and server's `updated_at` <= `clientUpdatedAt`: UPDATE, return `accepted`
4. If found and server's `updated_at` > `clientUpdatedAt`: return `conflict` with server's data
5. If `deleted: true`: set `deleted_at = NOW()`, return `accepted`
6. All writes in a single Postgres transaction

### `POST /api/sync/pull`

**Auth:** Clerk JWT required

```typescript
// Request
{
  lastPulledAt: string | null  // null = first sync
}

// Response
{
  changes: {
    users: Array<{ id, data, updatedAt, deleted }>,
    devotionals: [...],
    devotional_days: [...],
    journal_entries: [...],
    bookmarks: [...],
    highlights: [...],
    bible_highlights: [...],
    bible_reading_positions: [...],
    check_ins: [...],
    notes: [...],
    note_folders: [...],
    companion_conversations: [...],
    companion_messages: [...],
    used_scriptures: [...],
    series_persona_history: [...],
    method_usage_history: [...]
  },
  timestamp: string  // server's NOW(), use as next lastPulledAt
}
```

**Logic:**
1. For each table: `SELECT * WHERE clerk_user_id = ? AND updated_at > lastPulledAt`
2. Include soft-deleted records (client needs to know to remove them locally)
3. If `lastPulledAt` is null: return everything for this user
4. `timestamp` is `NOW()` at query start (consistent across all tables)

---

## Conflict Resolution

**Strategy:** Last-write-wins (LWW) using timestamps.

| Scenario | Resolution |
|----------|-----------|
| Same record edited on two devices, both online | First push wins. Second push gets `conflict`, overwrites local with server version. |
| Same record edited on two devices, one offline | Offline device pushes when reconnected. If server has newer version, conflict returned; client takes server version. |
| Delete on device A, edit on device B (offline) | Edit's `clientUpdatedAt` is compared to delete's `updated_at`. Newer timestamp wins. |
| App killed mid-push | Dirty set persists in MMKV. Retry on next launch. Server upserts are idempotent. |
| Clock skew | `clientUpdatedAt` used for conflict detection. Server's `NOW()` is canonical `updated_at`. Minor skew is acceptable for this use case. |
| First sync (empty device) | No conflicts possible. All server data writes to empty MMKV. |
| Sign out | Clear MMKV. Sign back in triggers fresh full pull. |

---

## Companion Chat Changes

### Behavior Changes
- **Welcome screen:** No changes (already exists)
- **Active conversation persists:** Already works this way
- **Auto-archive timer:** Change from 24h to **8 hours** of inactivity
- **Remove 50-conversation hard cap:** Server storage handles scale; paginate the history UI instead
- **Conversation history bug:** Fix — archived conversations must appear in history sheet. This is a prerequisite fix before sync work.
- **Conversation history UX:** Tapping archived conversation reopens it (can continue or just read)

### Sync Behavior
- Conversations and messages sync like all other data
- `companion_conversations` table stores metadata
- `companion_messages` table stores individual messages
- Streaming content (`status: "streaming"`) is NOT synced (partialize middleware already strips it)
- Only `status: "complete"` or `status: "error"` messages sync

### Companion Store Integration
The companion chat lives in a **separate Zustand store** (`companion-chat-store.ts`), not the main store. SyncService must subscribe to BOTH stores:
- Main store: `useStore.subscribe(...)` for all primary data
- Companion store: `useCompanionChatStore.subscribe(...)` for conversations and messages

### Companion Timestamp Conversion
The companion store uses **Unix epoch milliseconds** (`number` type) for all timestamps (e.g., `createdAt: 1711612800000`), while the sync protocol uses ISO 8601 strings. The SyncService must convert at the boundary:
- **Push:** `new Date(epochMs).toISOString()` before sending to server
- **Pull:** `new Date(isoString).getTime()` before writing to companion store
- **Affected fields:** `createdAt`, `lastMessageAt`, `timestamp` on messages

---

## Guest Mode Removal

Remove all dormant guest infrastructure:

| File | Change |
|------|--------|
| `src/lib/clerk.ts` | Remove `continueAsGuest()` function |
| `src/lib/store.ts` | Remove `'guest'` from `authProvider` union type |
| `src/hooks/useAuth.ts` | Remove `isAnonymous`, guest fallback logic |
| `src/components/SignInSheet.tsx` | Delete entire file |
| `src/app/(tabs)/(you)/settings.tsx` | Remove guest sign-in section |
| `src/app/generating.tsx` | Remove `authProvider === 'guest'` check |
| `src/lib/api-config.ts` | Remove guest mode fallback comments |
| `src/lib/analytics.ts` | Remove `SIGN_IN_SKIPPED` event |

**No UI changes needed** — sign-in screen already requires Apple/Google/Facebook.

---

## OAuth Branding (Custom Credentials)

All three SSO providers (Apple, Google, Facebook) currently use Clerk's **shared credentials**, which causes the Google consent screen to show "Sign in to Clerk."

**Fix:** Configure custom OAuth credentials before production deployment:

1. **Google:** Create OAuth 2.0 Client ID in Google Cloud Console for "Unfold"
2. **Apple:** Configure Apple Sign In Service ID in Apple Developer portal
3. **Facebook:** Create Facebook App in Meta Developer Console named "Unfold"
4. Enter custom Client ID / Secret for each provider in Clerk Dashboard > Configure > SSO Connections

This is free on all Clerk plans. Required for production anyway.

---

## Implementation Prerequisites

Before implementing sync:

1. **Store migration (v28 → v29)** — add `id` (UUID) and `updatedAt` (ISO string) to all syncable records that lack them (see ID Generation and Migration Plan sections above)
2. **Companion store migration (v2 → v3)** — add `updatedAt` ISO strings alongside existing epoch timestamps; ensure SyncService converts at boundary
3. **Fix companion chat history bug** — conversations not showing in history sheet (prerequisite for testing sync)
4. **Verify Clerk production instance** — custom OAuth credentials, native API enabled
5. **Railway Postgres capacity** — confirm connection limits and storage for user data tables

## Data Size Estimates

| User type | Estimated data | Initial sync time |
|-----------|---------------|-------------------|
| New user (1 week) | ~50KB | <100ms |
| Regular user (3 months) | ~500KB | <500ms |
| Power user (1 year, 50+ series) | ~3-5MB | <2s |

---

## Security Considerations

- `clerkUserId` is **always extracted from JWT on the server** — never from client payload
- All sync endpoints behind existing `authMiddleware` + `rateLimitMiddleware`
- MMKV encryption (via expo-secure-store) protects data at rest on device
- Postgres data encrypted at rest on Railway
- Soft-deleted data purged after 30 days by a scheduled job
- No secrets in client-side env vars
- Push endpoint validates that `table` is in allowlist (no arbitrary table writes)

---

## Out of Scope

- Real-time push via WebSocket (polling every 15s is sufficient)
- Field-level diffing (whole records sync)
- Retry backoff (natural retry on next cycle)
- iPad/macOS UI (sync infrastructure supports it; UI is separate work)
- Profile picture cloud upload (separate feature; URL syncs, file upload is a different flow)
- App Store Server Notifications (subscription lifecycle — separate from data sync)
