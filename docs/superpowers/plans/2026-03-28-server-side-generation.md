# Server-Side Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all devotional generation from client to server, eliminating iOS background execution failures and adding a daily Reveal screen UX.

**Architecture:** Server-side job queue (PostgreSQL + Express worker) processes generation requests. Client submits jobs and polls for completion. Midnight cron pre-generates next-day content with staggered timing. Push notifications alert users when content is ready.

**Tech Stack:** Express, Drizzle ORM, PostgreSQL, Expo Push API, Clerk auth, Claude Sonnet/Grok APIs, Vitest

---

## Phase 1: Backend

### Task 1: Database schema — generation tables

**Files:**
- `backend/src/db/schema.ts` (modify)

**Steps:**

- [ ] Add 6 new tables to `backend/src/db/schema.ts` after the existing `dynamicPromptExamples` table
- [ ] Run `npm run db:generate` to create migration
- [ ] Run `npm run db:push` to apply to Railway Postgres
- [ ] Verify tables exist with `npm run db:studio`

**Code — append to `backend/src/db/schema.ts`:**

```typescript
// ---------------------------------------------------------------------------
// Server-Side Generation Tables
// ---------------------------------------------------------------------------

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    devotionalId: text("devotional_id").notNull(),
    dayNumber: integer("day_number").notNull(),
    jobType: text("job_type").notNull(), // 'initial_arc' | 'day'
    status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'complete' | 'failed'
    priority: integer("priority").default(0),
    result: jsonb("result"),
    error: text("error"),
    retryCount: integer("retry_count").default(0),
    maxRetries: integer("max_retries").default(3),
    // For initial_arc jobs, store the user context needed to generate
    inputData: jsonb("input_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // Partial unique index: only prevent duplicates for active jobs
    // Note: Drizzle doesn't support WHERE clauses on indexes natively.
    // We create this via a raw SQL migration (see below).
    index("idx_generation_jobs_status").on(table.status),
    index("idx_generation_jobs_user").on(table.userId),
    index("idx_generation_jobs_devotional").on(table.devotionalId),
  ]
);

export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;

export const userGenerationConfig = pgTable(
  "user_generation_config",
  {
    userId: text("user_id").primaryKey(),
    timezone: text("timezone").notNull().default("America/Chicago"),
    preferredNotificationTime: text("preferred_notification_time").default("07:00"),
    staggerOffsetMinutes: integer("stagger_offset_minutes"),
    expoPushToken: text("expo_push_token"),
    lastGenerationDate: text("last_generation_date"), // YYYY-MM-DD in user's timezone
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

export type UserGenerationConfig = typeof userGenerationConfig.$inferSelect;
export type NewUserGenerationConfig = typeof userGenerationConfig.$inferInsert;

export const progressiveMemory = pgTable(
  "progressive_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    devotionalId: text("devotional_id").notNull(),
    layer: text("layer").notNull(), // 'full' | 'summary' | 'narrative'
    dayNumber: integer("day_number"), // for 'full' layer
    dayRangeStart: integer("day_range_start"), // for 'summary' layer
    dayRangeEnd: integer("day_range_end"), // for 'summary' layer
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_memory_devotional").on(table.devotionalId, table.layer),
    index("idx_memory_user").on(table.userId),
  ]
);

export type ProgressiveMemoryRow = typeof progressiveMemory.$inferSelect;
export type NewProgressiveMemoryRow = typeof progressiveMemory.$inferInsert;

export const seriesArcs = pgTable(
  "series_arcs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    devotionalId: text("devotional_id").notNull().unique(),
    arc: jsonb("arc").notNull(),
    lastExtendedAt: timestamp("last_extended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_series_arcs_user").on(table.userId),
  ]
);

export type SeriesArcRow = typeof seriesArcs.$inferSelect;
export type NewSeriesArcRow = typeof seriesArcs.$inferInsert;

export const usedScriptures = pgTable(
  "used_scriptures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    reference: text("reference").notNull(),
    book: text("book").notNull(),
    devotionalId: text("devotional_id").notNull(),
    dayNumber: integer("day_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_scriptures_user").on(table.userId),
  ]
);

export type UsedScriptureRow = typeof usedScriptures.$inferSelect;
export type NewUsedScriptureRow = typeof usedScriptures.$inferInsert;

export const personaHistory = pgTable(
  "persona_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    devotionalId: text("devotional_id").notNull(),
    personaId: text("persona_id").notNull(),
    personaName: text("persona_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_persona_user").on(table.userId, table.createdAt),
  ]
);

export type PersonaHistoryRow = typeof personaHistory.$inferSelect;
export type NewPersonaHistoryRow = typeof personaHistory.$inferInsert;
```

- [ ] After `db:push`, run this raw SQL via `db:studio` or a migration script to add the partial unique index that Drizzle can't express:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_jobs_dedup
  ON generation_jobs(devotional_id, day_number, job_type)
  WHERE status IN ('pending', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_full
  ON progressive_memory(devotional_id, day_number)
  WHERE layer = 'full';

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_summary
  ON progressive_memory(devotional_id, day_range_start, day_range_end)
  WHERE layer = 'summary';

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_narrative
  ON progressive_memory(devotional_id)
  WHERE layer = 'narrative';
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run build
npm run db:generate
npm run db:push
```

**Commit message:** `feat(backend): add 6 generation tables for server-side devotional generation`

---

### Task 2: Generation job API routes

**Files:**
- `backend/src/routes/jobs.ts` (create)
- `backend/src/index.ts` (modify — mount route)
- `backend/src/middleware/rate-limit.ts` (modify — add cost groups)

**Steps:**

- [ ] Create `backend/src/routes/jobs.ts` with three endpoints
- [ ] Add rate limit cost groups for job endpoints
- [ ] Mount in `index.ts` with auth + rate limiting

**Code — `backend/src/routes/jobs.ts`:**

```typescript
import { Router, Request, Response } from "express";
import { db as _db } from "../db";
import { eq, and, inArray, sql, desc, asc } from "drizzle-orm";
import * as schema from "../db/schema";

const router = Router();

// Guard: return 503 if database is not configured
router.use((_req: Request, res: Response, next) => {
  if (!_db) {
    res.status(503).json({
      error: { code: "DB_UNAVAILABLE", message: "Database not configured" },
    });
    return;
  }
  next();
});

const db = _db!;

// ---------------------------------------------------------------------------
// POST /generate-day — Submit a generation job
// ---------------------------------------------------------------------------

router.post("/generate-day", async (req: Request, res: Response) => {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Missing user ID" },
    });
    return;
  }

  const { devotionalId, dayNumber, jobType, userContext } = req.body;

  // Validate required fields
  if (!dayNumber || typeof dayNumber !== "number" || dayNumber < 1) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "dayNumber must be a positive integer" },
    });
    return;
  }

  if (!jobType || !["initial_arc", "day"].includes(jobType)) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: 'jobType must be "initial_arc" or "day"' },
    });
    return;
  }

  if (jobType === "initial_arc" && !userContext) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "userContext required for initial_arc jobs" },
    });
    return;
  }

  // For day jobs, devotionalId is required
  if (jobType === "day" && !devotionalId) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "devotionalId required for day jobs" },
    });
    return;
  }

  try {
    // Same-day generation guard (for day jobs only, not initial_arc)
    if (jobType === "day") {
      const [config] = await db
        .select()
        .from(schema.userGenerationConfig)
        .where(eq(schema.userGenerationConfig.userId, uid))
        .limit(1);

      if (config?.lastGenerationDate) {
        // Get today's date in user's timezone
        const userTz = config.timezone || "America/Chicago";
        const nowInUserTz = new Date().toLocaleDateString("en-CA", { timeZone: userTz });
        if (config.lastGenerationDate === nowInUserTz && dayNumber > 1) {
          res.status(409).json({
            error: {
              code: "SAME_DAY_GENERATION",
              message: "Next-day generation already triggered today",
            },
          });
          return;
        }
      }
    }

    // Use a placeholder devotionalId for initial_arc (server will create the real one)
    const effectiveDevotionalId = devotionalId || `pending-${uid}-${Date.now()}`;

    // Deduplication: check for existing active job
    const [existingJob] = await db
      .select()
      .from(schema.generationJobs)
      .where(
        and(
          eq(schema.generationJobs.devotionalId, effectiveDevotionalId),
          eq(schema.generationJobs.dayNumber, dayNumber),
          eq(schema.generationJobs.jobType, jobType),
          inArray(schema.generationJobs.status, ["pending", "processing"])
        )
      )
      .limit(1);

    if (existingJob) {
      // Return existing job instead of creating duplicate
      res.json({
        jobId: existingJob.id,
        status: existingJob.status,
        message: "Job already exists",
      });
      return;
    }

    // Create new job
    const priority = jobType === "initial_arc" ? 10 : 5; // on-demand > cron (0)

    const [job] = await db
      .insert(schema.generationJobs)
      .values({
        userId: uid,
        devotionalId: effectiveDevotionalId,
        dayNumber,
        jobType,
        status: "pending",
        priority,
        inputData: userContext ? { userContext } : null,
      })
      .returning();

    res.status(201).json({
      jobId: job.id,
      status: "pending",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[jobs] Failed to create job: ${message}`);

    // Handle partial unique index violation (race condition)
    if (message.includes("idx_generation_jobs_dedup")) {
      // Another request created the job between our check and insert
      const [existingJob] = await db
        .select()
        .from(schema.generationJobs)
        .where(
          and(
            eq(schema.generationJobs.userId, uid),
            eq(schema.generationJobs.dayNumber, dayNumber),
            eq(schema.generationJobs.jobType, jobType),
            inArray(schema.generationJobs.status, ["pending", "processing"])
          )
        )
        .limit(1);

      if (existingJob) {
        res.json({ jobId: existingJob.id, status: existingJob.status });
        return;
      }
    }

    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to create generation job" },
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:jobId — Poll job status
// ---------------------------------------------------------------------------

router.get("/:jobId", async (req: Request, res: Response) => {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Missing user ID" },
    });
    return;
  }

  const { jobId } = req.params;

  try {
    const [job] = await db
      .select()
      .from(schema.generationJobs)
      .where(
        and(
          eq(schema.generationJobs.id, jobId),
          eq(schema.generationJobs.userId, uid)
        )
      )
      .limit(1);

    if (!job) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Job not found" },
      });
      return;
    }

    const response: Record<string, unknown> = {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
    };

    if (job.status === "complete") {
      response.result = job.result;
      response.completedAt = job.completedAt;
    }

    if (job.status === "failed") {
      response.error = job.error;
      response.retryCount = job.retryCount;
      response.canRetry = (job.retryCount ?? 0) < (job.maxRetries ?? 3);
    }

    res.json(response);
  } catch (err) {
    console.error(`[jobs] Failed to get job ${jobId}:`, err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to get job status" },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:jobId/retry — Retry a failed job
// ---------------------------------------------------------------------------

router.post("/:jobId/retry", async (req: Request, res: Response) => {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Missing user ID" },
    });
    return;
  }

  const { jobId } = req.params;

  try {
    const [job] = await db
      .select()
      .from(schema.generationJobs)
      .where(
        and(
          eq(schema.generationJobs.id, jobId),
          eq(schema.generationJobs.userId, uid)
        )
      )
      .limit(1);

    if (!job) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Job not found" },
      });
      return;
    }

    if (job.status !== "failed") {
      res.status(400).json({
        error: { code: "INVALID_STATE", message: "Only failed jobs can be retried" },
      });
      return;
    }

    if ((job.retryCount ?? 0) >= (job.maxRetries ?? 3)) {
      res.status(400).json({
        error: { code: "MAX_RETRIES", message: "Maximum retry count reached" },
      });
      return;
    }

    // Reset to pending
    await db
      .update(schema.generationJobs)
      .set({
        status: "pending",
        error: null,
        startedAt: null,
        completedAt: null,
      })
      .where(eq(schema.generationJobs.id, jobId));

    res.json({
      jobId: job.id,
      status: "pending",
      retryCount: job.retryCount,
    });
  } catch (err) {
    console.error(`[jobs] Failed to retry job ${jobId}:`, err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to retry job" },
    });
  }
});

export default router;
```

**Code — add to `backend/src/middleware/rate-limit.ts` ENDPOINT_GROUPS:**

```typescript
// Add these entries to the ENDPOINT_GROUPS object:
"/api/jobs/generate-day": "ai-expensive",
"/api/jobs": "db-read",            // covers GET /:jobId polling
```

**Code — add to `backend/src/index.ts` (after companionFeedbackRouter import):**

```typescript
import jobsRouter from "./routes/jobs";

// ... then mount after companion-feedback route:
// Generation job queue — submit, poll, retry
app.use("/api/jobs", authMiddleware, rateLimitMiddleware, jobsRouter);
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run build
npm run dev &
# In another terminal:
curl -X POST http://localhost:3000/api/jobs/generate-day \
  -H "Content-Type: application/json" \
  -d '{"dayNumber": 1, "jobType": "initial_arc", "userContext": {"name": "Test"}}'
# Should get 201 with jobId (in dev mode, auth is skipped)
```

**Commit message:** `feat(backend): add generation job API routes (submit, poll, retry)`

---

### Task 3: Port generation functions to server

**Files to create:**
- `backend/src/lib/generation/types.ts`
- `backend/src/lib/generation/arc-generator.ts`
- `backend/src/lib/generation/day-generator.ts`
- `backend/src/lib/generation/memory-manager.ts`
- `backend/src/lib/generation/method-resolver.ts`
- `backend/src/lib/generation/validator.ts`
- `backend/src/lib/generation/prompts.ts`
- `backend/src/lib/generation/index.ts`

**Steps:**

- [ ] Create `backend/src/lib/generation/types.ts` — shared types ported from client's `store.ts`
- [ ] Create `backend/src/lib/generation/prompts.ts` — all system prompt constants and prompt builders ported from client's `progressive-generation.ts`, `devotional-service.ts`, and `writing-craft.ts`
- [ ] Create `backend/src/lib/generation/arc-generator.ts` — port `generateSeriesArc()` and `generateArcExtension()`
- [ ] Create `backend/src/lib/generation/day-generator.ts` — port `generateProgressiveDay()` and `buildProgressiveUserPrompt()`
- [ ] Create `backend/src/lib/generation/memory-manager.ts` — port `maintainMemoryLayers()`, `assembleContextBuffer()`, `generateMemorySummary()`, `generateNarrative()`
- [ ] Create `backend/src/lib/generation/method-resolver.ts` — port `resolveMethodForDay()` with `BIBLE_STUDY_METHODS`, `pickMethod()`, `regionToGenre()`, `roleToDifficulty()`
- [ ] Create `backend/src/lib/generation/validator.ts` — port Haiku validation with retry
- [ ] Create `backend/src/lib/generation/index.ts` — barrel exports
- [ ] Write unit tests for pure functions (method resolver, prompt builder)

**Key porting decisions:**

1. **AI calls**: The client calls `postJsonWithBackendFallback()` which hits `/api/generate/devotional` on this same backend. On the server, call the AI providers directly using the existing `handleAnthropic()`, `handleXai()` functions. Extract these from `index.ts` into a shared `backend/src/lib/ai-client.ts` module so both the HTTP handler and the generation code can use them.

2. **Store access replaced with DB queries**: Every place the client reads `useUnfoldStore.getState()`, the server reads from the database:
   - `store.devotionals.find(...)` → query `sync_devotionals` table
   - `store.journalEntries.find(...)` → query `sync_journal_entries` table
   - `store.checkIns.filter(...)` → query `sync_check_ins` table
   - `store.getRecentScriptures(100)` → query `used_scriptures` table (ORDER BY created_at DESC LIMIT 100)
   - `store.seriesPersonaHistory` → query `persona_history` table
   - Memory layers → query `progressive_memory` table

3. **Writing craft constants**: Copy the constants from `mobile/src/constants/writing-craft.ts` and `mobile/src/constants/bible-study-methods.ts` into the backend. These are pure string constants with no React dependencies.

**Code — `backend/src/lib/generation/types.ts`:**

```typescript
// Ported from mobile/src/lib/store.ts — generation-related types only

export interface SeriesArcDay {
  dayNumber: number;
  themeHint: string;
  scriptureRegion: string;
  narrativeRole: "foundation" | "deepening" | "tension" | "turning" | "resolution";
  studyMethod?: string;
}

export interface SeriesArc {
  totalDaysPlanned: number;
  overarchingTheme: string;
  narrativeShape: string;
  dayHints: SeriesArcDay[];
  isOpenEnded: boolean;
  createdAt: string;
  lastExtendedAt?: string;
}

export interface MemoryLayerFull {
  dayNumber: number;
  devotionalTitle: string;
  scriptureReference: string;
  journalContent?: string;
  soapResponses?: SoapResponses;
  questionResponses?: { question: string; response: string }[];
  prayerRequests?: PrayerRequest[];
  checkInMood?: number;
  checkInMoodLabel?: string;
  checkInChipAnswer?: string;
  readAt?: string;
  completionStatus?: CompletionStatus;
}

export interface MemoryLayerSummary {
  dayRange: string;
  startDay: number;
  endDay: number;
  summary: string;
  dominantMoods: string[];
  keyPrayerThemes: string[];
  spiritualMovement: string;
  createdAt: string;
}

export interface MemoryLayerNarrative {
  narrative: string;
  totalDaysCovered: number;
  lastUpdatedAt: string;
  version: number;
}

export interface ProgressiveMemory {
  fullDays: MemoryLayerFull[];
  summaries: MemoryLayerSummary[];
  narrative: MemoryLayerNarrative | null;
}

export interface SoapResponses {
  scripture: string;
  observation: string;
  application: string;
  prayer: string;
}

export interface PrayerRequest {
  id: string;
  text: string;
  isAnswered: boolean;
  answeredAt?: string;
  createdAt: string;
}

export type CompletionStatus =
  | "completed_with_engagement"
  | "completed_minimal"
  | "in_progress"
  | "not_started";

export interface DevotionalDay {
  dayNumber: number;
  title: string;
  scriptureReference: string;
  scriptureText: string;
  bodyText: string;
  quotableLine: string;
  isRead: boolean;
  readAt?: string;
  quotes?: { text: string; author: string }[];
  crossReferences?: { reference: string; text: string }[];
  reflectionQuestions?: string[];
  contextNote?: string;
  wordStudy?: { term: string; original: string; meaning: string };
  closingPrayer?: string;
  checkInQuestion?: string;
  checkInChips?: string[];
  eveningScriptureRef?: string;
  studyMethod?: string;
  generatedAt?: string;
  contextSignals?: string[];
  storyId?: string;
  seriesReflectionSummary?: string;
  closureArchetype?: string;
}

export interface GenerationContext {
  name: string;
  aboutMe: string;
  currentSituation: string;
  emotionalState: string;
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: number;
  bibleTranslation: string;
  themeCategory?: string;
  devotionalType?: string;
  studySubject?: string;
  writingStyle?: {
    tone?: string;
    depth?: string;
    faithBackground?: string;
    lifeStage?: string;
  };
}

export interface UsedScripture {
  reference: string;
  book: string;
  usedAt: string;
  devotionalId: string;
}

export interface GenerationJobResult {
  devotionalDay: DevotionalDay;
  seriesTitle?: string;
  totalDays?: number;
  arc?: SeriesArc;
  devotionalId?: string;
}
```

- [ ] **Extract AI client from index.ts**: Create `backend/src/lib/ai-client.ts` by extracting `handleAnthropic()`, `handleXai()`, `handleGemini()`, `withRetry()`, `logAiUsage()`, and the `AnthropicResponse` type from `index.ts`. Both the HTTP handler and the generation worker will import from this shared module.

```typescript
// backend/src/lib/ai-client.ts
// Extract from index.ts: handleAnthropic, handleXai, handleGemini, withRetry,
// logAiUsage, estimateCost, MODEL_COSTS, ALLOWED_MODELS, AnthropicResponse type.
// Change handleAIRequest in index.ts to import from here.
// Add a new function for server-side generation calls:

export async function callAI(opts: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  uid: string;
  endpoint: string;
}): Promise<{ text: string; usage: AnthropicResponse["usage"] }> {
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: opts.messages,
  };

  let result: AnthropicResponse;

  if (opts.model.startsWith("grok-")) {
    try {
      result = await withRetry(() => handleXai(body), "xAI");
    } catch (xaiErr) {
      // Fallback to Haiku
      result = await withRetry(
        () => handleAnthropic({ ...body, model: "claude-haiku-4-5-20251001" }),
        "Anthropic-fallback"
      );
    }
  } else {
    try {
      result = await withRetry(() => handleAnthropic(body), "Anthropic");
    } catch (anthropicErr) {
      // Fallback to Grok
      result = await withRetry(
        () => handleXai({ ...body, model: "grok-4-1-fast-non-reasoning" }),
        "xAI-fallback"
      );
    }
  }

  // Log usage (non-blocking)
  logAiUsage(opts.uid, opts.model, opts.endpoint, result);

  const text = result.content?.[0]?.text ?? "";
  return { text, usage: result.usage };
}
```

- [ ] **Port `arc-generator.ts`**: Calls `callAI()` with Grok model. Uses the same system prompt and user prompt template from `progressive-generation.ts` lines 96-164. Reads `used_scriptures` from DB instead of store. Returns `{ arc, title }`.

- [ ] **Port `day-generator.ts`**: Calls `callAI()` with Claude Sonnet. Uses the same prompt building logic from `progressive-generation.ts` lines 548-787. Reads memory layers from `progressive_memory` table. Reads user context, journal entries, check-ins from sync tables. Returns `DevotionalDay`.

- [ ] **Port `memory-manager.ts`**: Port `assembleContextBuffer()` (reads from sync tables instead of store), `maintainMemoryLayers()` (writes to `progressive_memory` table), `generateMemorySummary()` (calls Grok), `generateNarrative()` (calls Grok).

- [ ] **Port `method-resolver.ts`**: Copy the pure logic from `progressive-generation.ts` lines 799-834 and the constants from `bible-study-methods.ts`. These are stateless functions.

- [ ] **Port `prompts.ts`**: Copy system prompt constants from `devotional-service.ts` (`getSystemPrompt()`, `buildV2VoiceOverlay()`, `PETER_ENNS_ADDITION`, `STICKY_SENTENCE_INSTRUCTION`) and `writing-craft.ts` (`CRAFT_FOUNDATION`, `ANTI_SLOP_DIRECTIVE`, etc.). These are string constants with no React/RN dependencies.

- [ ] **Port `validator.ts`**: Port the Haiku validation from `prompt-validator.ts`. Calls `callAI()` with Haiku model. Retries up to 2x with exponential backoff.

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run build  # Must compile with no errors
npm run test   # Run any new unit tests
```

**Commit message:** `feat(backend): port generation functions from client to server-side modules`

---

### Task 4: Job queue worker

**Files:**
- `backend/src/lib/worker.ts` (create)
- `backend/src/index.ts` (modify — start worker on boot)

**Steps:**

- [ ] Create `backend/src/lib/worker.ts` with polling loop
- [ ] Import and start worker in `index.ts` after server listen
- [ ] Add graceful shutdown (clear interval, wait for in-flight job)

**Code — `backend/src/lib/worker.ts`:**

```typescript
import { db as _db } from "../db";
import { eq, and, lt, inArray, sql, asc, desc } from "drizzle-orm";
import * as schema from "../db/schema";
import { processInitialArc, processDayGeneration } from "./generation";

const POLL_INTERVAL_MS = 5000;
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let isShuttingDown = false;

export function startWorker(): void {
  if (!_db) {
    console.warn("[worker] Database not configured — worker disabled");
    return;
  }

  console.log("[worker] Starting job queue worker (polling every 5s)");

  pollTimer = setInterval(async () => {
    if (isProcessing || isShuttingDown) return;
    isProcessing = true;
    try {
      await processNextJob();
    } catch (err) {
      console.error("[worker] Unexpected error in poll loop:", err);
    } finally {
      isProcessing = false;
    }
  }, POLL_INTERVAL_MS);
}

export function stopWorker(): void {
  isShuttingDown = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log("[worker] Worker stopped");
}

async function processNextJob(): Promise<void> {
  const db = _db!;

  // Step 1: Reset stale jobs (processing for >5 minutes)
  const staleThreshold = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
  await db
    .update(schema.generationJobs)
    .set({ status: "pending", startedAt: null })
    .where(
      and(
        eq(schema.generationJobs.status, "processing"),
        lt(schema.generationJobs.startedAt, staleThreshold)
      )
    );

  // Step 2: Claim next pending job (atomic)
  // ORDER BY priority DESC (higher = first), created_at ASC (older = first)
  const [job] = await db
    .update(schema.generationJobs)
    .set({
      status: "processing",
      startedAt: new Date(),
    })
    .where(
      eq(
        schema.generationJobs.id,
        sql`(
          SELECT id FROM generation_jobs
          WHERE status = 'pending'
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
        )`
      )
    )
    .returning();

  if (!job) return;

  console.log(
    `[worker] Processing job ${job.id} — type=${job.jobType}, ` +
    `devotional=${job.devotionalId}, day=${job.dayNumber}, ` +
    `retry=${job.retryCount}/${job.maxRetries}`
  );

  try {
    let result: unknown;

    switch (job.jobType) {
      case "initial_arc":
        result = await processInitialArc(job);
        break;
      case "day":
        result = await processDayGeneration(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }

    // Mark complete
    await db
      .update(schema.generationJobs)
      .set({
        status: "complete",
        result: result as any,
        completedAt: new Date(),
      })
      .where(eq(schema.generationJobs.id, job.id));

    console.log(`[worker] Job ${job.id} completed successfully`);

    // Update last_generation_date for the user
    const userTz = await getUserTimezone(job.userId);
    const todayInUserTz = new Date().toLocaleDateString("en-CA", {
      timeZone: userTz,
    });

    await db
      .insert(schema.userGenerationConfig)
      .values({
        userId: job.userId,
        lastGenerationDate: todayInUserTz,
      })
      .onConflictDoUpdate({
        target: schema.userGenerationConfig.userId,
        set: {
          lastGenerationDate: todayInUserTz,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Job ${job.id} failed: ${errorMessage}`);

    const retryCount = (job.retryCount ?? 0) + 1;
    const maxRetries = job.maxRetries ?? 3;

    if (retryCount < maxRetries) {
      // Reset to pending for retry
      await db
        .update(schema.generationJobs)
        .set({
          status: "pending",
          retryCount,
          error: errorMessage,
          startedAt: null,
        })
        .where(eq(schema.generationJobs.id, job.id));

      console.log(
        `[worker] Job ${job.id} will retry (${retryCount}/${maxRetries})`
      );
    } else {
      // Mark failed permanently
      await db
        .update(schema.generationJobs)
        .set({
          status: "failed",
          retryCount,
          error: errorMessage,
          completedAt: new Date(),
        })
        .where(eq(schema.generationJobs.id, job.id));

      console.log(`[worker] Job ${job.id} failed permanently`);
    }
  }
}

async function getUserTimezone(userId: string): Promise<string> {
  const db = _db!;
  const [config] = await db
    .select()
    .from(schema.userGenerationConfig)
    .where(eq(schema.userGenerationConfig.userId, userId))
    .limit(1);
  return config?.timezone || "America/Chicago";
}
```

**Code — add to `backend/src/index.ts` after `server.listen()`:**

```typescript
import { startWorker, stopWorker } from "./lib/worker";

// Inside the listen callback:
if (process.env.DATABASE_URL) {
  startWorker();
}

// Inside gracefulShutdown():
stopWorker();
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run build
npm run dev
# Submit a test job via curl, watch logs for worker picking it up
```

**Commit message:** `feat(backend): add job queue worker with polling, stale recovery, and retry logic`

---

### Task 5: Push token & notification preferences endpoints

**Files:**
- `backend/src/routes/users.ts` (create)
- `backend/src/index.ts` (modify — mount route)

**Steps:**

- [ ] Create `backend/src/routes/users.ts`
- [ ] Mount in `index.ts`

**Code — `backend/src/routes/users.ts`:**

```typescript
import { Router, Request, Response } from "express";
import { db as _db } from "../db";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

const router = Router();

router.use((_req: Request, res: Response, next) => {
  if (!_db) {
    res.status(503).json({
      error: { code: "DB_UNAVAILABLE", message: "Database not configured" },
    });
    return;
  }
  next();
});

const db = _db!;

// ---------------------------------------------------------------------------
// POST /push-token — Register Expo push token
// ---------------------------------------------------------------------------

router.post("/push-token", async (req: Request, res: Response) => {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Missing user ID" },
    });
    return;
  }

  const { expoPushToken, timezone, preferredNotificationTime } = req.body;

  if (!expoPushToken || typeof expoPushToken !== "string") {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "expoPushToken is required" },
    });
    return;
  }

  try {
    // Assign random stagger offset on first registration (0-300 minutes)
    const staggerOffset = Math.floor(Math.random() * 301);

    await db
      .insert(schema.userGenerationConfig)
      .values({
        userId: uid,
        expoPushToken,
        timezone: timezone || "America/Chicago",
        preferredNotificationTime: preferredNotificationTime || "07:00",
        staggerOffsetMinutes: staggerOffset,
      })
      .onConflictDoUpdate({
        target: schema.userGenerationConfig.userId,
        set: {
          expoPushToken,
          timezone: timezone || undefined,
          preferredNotificationTime: preferredNotificationTime || undefined,
          updatedAt: new Date(),
        },
      });

    res.json({ success: true });
  } catch (err) {
    console.error("[users] Failed to save push token:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to save push token" },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /notification-preferences — Update notification time
// ---------------------------------------------------------------------------

router.post("/notification-preferences", async (req: Request, res: Response) => {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Missing user ID" },
    });
    return;
  }

  const { preferredNotificationTime, timezone } = req.body;

  if (
    !preferredNotificationTime ||
    !/^\d{2}:\d{2}$/.test(preferredNotificationTime)
  ) {
    res.status(400).json({
      error: {
        code: "INVALID_PARAMS",
        message: "preferredNotificationTime must be HH:MM format",
      },
    });
    return;
  }

  try {
    await db
      .insert(schema.userGenerationConfig)
      .values({
        userId: uid,
        preferredNotificationTime,
        timezone: timezone || "America/Chicago",
      })
      .onConflictDoUpdate({
        target: schema.userGenerationConfig.userId,
        set: {
          preferredNotificationTime,
          timezone: timezone || undefined,
          updatedAt: new Date(),
        },
      });

    res.json({ success: true });
  } catch (err) {
    console.error("[users] Failed to save notification preferences:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to save preferences" },
    });
  }
});

export default router;
```

**Code — add to `backend/src/index.ts`:**

```typescript
import usersRouter from "./routes/users";

// Mount after jobs route:
app.use("/api/users", authMiddleware, rateLimitMiddleware, usersRouter);
```

**Code — add to `backend/src/middleware/rate-limit.ts` ENDPOINT_GROUPS:**

```typescript
"/api/users/push-token": "db-write",
"/api/users/notification-preferences": "db-write",
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run build
curl -X POST http://localhost:3000/api/users/push-token \
  -H "Content-Type: application/json" \
  -d '{"expoPushToken": "ExponentPushToken[test]", "timezone": "America/Chicago"}'
```

**Commit message:** `feat(backend): add push token and notification preference endpoints`

---

### Task 6: Midnight cron job

**Files:**
- `backend/src/lib/cron.ts` (create)
- `backend/src/index.ts` (modify — start cron)

**Steps:**

- [ ] Create `backend/src/lib/cron.ts`
- [ ] Start cron in `index.ts` on server boot
- [ ] Add graceful shutdown

**Code — `backend/src/lib/cron.ts`:**

```typescript
import { db as _db } from "../db";
import { eq, and, ne, sql, isNotNull } from "drizzle-orm";
import * as schema from "../db/schema";

const CRON_INTERVAL_MS = 60_000; // Run every minute
let cronTimer: ReturnType<typeof setInterval> | null = null;

export function startCron(): void {
  if (!_db) {
    console.warn("[cron] Database not configured — cron disabled");
    return;
  }

  console.log("[cron] Starting midnight generation cron (every 60s)");

  cronTimer = setInterval(async () => {
    try {
      await midnightGenerationCron();
    } catch (err) {
      console.error("[cron] Error:", err);
    }
  }, CRON_INTERVAL_MS);
}

export function stopCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
  console.log("[cron] Cron stopped");
}

async function midnightGenerationCron(): Promise<void> {
  const db = _db!;
  const now = new Date();

  // Find users who:
  // 1. Have a generation config with a stagger offset
  // 2. Have an active progressive devotional (via sync_devotionals)
  // 3. Haven't had generation today
  // 4. Their stagger time has arrived
  const configs = await db
    .select()
    .from(schema.userGenerationConfig)
    .where(isNotNull(schema.userGenerationConfig.staggerOffsetMinutes));

  for (const config of configs) {
    try {
      // Check if stagger window has arrived
      if (!isInStaggerWindow(config, now)) continue;

      // Check if already generated today
      const todayInUserTz = now.toLocaleDateString("en-CA", {
        timeZone: config.timezone || "America/Chicago",
      });

      if (config.lastGenerationDate === todayInUserTz) continue;

      // Find active progressive devotional for this user
      const [devotional] = await db
        .select()
        .from(schema.syncDevotionals)
        .where(
          and(
            eq(schema.syncDevotionals.clerkUserId, config.userId),
            eq(schema.syncDevotionals.generationMode, "progressive")
          )
        )
        .limit(1);

      if (!devotional) continue;

      const currentDay = devotional.currentDay ?? 1;
      const totalDays = devotional.totalDays ?? 1;
      const nextDay = currentDay; // currentDay is the next unread day

      // Check if past end of series
      if (nextDay > totalDays) continue;

      // Check if next day already exists
      const [existingDay] = await db
        .select({ id: schema.syncDevotionalDays.id })
        .from(schema.syncDevotionalDays)
        .where(
          and(
            eq(schema.syncDevotionalDays.devotionalId, devotional.id),
            eq(schema.syncDevotionalDays.dayNumber, nextDay)
          )
        )
        .limit(1);

      if (existingDay) continue;

      // Check if there's already a pending/processing job
      const [existingJob] = await db
        .select({ id: schema.generationJobs.id })
        .from(schema.generationJobs)
        .where(
          and(
            eq(schema.generationJobs.devotionalId, devotional.id),
            eq(schema.generationJobs.dayNumber, nextDay),
            sql`status IN ('pending', 'processing')`
          )
        )
        .limit(1);

      if (existingJob) continue;

      // Submit generation job with low priority (cron < on-demand)
      await db.insert(schema.generationJobs).values({
        userId: config.userId,
        devotionalId: devotional.id,
        dayNumber: nextDay,
        jobType: "day",
        status: "pending",
        priority: 0, // cron jobs are lower priority
      });

      console.log(
        `[cron] Submitted generation job for user ${config.userId}, ` +
        `devotional ${devotional.id}, day ${nextDay}`
      );
    } catch (err) {
      console.error(`[cron] Error for user ${config.userId}:`, err);
      // Continue to next user — don't let one failure block others
    }
  }
}

function isInStaggerWindow(
  config: schema.UserGenerationConfig,
  now: Date
): boolean {
  const tz = config.timezone || "America/Chicago";
  // Get current time in user's timezone
  const userTimeStr = now.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [hours, minutes] = userTimeStr.split(":").map(Number);
  const minutesSinceMidnight = hours * 60 + minutes;

  // Stagger window: midnight + offset (0-300 minutes = 0-5am)
  const offset = config.staggerOffsetMinutes ?? 0;
  return minutesSinceMidnight >= offset && minutesSinceMidnight < offset + 60;
}
```

**Code — add to `backend/src/index.ts`:**

```typescript
import { startCron, stopCron } from "./lib/cron";

// Inside listen callback, after startWorker():
startCron();

// Inside gracefulShutdown():
stopCron();
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm run build
```

**Commit message:** `feat(backend): add midnight cron job for pre-generating next-day content`

---

### Task 7: Push notification sender

**Files:**
- `backend/src/lib/push-notifications.ts` (create)
- `backend/package.json` (modify — add expo-server-sdk)
- `backend/src/lib/worker.ts` (modify — call after completion)

**Steps:**

- [ ] Install expo-server-sdk: `npm install expo-server-sdk`
- [ ] Create `backend/src/lib/push-notifications.ts`
- [ ] Wire into worker — call after job completion for cron-triggered jobs

**Code — `backend/src/lib/push-notifications.ts`:**

```typescript
import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { db as _db } from "../db";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

const expo = new Expo();

export async function sendGenerationCompleteNotification(
  userId: string,
  dayTitle: string,
  devotionalId: string,
  dayNumber: number
): Promise<void> {
  const db = _db;
  if (!db) return;

  try {
    const [config] = await db
      .select()
      .from(schema.userGenerationConfig)
      .where(eq(schema.userGenerationConfig.userId, userId))
      .limit(1);

    if (!config?.expoPushToken) {
      console.log(`[push] No push token for user ${userId}`);
      return;
    }

    if (!Expo.isExpoPushToken(config.expoPushToken)) {
      console.warn(`[push] Invalid push token for user ${userId}: ${config.expoPushToken}`);
      return;
    }

    // Check if notification time has passed
    const userTz = config.timezone || "America/Chicago";
    const preferredTime = config.preferredNotificationTime || "07:00";
    const [prefHour, prefMin] = preferredTime.split(":").map(Number);

    const nowInUserTz = new Date().toLocaleTimeString("en-US", {
      timeZone: userTz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const [nowHour, nowMin] = nowInUserTz.split(":").map(Number);

    const nowMinutes = nowHour * 60 + nowMin;
    const prefMinutes = prefHour * 60 + prefMin;

    if (nowMinutes < prefMinutes) {
      // Preferred time hasn't arrived yet — for now, we skip
      // (Future: schedule a delayed send via a job)
      console.log(
        `[push] Skipping notification for ${userId} — ` +
        `preferred time ${preferredTime} hasn't arrived (now: ${nowInUserTz})`
      );
      return;
    }

    // Send immediately
    const message: ExpoPushMessage = {
      to: config.expoPushToken,
      title: "Your devotional is ready",
      body: dayTitle,
      data: {
        type: "devotional_ready",
        devotionalId,
        dayNumber,
      },
      sound: "default",
      categoryId: "devotional_ready",
    };

    const tickets = await expo.sendPushNotificationsAsync([message]);
    const ticket = tickets[0];

    if ((ticket as any).status === "ok") {
      console.log(`[push] Sent notification to ${userId}: "${dayTitle}"`);
    } else {
      console.warn(`[push] Failed to send to ${userId}:`, ticket);
    }
  } catch (err) {
    // Non-blocking — never fail generation over a push notification
    console.error(`[push] Error sending notification to ${userId}:`, err);
  }
}
```

**Code — update `backend/src/lib/worker.ts` after `markJobComplete`:**

```typescript
import { sendGenerationCompleteNotification } from "./push-notifications";

// After marking job complete, if it was a cron job (priority 0), send push:
if (job.priority === 0 && result) {
  const dayResult = (result as any)?.devotionalDay;
  if (dayResult?.title) {
    sendGenerationCompleteNotification(
      job.userId,
      dayResult.title,
      job.devotionalId,
      job.dayNumber
    ).catch(() => {}); // Fire-and-forget
  }
}
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/backend
npm install expo-server-sdk
npm run build
```

**Commit message:** `feat(backend): add push notification sender for completed generation jobs`

---

## Phase 2: Client — Generating Screen

### Task 8: Generation API client

**Files:**
- `mobile/src/lib/generation-api.ts` (create)

**Steps:**

- [ ] Create the API client with three functions
- [ ] Follow the same auth header pattern as `api-config.ts` (`getAuthHeaders()`)
- [ ] Follow the same fetch pattern as `sync-service.ts` (PRIMARY_BACKEND_URL)

**Code — `mobile/src/lib/generation-api.ts`:**

```typescript
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { logger } from "./logger";

export interface GenerationJobResponse {
  jobId: string;
  status: "pending" | "processing" | "complete" | "failed";
  result?: {
    devotionalDay: import("./store").DevotionalDay;
    seriesTitle?: string;
    totalDays?: number;
    arc?: import("./store").SeriesArc;
    devotionalId?: string;
  };
  error?: string;
  retryCount?: number;
  canRetry?: boolean;
  createdAt?: string;
  completedAt?: string;
}

export async function submitGenerationJob(params: {
  devotionalId?: string;
  dayNumber: number;
  jobType: "initial_arc" | "day";
  userContext?: {
    name: string;
    aboutMe: string;
    situation: string;
    emotion: string;
    seeking: string;
    themeCategory: string;
    devotionalType: string;
    studySubject?: string;
    readingDuration?: number;
    devotionalLength?: number;
    bibleTranslation?: string;
    writingStyle?: Record<string, string>;
  };
}): Promise<{ jobId: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/generate-day`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Submit job failed: ${response.status} — ${body.slice(0, 200)}`);
  }

  return response.json();
}

export async function pollJobStatus(jobId: string): Promise<GenerationJobResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/${jobId}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Poll job failed: ${response.status}`);
  }

  return response.json();
}

export async function retryJob(jobId: string): Promise<{ jobId: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/${jobId}/retry`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Retry job failed: ${response.status} — ${body.slice(0, 200)}`);
  }

  return response.json();
}
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit
```

**Commit message:** `feat(client): add generation API client (submit, poll, retry)`

---

### Task 9: Rewrite generating screen

**Files:**
- `mobile/src/app/generating.tsx` (rewrite)

**Steps:**

- [ ] Replace the entire generation orchestration logic with job submission + polling
- [ ] Keep the progress animation UI (ripples, waiting messages, sample preview)
- [ ] Remove: `generateSeriesArc()` and `generateProgressiveDay()` calls
- [ ] Remove: AppState recovery listener, watchdog timer, in-flight tracking
- [ ] Remove: Local devotional shell creation (no `createDevotionalFromGenerated` until server confirms)
- [ ] Add: `submitGenerationJob()` call on mount
- [ ] Add: `pollJobStatus()` on 3-second interval
- [ ] Add: Retry button on failure
- [ ] On completion: store devotional + Day 1 from job result, navigate to reading screen
- [ ] On background/foreground: resume polling (AppState listener, but only for polling, not generation)

**Key changes in the component:**

```typescript
// Replace the entire generation useEffect with:
useEffect(() => {
  let pollInterval: ReturnType<typeof setInterval>;
  let cancelled = false;

  async function startGeneration() {
    try {
      // Submit job to server
      const { jobId } = await submitGenerationJob({
        dayNumber: 1,
        jobType: "initial_arc",
        userContext: {
          name: user.name,
          aboutMe: user.aboutMe,
          situation: user.currentSituation,
          emotion: user.emotionalState,
          seeking: user.spiritualSeeking,
          themeCategory: selectedTheme || "",
          devotionalType: selectedType || "",
          studySubject: studySubject || "",
          readingDuration: user.readingDuration,
          devotionalLength: user.devotionalLength,
          bibleTranslation: user.bibleTranslation,
          writingStyle: user.writingStyle as any,
        },
      });

      setPendingJobId(jobId);

      // Poll every 3 seconds
      pollInterval = setInterval(async () => {
        if (cancelled) return;
        try {
          const status = await pollJobStatus(jobId);
          if (status.status === "complete" && status.result) {
            clearInterval(pollInterval);
            // Store the result and navigate
            handleGenerationComplete(status.result);
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setError(status.error || "Generation failed");
            setCanRetry(status.canRetry ?? true);
          }
        } catch {
          // Poll error — will retry on next interval
        }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
    }
  }

  startGeneration();

  return () => {
    cancelled = true;
    if (pollInterval) clearInterval(pollInterval);
  };
}, []);
```

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit
npx expo run:ios --device "iPhone 17 Pro"
# Test: complete onboarding, verify generating screen submits job and polls
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

**Commit message:** `refactor(client): rewrite generating screen to use server-side job queue`

---

## Phase 3: Client — Daily Flow

### Task 10: Wire day completion to server

**Files:**
- `mobile/src/app/(reading)/[devotionalId]/[dayNumber].tsx` or equivalent reading screen (find the file that handles `markDayComplete`)
- Potentially `mobile/src/lib/store.ts` (if the complete action is there)

**Steps:**

- [ ] Find where day completion is triggered (likely `markDayRead` or similar in store)
- [ ] After marking day complete locally, fire `submitGenerationJob({ devotionalId, dayNumber: completedDay + 1, jobType: "day" })` as fire-and-forget
- [ ] Don't await the result — the server generates in the background
- [ ] Don't show any UI for this background job — it's invisible to the user

**Code pattern:**

```typescript
// After marking day as read:
import { submitGenerationJob } from "@/lib/generation-api";

// Fire-and-forget next-day generation
submitGenerationJob({
  devotionalId,
  dayNumber: completedDayNumber + 1,
  jobType: "day",
}).catch((err) => {
  logger.warn("[day-complete] Failed to submit next-day job:", err);
});
```

**Verification:**

```bash
npx tsc --noEmit
# Test: Complete a devotional day, check backend logs for job submission
```

**Commit message:** `feat(client): trigger server-side next-day generation on day completion`

---

### Task 11: Remove client-side generation code

**Files:**
- `mobile/src/lib/background-generation.ts` (delete)
- `mobile/src/lib/cutoff-logic.ts` (delete)
- `mobile/src/app/(tabs)/(today)/index.tsx` (modify)
- `mobile/src/lib/progressive-generation.ts` (heavily modify — keep types/exports that other files use, remove generation functions)
- `mobile/src/lib/store.ts` (modify — remove generation state)

**Steps:**

- [ ] Delete `mobile/src/lib/background-generation.ts`
- [ ] Delete `mobile/src/lib/cutoff-logic.ts`
- [ ] In `mobile/src/app/(tabs)/(today)/index.tsx`:
  - Remove the progressive generation trigger useEffect (lines ~193-236)
  - Remove `import { triggerNextDayGeneration, preGenerateAudio, attemptEveningGeneration } from '@/lib/progressive-generation'`
  - Remove `import { isPastCutoff, todayDateString, isPastEveningCutoff } from '@/lib/cutoff-logic'`
  - Remove `progressiveGenTriggeredRef` ref
  - Remove `isPreparingCurrentDay` state (replace with a check for pending server job if needed)
  - Keep `computeDevotionalState` and all card rendering logic
- [ ] In `mobile/src/lib/progressive-generation.ts`:
  - Remove: `generateSeriesArc()`, `generateProgressiveDay()`, `_generateProgressiveDayInternal()`, `generateMemorySummary()`, `generateNarrative()`, `evaluateSeriesExtension()`, `generateArcExtension()`, `buildProgressiveUserPrompt()`, `assembleContextBuffer()`, `maintainMemoryLayers()`, `resolveMethodForDay()`, `triggerNextDayGeneration()`, `attemptEveningGeneration()`, `buildContextSignalList()`, `inFlightDayRequests` map
  - Keep: `preGenerateAudio()` (TTS stays client-side for now)
  - Keep any types that are re-exported and used by other files
- [ ] In `mobile/src/lib/store.ts`:
  - Remove: `progressiveGeneration` state object and its initial values
  - Remove: `lastGenerationCutoffDate` and `lastEveningGenerationDate`
  - Remove: `setProgressiveGeneration()`, `setLastGenerationCutoffDate()`, `setLastEveningGenerationDate()`
  - Add: `pendingJobId: string | null` (for tracking active generation job)
  - Keep: `pushFullDayMemory`, `addMemorySummary`, `setNarrativeMemory` (still needed for display — or remove if server is sole source of truth)
  - Bump persist version (currently v7 -> v8) with migration that cleans up removed fields
- [ ] Find and update all other imports of deleted functions/files. Use grep to find all files importing from `background-generation`, `cutoff-logic`, or the removed functions from `progressive-generation`.

**Verification:**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
# Find all imports of deleted files
grep -r "background-generation" src/ --include="*.ts" --include="*.tsx" -l
grep -r "cutoff-logic" src/ --include="*.ts" --include="*.tsx" -l
grep -r "triggerNextDayGeneration\|attemptEveningGeneration\|generateSeriesArc\b" src/ --include="*.ts" --include="*.tsx" -l

npx tsc --noEmit  # Must pass with no errors
npx expo run:ios --device "iPhone 17 Pro"
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

**Commit message:** `refactor(client): remove client-side generation code (~4K lines), server is now source of truth`

---

## Phase 4: Reveal Screen + Push

### Task 12: Reveal screen component

**Files:**
- `mobile/src/app/reveal.tsx` (create)
- `mobile/src/lib/store.ts` (modify — add `lastRevealShownDate`)

**Steps:**

- [ ] Create `mobile/src/app/reveal.tsx` as a modal screen
- [ ] Layout: series title (eyebrow, uppercase, Inter), day title (large, Instrument Serif), day number
- [ ] Animated chevron with spring-based float (critically-damped, no bounce)
- [ ] Swipe-up gesture via `PanGestureHandler` or `useAnimatedGestureHandler` — navigates to reading screen
- [ ] Track `lastRevealShownDate` in store to prevent showing twice on the same day
- [ ] Accept route params: `devotionalId`, `dayNumber`, `seriesTitle`, `dayTitle`, `totalDays`

**Code skeleton — `mobile/src/app/reveal.tsx`:**

```typescript
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeIn,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { CaretUpIcon } from "phosphor-react-native";
import { FontFamily, FontSize } from "@/constants/fonts";
import { useTheme } from "@/lib/theme";
import { useUnfoldStore } from "@/lib/store";
import { useEffect } from "react";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = -80; // Negative = upward

export default function RevealScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { devotionalId, dayNumber, seriesTitle, dayTitle, totalDays } =
    useLocalSearchParams<{
      devotionalId: string;
      dayNumber: string;
      seriesTitle: string;
      dayTitle: string;
      totalDays: string;
    }>();

  // Mark as shown today
  const setLastRevealShownDate = useUnfoldStore((s) => s.setLastRevealShownDate);
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setLastRevealShownDate(today);
  }, []);

  // Floating chevron animation (critically-damped, no bounce)
  const chevronY = useSharedValue(0);
  useEffect(() => {
    chevronY.value = withRepeat(
      withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronY.value }],
  }));

  // Swipe-up gesture
  const navigateToReading = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace({
      pathname: `/(reading)/${devotionalId}/${dayNumber}`,
    });
  };

  const swipeGesture = Gesture.Pan()
    .onEnd((event) => {
      if (event.translationY < SWIPE_THRESHOLD) {
        runOnJS(navigateToReading)();
      }
    });

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View
        entering={FadeIn.duration(600)}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.content}>
          {/* Eyebrow — series title */}
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
            {seriesTitle?.toUpperCase()}
          </Text>

          {/* Day title */}
          <Text style={[styles.dayTitle, { color: colors.textPrimary }]}>
            {dayTitle}
          </Text>

          {/* Day counter */}
          <Text style={[styles.dayCounter, { color: colors.textMuted }]}>
            {`DAY ${dayNumber} OF ${totalDays}`}
          </Text>
        </View>

        {/* Swipe prompt */}
        <View style={styles.swipePrompt}>
          <Animated.View style={chevronStyle}>
            <CaretUpIcon size={24} color={colors.textMuted} weight="light" />
          </Animated.View>
          <Text style={[styles.swipeText, { color: colors.textMuted }]}>
            Swipe up to begin{"\n"}today's reading
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
  },
  dayTitle: {
    fontFamily: "InstrumentSerif_400Regular",
    fontSize: 32,
    lineHeight: 40,
    marginBottom: 16,
  },
  dayCounter: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  swipePrompt: {
    alignItems: "center",
    paddingBottom: 60,
  },
  swipeText: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
});
```

**Store changes — add to `mobile/src/lib/store.ts`:**

```typescript
// Add to state interface:
lastRevealShownDate: string | null;

// Add to actions interface:
setLastRevealShownDate: (date: string) => void;

// Add to initial state:
lastRevealShownDate: null,

// Add to actions:
setLastRevealShownDate: (date) => set({ lastRevealShownDate: date }),
```

**Verification:**

```bash
npx tsc --noEmit
npx expo run:ios --device "iPhone 17 Pro"
# Navigate to /reveal with test params
```

**Commit message:** `feat(client): add Reveal screen with swipe-up gesture for daily content discovery`

---

### Task 13: Push notification setup

**Files:**
- `mobile/src/lib/push-notifications.ts` (create)
- `mobile/src/app/_layout.tsx` (modify — register on launch)

**Steps:**

- [ ] Create `mobile/src/lib/push-notifications.ts` with token registration and notification handler
- [ ] Register push token on app launch (in root layout)
- [ ] Handle notification tap: route to Reveal screen via deep link

**Code — `mobile/src/lib/push-notifications.ts`:**

```typescript
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { logger } from "./logger";
import * as Device from "expo-device";

// Configure notification handler (shows notification when app is in foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowInForeground: false, // Don't show banner if app is active
  }),
});

export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) {
    logger.log("[push] Skipping push registration on simulator");
    return;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      logger.log("[push] Push notification permission not granted");
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    });

    const token = tokenData.data;
    logger.log(`[push] Push token: ${token.slice(0, 30)}...`);

    // Send token to backend
    const headers = await getAuthHeaders();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await fetch(`${PRIMARY_BACKEND_URL}/api/users/push-token`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        expoPushToken: token,
        timezone: tz,
      }),
    });

    logger.log("[push] Push token registered with backend");
  } catch (err) {
    logger.warn("[push] Failed to register push token:", err);
  }
}

export function setupNotificationListeners(): () => void {
  // Handle notification tap (app was in background/closed)
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data?.type === "devotional_ready") {
        const { devotionalId, dayNumber } = data;
        // Navigate to Reveal screen
        router.push({
          pathname: "/reveal",
          params: {
            devotionalId: devotionalId as string,
            dayNumber: String(dayNumber),
            // seriesTitle and dayTitle will be loaded from store
          },
        });
      }
    }
  );

  return () => subscription.remove();
}
```

**Code — add to `mobile/src/app/_layout.tsx` in the root layout component:**

```typescript
import { registerPushToken, setupNotificationListeners } from "@/lib/push-notifications";

// Inside the component:
useEffect(() => {
  registerPushToken();
  const cleanup = setupNotificationListeners();
  return cleanup;
}, []);
```

**Verification:**

```bash
npx tsc --noEmit
# Test on physical device (push tokens don't work in simulator)
```

**Commit message:** `feat(client): add Expo push notification registration and deep link handling`

---

### Task 14: Wire Reveal screen entry points

**Files:**
- `mobile/src/app/(tabs)/(today)/index.tsx` (modify)
- `mobile/src/app/_layout.tsx` (modify — cold open detection)

**Steps:**

- [ ] **Cold app open**: In the home screen or root layout, check if there's a new unread day that hasn't been revealed today. If `lastRevealShownDate !== today` and a new unread day exists, navigate to Reveal.
- [ ] **In-app**: After sync pull detects a new day (in `sync-service.ts` pull handler or home screen refresh), check if Reveal should be shown.
- [ ] **Push notification tap**: Already handled in Task 13 via `setupNotificationListeners`.

**Code — add to home screen (`index.tsx`), replacing the removed generation trigger:**

```typescript
// After removing the progressive generation useEffect, add:
useEffect(() => {
  if (!currentDevotional || currentDevotional.generationMode !== "progressive") return;

  const today = new Date().toISOString().split("T")[0];
  const lastRevealDate = useUnfoldStore.getState().lastRevealShownDate;

  // Already shown today
  if (lastRevealDate === today) return;

  // Check if there's a new unread day
  const currentDay = currentDevotional.currentDay;
  const dayData = currentDevotional.days.find((d) => d.dayNumber === currentDay);

  if (dayData && !dayData.isRead) {
    // New day is ready and unread — show Reveal
    router.push({
      pathname: "/reveal",
      params: {
        devotionalId: currentDevotional.id,
        dayNumber: String(currentDay),
        seriesTitle: currentDevotional.title,
        dayTitle: dayData.title,
        totalDays: String(currentDevotional.totalDays),
      },
    });
  }
}, [currentDevotional]);
```

**Verification:**

```bash
npx tsc --noEmit
npx expo run:ios --device "iPhone 17 Pro"
# Test: After a day is generated server-side and synced, open app — Reveal should appear
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

**Commit message:** `feat(client): wire Reveal screen entry points (cold open, in-app, push tap)`

---

## Phase 5: Data Migration + Cleanup

### Task 15: Data migration (client -> server)

**Files:**
- `mobile/src/lib/generation-migration.ts` (create)
- `mobile/src/app/_layout.tsx` or appropriate startup file (call migration)

**Steps:**

- [ ] Create a one-time migration that runs on first app launch after the update
- [ ] Push existing `progressiveMemory`, `seriesArc`, `usedScriptures`, and `seriesPersonaHistory` from local store to the new server tables
- [ ] Track migration completion with a flag in MMKV (`generation-migration-complete`)
- [ ] Server reconciles: if data already exists in server tables, skip (idempotent)

**Code — `mobile/src/lib/generation-migration.ts`:**

```typescript
import { mmkvStorage } from "./mmkv-storage";
import { useUnfoldStore } from "./store";
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { logger } from "./logger";

const MIGRATION_KEY = "generation-migration-v1-complete";

export async function migrateGenerationDataToServer(): Promise<void> {
  // Check if already migrated
  if (mmkvStorage.getItem(MIGRATION_KEY) === "true") return;

  const store = useUnfoldStore.getState();
  const headers = await getAuthHeaders();

  // Only migrate if user is authenticated
  if (!headers["Authorization"]) {
    logger.log("[gen-migration] Skipping — no auth token");
    return;
  }

  try {
    // Gather data to migrate
    const devotionals = store.devotionals.filter(
      (d) => d.generationMode === "progressive"
    );

    for (const devo of devotionals) {
      // Push series arc
      if (devo.seriesArc) {
        await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-arc`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            devotionalId: devo.id,
            arc: devo.seriesArc,
          }),
        }).catch(() => {});
      }

      // Push progressive memory
      if (devo.progressiveMemory) {
        await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-memory`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            devotionalId: devo.id,
            memory: devo.progressiveMemory,
          }),
        }).catch(() => {});
      }
    }

    // Push used scriptures
    const scriptures = store.usedScriptures ?? [];
    if (scriptures.length > 0) {
      await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-scriptures`, {
        method: "POST",
        headers,
        body: JSON.stringify({ scriptures }),
      }).catch(() => {});
    }

    // Push persona history
    const personas = store.seriesPersonaHistory ?? [];
    if (personas.length > 0) {
      await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-personas`, {
        method: "POST",
        headers,
        body: JSON.stringify({ personas }),
      }).catch(() => {});
    }

    // Mark migration complete
    mmkvStorage.setItem(MIGRATION_KEY, "true");
    logger.log("[gen-migration] Migration complete");
  } catch (err) {
    logger.warn("[gen-migration] Migration failed (will retry next launch):", err);
    // Don't mark complete — will retry on next app launch
  }
}
```

**Note:** This requires adding corresponding `/api/jobs/migrate-*` endpoints on the backend to receive the migrated data. These are simple INSERT-or-skip endpoints. Add them to `backend/src/routes/jobs.ts`.

**Verification:**

```bash
npx tsc --noEmit
```

**Commit message:** `feat(client): add one-time data migration from local store to server generation tables`

---

### Task 16: Integration testing + cleanup

**Files:**
- Backend: add integration tests in `backend/src/__tests__/`
- Client: remove dead imports, verify build

**Steps:**

- [ ] **Backend integration tests** (Vitest):
  - Test job submission deduplication
  - Test job status polling returns correct shapes
  - Test retry logic (increment count, respect max)
  - Test worker claims jobs atomically
  - Test stale job recovery
  - Test cron finds correct users

- [ ] **Client cleanup**:
  - Run `npx tsc --noEmit` — fix all type errors
  - Search for any remaining imports of deleted modules:
    ```bash
    grep -r "background-generation\|cutoff-logic" src/ -l
    grep -r "triggerNextDayGeneration\|attemptEveningGeneration\|generateSeriesArc\b" src/ -l
    grep -r "lastGenerationCutoffDate\|lastEveningGenerationDate" src/ -l
    ```
  - Remove any dead imports found
  - Verify app builds and runs: `npx expo run:ios --device "iPhone 17 Pro"`
  - Take screenshot to verify home screen still renders correctly

- [ ] **End-to-end smoke test**:
  1. Fresh onboarding → generating screen submits job → polls → Day 1 appears
  2. Complete Day 1 → server generates Day 2 in background
  3. Close app → reopen → Reveal screen shows Day 2
  4. Swipe up → reading screen for Day 2
  5. Verify push notification arrives (physical device only)

- [ ] **Edge case tests**:
  - Submit duplicate job → returns existing jobId
  - Job fails → retry button works
  - User backgrounds during generation → returns, polls, gets result
  - Same-day double generation prevented
  - Series extension at end of series

**Verification:**

```bash
# Backend
cd /Users/galangster/clawd/work/unfold/backend
npm run build
npm run test

# Client
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit
npx expo run:ios --device "iPhone 17 Pro"
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

**Commit message:** `test: add integration tests and clean up dead generation code`

---

## Summary

| Phase | Tasks | Key deliverable |
|-------|-------|----------------|
| **Phase 1: Backend** | Tasks 1-7 | Job queue, worker, API endpoints, cron, push |
| **Phase 2: Client Generating** | Tasks 8-9 | API client, rewritten generating screen |
| **Phase 3: Client Daily** | Tasks 10-11 | Day completion wiring, ~4K lines removed |
| **Phase 4: Reveal + Push** | Tasks 12-14 | Reveal screen, push notifications, entry points |
| **Phase 5: Migration** | Tasks 15-16 | Data migration, integration tests, cleanup |

**Estimated lines removed (client):** ~4,000-6,000 (background-generation.ts, cutoff-logic.ts, generation functions from progressive-generation.ts, generation state from store.ts, generation triggers from index.tsx, generation orchestration from generating.tsx)

**Estimated lines added (backend):** ~2,000-3,000 (schema, routes, worker, cron, push, generation modules)

**Estimated lines added (client):** ~500-800 (generation-api.ts, reveal.tsx, push-notifications.ts, migration.ts)

**Net client simplification:** ~3,000-5,000 lines removed

**Dependencies to install:**
- Backend: `expo-server-sdk` (for push notifications)
- Client: none new (expo-notifications already installed)
