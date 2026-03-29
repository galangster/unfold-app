# Prompt Engineering Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure all AI prompts with XML tags, few-shot examples, self-verification, a Haiku validation chain, violation logging, and a self-improving adaptive example system.

**Architecture:** Mobile prompts get XML restructuring + examples + self-check. After each devotional generation, a Haiku validator catches violations and auto-fixes them. Violations log to Railway Postgres via new backend endpoints. When a rule exceeds 20% violation rate, the system auto-generates a contrast example targeting that rule.

**Tech Stack:** React Native/Expo (mobile), Express/Drizzle/PostgreSQL (backend), Claude Sonnet (generation), Claude Haiku (validation/companion), Grok (mood check-ins), Jest (tests)

**Spec:** `docs/superpowers/specs/2026-03-28-prompt-engineering-overhaul-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `mobile/src/constants/prompt-rules.ts` | Condensed, testable rule definitions for the validator (banned phrases, patterns, field locations) |
| `mobile/src/lib/prompt-validator.ts` | Validation chain: send to Haiku via backend proxy, parse violations, apply correctedText |
| `mobile/src/lib/prompt-examples.ts` | Static few-shot examples (universal, persona, companion) + dynamic example cache |
| `mobile/src/lib/__tests__/prompt-validator.test.ts` | Tests for validation parsing and auto-fix application |
| `mobile/src/lib/__tests__/prompt-rules.test.ts` | Tests for rule detection (banned phrases, negation patterns, etc.) |
| `mobile/src/lib/__tests__/prompt-examples.test.ts` | Tests for trait mapping, example completeness, dynamic cache |
| `backend/src/routes/prompt-generations.ts` | POST /, GET /summary, GET /examples/active (mounted at /api/prompt-generations) |
| `backend/src/routes/companion-feedback.ts` | POST / (mounted at /api/companion-feedback) |

### Modified Files

| File | Change |
|---|---|
| `mobile/src/constants/persona.ts` | XML restructure, WHY rationale, positive framing, aggression tuning, self-check |
| `mobile/src/lib/progressive-generation.ts` | Inject examples, call validator after generation, log to backend |
| `mobile/src/lib/companion-service.ts` | Structured headers, examples, WHY rationale for Grok prompts |
| `mobile/src/lib/companion-chat-store.ts` | Wire setFeedback to POST companion feedback to backend |
| `backend/src/lib/companion-prompt.ts` | Full rewrite: 14-category expanded prompt (~6,000 tokens static) |
| `backend/src/db/schema.ts` | Add prompt_generations, prompt_violations, companion_feedback, dynamic_prompt_examples tables |
| `backend/src/index.ts` | Register new route modules |
| `backend/src/middleware/rate-limit.ts` | Add rate limit entries for new endpoints |
| `backend/src/utils/fish-audio-annotation-prompt.ts` | Structured headers, WHY rationale |

---

## Task 1: Backend — Database Schema

Add 4 new tables to the Drizzle schema for violation tracking, companion feedback, and adaptive examples.

**Files:**
- Modify: `backend/src/db/schema.ts` (append after line 432)

- [ ] **Step 1: Add prompt_generations table**

Append to `backend/src/db/schema.ts`:

```typescript
// ---------------------------------------------------------------------------
// Prompt Engineering — generation log, violations, feedback, dynamic examples
// ---------------------------------------------------------------------------

export const promptGenerations = pgTable(
  "prompt_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    clerkUserId: text("clerk_user_id").notNull(),
    model: text("model").notNull(),
    persona: text("persona"),
    dayNumber: integer("day_number"),
    seriesLength: integer("series_length"),
    hadViolations: boolean("had_violations").notNull().default(false),
    violationCount: integer("violation_count").notNull().default(0),
    promptHash: text("prompt_hash"),
  },
  (table) => [
    index("idx_generations_date").on(table.createdAt),
    index("idx_generations_model").on(table.model, table.createdAt),
  ],
);

export type PromptGeneration = typeof promptGenerations.$inferSelect;
export type NewPromptGeneration = typeof promptGenerations.$inferInsert;
```

- [ ] **Step 2: Add prompt_violations table**

Append to `backend/src/db/schema.ts`:

```typescript
export const promptViolations = pgTable(
  "prompt_violations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    generationId: uuid("generation_id").references(() => promptGenerations.id),
    model: text("model").notNull(),
    persona: text("persona"),
    dayNumber: integer("day_number"),
    seriesLength: integer("series_length"),
    rule: text("rule").notNull(),
    original: text("original").notNull(),
    fixed: text("fixed"),
    location: text("location"),
    autoFixed: boolean("auto_fixed").notNull().default(false),
    promptHash: text("prompt_hash"),
  },
  (table) => [
    index("idx_violations_rule_date").on(table.rule, table.createdAt),
    index("idx_violations_model_date").on(table.model, table.createdAt),
    index("idx_violations_generation").on(table.generationId),
  ],
);

export type PromptViolation = typeof promptViolations.$inferSelect;
export type NewPromptViolation = typeof promptViolations.$inferInsert;
```

- [ ] **Step 3: Add companion_feedback table**

Append to `backend/src/db/schema.ts`:

```typescript
export const companionFeedback = pgTable(
  "companion_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    clerkUserId: text("clerk_user_id").notNull(),
    messageId: text("message_id").notNull(),
    feedback: text("feedback").notNull(), // 'positive' | 'negative'
    messageContent: text("message_content"),
    userMessage: text("user_message"),
    model: text("model"),
    companionName: text("companion_name"),
    contextSummary: text("context_summary"),
  },
  (table) => [
    index("idx_feedback_type_date").on(table.feedback, table.createdAt),
  ],
);

export type CompanionFeedbackRow = typeof companionFeedback.$inferSelect;
export type NewCompanionFeedback = typeof companionFeedback.$inferInsert;
```

- [ ] **Step 4: Add dynamic_prompt_examples table**

Append to `backend/src/db/schema.ts`:

```typescript
export const dynamicPromptExamples = pgTable(
  "dynamic_prompt_examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    rule: text("rule").notNull(),
    badText: text("bad_text").notNull(),
    goodText: text("good_text").notNull(),
    active: boolean("active").default(true),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    violationRateAtCreation: real("violation_rate_at_creation"),
  },
);

export type DynamicPromptExample = typeof dynamicPromptExamples.$inferSelect;
export type NewDynamicPromptExample = typeof dynamicPromptExamples.$inferInsert;
```

- [ ] **Step 5: Push schema to Railway**

```bash
cd /Users/galangster/clawd/work/unfold/backend
# Enable Railway Postgres public networking first (if not already)
npx drizzle-kit push
```

Expected: 4 new tables created, 0 existing tables modified.

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/db/schema.ts
git commit -m "feat(backend): add prompt engineering DB tables

prompt_generations, prompt_violations, companion_feedback,
dynamic_prompt_examples — for violation tracking and self-improving system"
```

---

## Task 2: Backend — Prompt Generations Endpoints

Three endpoints: log generations+violations, admin summary, and active dynamic example.

**Files:**
- Create: `backend/src/routes/prompt-generations.ts`
- Modify: `backend/src/index.ts` (register route)
- Modify: `backend/src/middleware/rate-limit.ts` (add rate limit entries)

- [ ] **Step 1: Create prompt-generations route file**

Create `backend/src/routes/prompt-generations.ts`.

**Important patterns from existing code:**
- Routes use `_db!` guard pattern (see `stories.ts` line 2-5)
- Routes define relative paths (mounted via `app.use("/api/prompt-generations", authMiddleware, rateLimitMiddleware, router)`)

```typescript
import { Router, Request, Response } from "express";
import { db as _db } from "../db";
import { promptGenerations, promptViolations, dynamicPromptExamples } from "../db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";

const db = _db!;
const router = Router();

// ---------------------------------------------------------------------------
// POST / — log a generation + its violations
// ---------------------------------------------------------------------------

router.post("/", async (req: Request, res: Response) => {
  try {
    const uid = req.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const { model, persona, dayNumber, seriesLength, promptHash, hadViolations, violations } = req.body;

    if (!model || typeof model !== "string") {
      return res.status(400).json({ error: "model is required" });
    }

    const violationArr = Array.isArray(violations) ? violations : [];

    // Insert generation row
    const [gen] = await db.insert(promptGenerations).values({
      clerkUserId: uid,
      model,
      persona: typeof persona === "string" ? persona.slice(0, 100) : null,
      dayNumber: typeof dayNumber === "number" ? dayNumber : null,
      seriesLength: typeof seriesLength === "number" ? seriesLength : null,
      hadViolations: !!hadViolations,
      violationCount: violationArr.length,
      promptHash: typeof promptHash === "string" ? promptHash.slice(0, 128) : null,
    }).returning({ id: promptGenerations.id });

    // Insert violation rows
    if (violationArr.length > 0 && gen) {
      const violationRows = violationArr.slice(0, 50).map((v: any) => ({
        generationId: gen.id,
        model,
        persona: typeof persona === "string" ? persona.slice(0, 100) : null,
        dayNumber: typeof dayNumber === "number" ? dayNumber : null,
        seriesLength: typeof seriesLength === "number" ? seriesLength : null,
        rule: String(v.rule || "unknown").slice(0, 100),
        original: String(v.original || "").slice(0, 2000),
        fixed: v.fixed ? String(v.fixed).slice(0, 2000) : null,
        location: v.location ? String(v.location).slice(0, 100) : null,
        autoFixed: !!v.autoFixed,
        promptHash: typeof promptHash === "string" ? promptHash.slice(0, 128) : null,
      }));

      await db.insert(promptViolations).values(violationRows);
    }

    // Return the active dynamic example (if any) for the client to cache
    const activeExample = await db.select({
      rule: dynamicPromptExamples.rule,
      badText: dynamicPromptExamples.badText,
      goodText: dynamicPromptExamples.goodText,
      createdAt: dynamicPromptExamples.createdAt,
    })
      .from(dynamicPromptExamples)
      .where(eq(dynamicPromptExamples.active, true))
      .limit(1);

    res.json({
      generationId: gen?.id,
      activeDynamicExample: activeExample[0] || null,
    });
  } catch (err) {
    console.error("[prompt-generations] POST error:", err);
    res.status(500).json({ error: "Failed to log generation" });
  }
});

// ---------------------------------------------------------------------------
// GET /summary — admin-only violation summary
// ---------------------------------------------------------------------------

const ADMIN_CLERK_IDS = (process.env.ADMIN_CLERK_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const uid = req.uid;
    if (!uid || !ADMIN_CLERK_IDS.includes(uid)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const days = Math.min(parseInt(String(req.query.days)) || 30, 90);
    const since = new Date(Date.now() - days * 86400000);

    const [genCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(promptGenerations)
      .where(gte(promptGenerations.createdAt, since));

    const [violCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(promptViolations)
      .where(gte(promptViolations.createdAt, since));

    const topRules = await db.select({
      rule: promptViolations.rule,
      count: sql<number>`count(*)::int`,
    })
      .from(promptViolations)
      .where(gte(promptViolations.createdAt, since))
      .groupBy(promptViolations.rule)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const totalGen = genCount?.count ?? 0;
    const totalViol = violCount?.count ?? 0;

    // By model breakdown
    const byModelRows = await db.select({
      model: promptGenerations.model,
      generations: sql<number>`count(*)::int`,
      withViolations: sql<number>`count(*) filter (where ${promptGenerations.hadViolations})::int`,
    })
      .from(promptGenerations)
      .where(gte(promptGenerations.createdAt, since))
      .groupBy(promptGenerations.model);

    const byModel: Record<string, any> = {};
    for (const row of byModelRows) {
      byModel[row.model] = { generations: row.generations, violations: row.withViolations, rate: row.generations > 0 ? row.withViolations / row.generations : 0 };
    }

    // By persona breakdown
    const byPersonaRows = await db.select({
      persona: promptGenerations.persona,
      generations: sql<number>`count(*)::int`,
      withViolations: sql<number>`count(*) filter (where ${promptGenerations.hadViolations})::int`,
    })
      .from(promptGenerations)
      .where(gte(promptGenerations.createdAt, since))
      .groupBy(promptGenerations.persona);

    const byPersona: Record<string, any> = {};
    for (const row of byPersonaRows) {
      if (row.persona) byPersona[row.persona] = { generations: row.generations, violations: row.withViolations, rate: row.generations > 0 ? row.withViolations / row.generations : 0 };
    }

    // Weekly trend
    const trend = await db.select({
      week: sql<string>`date_trunc('week', ${promptGenerations.createdAt})::text`,
      generations: sql<number>`count(*)::int`,
      withViolations: sql<number>`count(*) filter (where ${promptGenerations.hadViolations})::int`,
    })
      .from(promptGenerations)
      .where(gte(promptGenerations.createdAt, since))
      .groupBy(sql`date_trunc('week', ${promptGenerations.createdAt})`)
      .orderBy(sql`date_trunc('week', ${promptGenerations.createdAt})`);

    res.json({
      totalGenerations: totalGen,
      totalViolations: totalViol,
      violationRate: totalGen > 0 ? totalViol / totalGen : 0,
      topRules: topRules.map(r => ({
        rule: r.rule,
        count: r.count,
        percentage: totalViol > 0 ? (r.count / totalViol * 100).toFixed(1) : "0",
      })),
      byModel,
      byPersona,
      trend: trend.map(t => ({ week: t.week, generations: t.generations, violations: t.withViolations, rate: t.generations > 0 ? t.withViolations / t.generations : 0 })),
      days,
    });
  } catch (err) {
    console.error("[prompt-generations] GET summary error:", err);
    res.status(500).json({ error: "Failed to query summary" });
  }
});

// ---------------------------------------------------------------------------
// GET /examples/active — active dynamic example for prompt injection
// ---------------------------------------------------------------------------

router.get("/examples/active", async (req: Request, res: Response) => {
  try {
    const uid = req.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const activeExample = await db.select({
      rule: dynamicPromptExamples.rule,
      badText: dynamicPromptExamples.badText,
      goodText: dynamicPromptExamples.goodText,
      createdAt: dynamicPromptExamples.createdAt,
    })
      .from(dynamicPromptExamples)
      .where(eq(dynamicPromptExamples.active, true))
      .limit(1);

    res.json({ activeExample: activeExample[0] || null });
  } catch (err) {
    console.error("[prompt-examples] GET active error:", err);
    res.status(500).json({ error: "Failed to fetch active example" });
  }
});

export default router;
```

- [ ] **Step 2: Register route in index.ts**

In `backend/src/index.ts`, add import after line 11:

```typescript
import promptGenerationsRouter from "./routes/prompt-generations";
```

Then register with auth + rate limit middleware (matching existing pattern in index.ts ~line 700):

```typescript
app.use("/api/prompt-generations", authMiddleware, rateLimitMiddleware, promptGenerationsRouter);
```

Note: `authMiddleware` is the function at ~line 87 that sets `req.uid` from Clerk JWT. Routes must be registered with it or `req.uid` will be undefined.

- [ ] **Step 3: Add rate limit entries**

In `backend/src/middleware/rate-limit.ts`, add to `ENDPOINT_GROUPS` (after line 26):

```typescript
  "/api/prompt-generations": "db-write",
  "/api/prompt-generations/summary": "db-read",
  "/api/prompt-generations/examples/active": "db-read",
  "/api/companion-feedback": "db-write",
```

The prefix matching in `getEndpointGroup()` handles sub-routes, but explicit entries ensure correct cost groups.

- [ ] **Step 4: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/routes/prompt-generations.ts src/index.ts src/middleware/rate-limit.ts
git commit -m "feat(backend): add prompt generation logging endpoints

POST /api/prompt-generations — logs generation + violations
GET /api/prompt-generations/summary — admin violation dashboard
GET /api/prompt-examples/active — active dynamic example for clients"
```

---

## Task 3: Backend — Companion Feedback Endpoint

Wire existing thumbs up/down UI to backend storage.

**Files:**
- Create: `backend/src/routes/companion-feedback.ts`
- Modify: `backend/src/index.ts` (register route)

- [ ] **Step 1: Create companion-feedback route**

Create `backend/src/routes/companion-feedback.ts`:

```typescript
import { Router, Request, Response } from "express";
import { db as _db } from "../db";
import { companionFeedback } from "../db/schema";

const db = _db!;
const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const uid = req.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const { messageId, feedback, messageContent, userMessage, model, companionName, contextSummary } = req.body;

    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "messageId is required" });
    }
    if (feedback !== "positive" && feedback !== "negative") {
      return res.status(400).json({ error: "feedback must be 'positive' or 'negative'" });
    }

    await db.insert(companionFeedback).values({
      clerkUserId: uid,
      messageId: messageId.slice(0, 200),
      feedback,
      messageContent: typeof messageContent === "string" ? messageContent.slice(0, 5000) : null,
      userMessage: typeof userMessage === "string" ? userMessage.slice(0, 5000) : null,
      model: typeof model === "string" ? model.slice(0, 100) : null,
      companionName: typeof companionName === "string" ? companionName.slice(0, 50) : null,
      contextSummary: typeof contextSummary === "string" ? contextSummary.slice(0, 1000) : null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[companion-feedback] POST error:", err);
    res.status(500).json({ error: "Failed to log feedback" });
  }
});

export default router;
```

- [ ] **Step 2: Register route in index.ts**

In `backend/src/index.ts`, add import:

```typescript
import companionFeedbackRouter from "./routes/companion-feedback";
```

Then register with auth + rate limit middleware:

```typescript
app.use("/api/companion-feedback", authMiddleware, rateLimitMiddleware, companionFeedbackRouter);
```

- [ ] **Step 3: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/routes/companion-feedback.ts src/index.ts
git commit -m "feat(backend): add companion feedback endpoint

POST /api/companion-feedback — logs thumbs up/down from chat UI"
```

---

## Task 4: Mobile — Prompt Rules Constants

Condensed, testable rule definitions used by both the validator prompt and client-side detection.

**Files:**
- Create: `mobile/src/constants/prompt-rules.ts`
- Create: `mobile/src/lib/__tests__/prompt-rules.test.ts`

- [ ] **Step 1: Write failing tests for rule detection**

Create `mobile/src/lib/__tests__/prompt-rules.test.ts`:

```typescript
import { detectViolations, VALIDATION_RULES } from '@/constants/prompt-rules';

describe('prompt-rules', () => {
  it('detects banned phrases', () => {
    const violations = detectViolations('This journey has been beautiful and amazing.');
    const rules = violations.map(v => v.rule);
    expect(rules).toContain('banned_phrase');
  });

  it('detects first-person pronouns outside prayer', () => {
    const violations = detectViolations('I remember when my faith was shaken.');
    expect(violations.some(v => v.rule === 'first_person')).toBe(true);
  });

  it('allows first-person in closing prayers', () => {
    const violations = detectViolations('God, help us see Your love.', 'closingPrayer');
    expect(violations.some(v => v.rule === 'first_person')).toBe(false);
  });

  it('detects negation patterns', () => {
    const violations = detectViolations("That's not weakness. That's courage.");
    expect(violations.some(v => v.rule === 'negation_pattern')).toBe(true);
  });

  it('detects em dashes', () => {
    const violations = detectViolations('Faith — real faith — changes everything.');
    expect(violations.some(v => v.rule === 'em_dash')).toBe(true);
  });

  it('detects lowercase God', () => {
    const violations = detectViolations('When god speaks, we should listen.');
    expect(violations.some(v => v.rule === 'capitalization')).toBe(true);
  });

  it('returns empty for clean text', () => {
    const violations = detectViolations('You know that feeling when the morning is quiet and you just sit there.');
    expect(violations).toHaveLength(0);
  });

  it('exports a condensed rules string for the validator prompt', () => {
    expect(typeof VALIDATION_RULES).toBe('string');
    expect(VALIDATION_RULES.length).toBeGreaterThan(100);
    expect(VALIDATION_RULES.length).toBeLessThan(3000); // ~400 tokens target
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx jest src/lib/__tests__/prompt-rules.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompt-rules.ts**

Create `mobile/src/constants/prompt-rules.ts`:

```typescript
/**
 * Condensed, testable rule definitions for the prompt validation chain.
 *
 * Used by:
 * - prompt-validator.ts (sends VALIDATION_RULES to Haiku)
 * - Client-side pre-check (detectViolations)
 */

import { BANNED_PHRASES } from './persona';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedViolation {
  rule: 'banned_phrase' | 'first_person' | 'negation_pattern' | 'em_dash' | 'capitalization' | 'word_count' | 'opening_pattern' | 'closing_pattern';
  original: string;
  location?: string;
}

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

const FIRST_PERSON_REGEX = /\b(I|I'm|I've|I'd|I'll|my|mine|me|we|we're|we've|our|ours|us)\b/g;

const NEGATION_PATTERNS = [
  /(?:That's|This\s+is(?:n't)?|It's)\s+not\s+\w+[\.,]\s*(?:That's|This\s+is|It's)\s+/gi,
  /Not\s+\w+[\.,]\s*(?:But|Rather|Instead)\s+/gi,
  /not\s+a\s+\w+[,;.]\s*(?:it's|that's|this\s+is)\s+a\s+/gi,
];

const EM_DASH_REGEX = /\u2014/g; // —

const LOWERCASE_GOD_REGEX = /\bgod\b(?!\s*(?:s\b|less|like|awful|forsaken|damn|speed|father|mother|child|send|given|fearing))/g;

// ---------------------------------------------------------------------------
// Client-side detection (runs before Haiku validation for instant feedback)
// ---------------------------------------------------------------------------

export function detectViolations(
  text: string,
  fieldType?: string,
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  // Banned phrases
  for (const phrase of BANNED_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push({ rule: 'banned_phrase', original: phrase });
    }
  }

  // First-person (skip in closingPrayer)
  if (fieldType !== 'closingPrayer') {
    const matches = text.match(FIRST_PERSON_REGEX);
    if (matches) {
      violations.push({ rule: 'first_person', original: matches.slice(0, 3).join(', ') });
    }
  }

  // Negation patterns
  for (const pattern of NEGATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({ rule: 'negation_pattern', original: match[0].trim() });
    }
  }

  // Em dashes
  if (EM_DASH_REGEX.test(text)) {
    violations.push({ rule: 'em_dash', original: '—' });
  }

  // Capitalization — "god" lowercase in theological context
  // Reset lastIndex since we reuse the regex
  LOWERCASE_GOD_REGEX.lastIndex = 0;
  if (LOWERCASE_GOD_REGEX.test(text)) {
    violations.push({ rule: 'capitalization', original: 'god (lowercase)' });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Condensed rules string sent to Haiku validator (~400 tokens)
// ---------------------------------------------------------------------------

export const VALIDATION_RULES = `<rules>
<rule name="banned_phrase" auto_fix="true">
Rewrite any sentence containing these phrases without the phrase:
${BANNED_PHRASES.slice(0, 30).map(p => `"${p}"`).join(', ')}
(Plus ~30 more in the full list)
Why: These are recognized AI tells that make readers dismiss content as generated.
</rule>

<rule name="first_person" auto_fix="true">
No first-person pronouns (I, my, me, we, our) except in closingPrayer fields.
Rewrite to second person (you/your) or third person.
Why: The author is an AI. First-person anecdotes are dishonest.
</rule>

<rule name="negation_pattern" auto_fix="true">
No "Not X. But Y." or "That's not X, that's Y" rhetorical patterns.
Rewrite as a direct positive statement.
Why: This is the most common AI devotional tell. Readers recognize it instantly.
</rule>

<rule name="em_dash" auto_fix="true">
No em dashes (—). Replace with comma, period, or "and".
Why: TTS engines read em dashes as awkward pauses.
</rule>

<rule name="capitalization" auto_fix="true">
"God" must be capitalized when referring to the Christian God.
"He", "Him", "His" capitalized when referring to God or Jesus.
</rule>

<rule name="word_count" auto_fix="false">
Body text should be within the target word count range for the reading duration.
Flag only — do not rewrite.
</rule>

<rule name="opening_pattern" auto_fix="false">
Should not start with "Have you ever..." — flag only.
</rule>

<rule name="closing_pattern" auto_fix="false">
Should not end with a summary paragraph — flag only.
</rule>
</rules>`;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx jest src/lib/__tests__/prompt-rules.test.ts --no-coverage
```

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/constants/prompt-rules.ts src/lib/__tests__/prompt-rules.test.ts
git commit -m "feat: add prompt rules constants with client-side detection

Condensed testable rules for banned phrases, first-person, negation
patterns, em dashes, capitalization. Used by validator chain."
```

---

## Task 5: Mobile — Prompt Validator

The validation chain: send generated devotional to Haiku for checking, parse violations, apply correctedText.

**Files:**
- Create: `mobile/src/lib/prompt-validator.ts`
- Create: `mobile/src/lib/__tests__/prompt-validator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `mobile/src/lib/__tests__/prompt-validator.test.ts`:

```typescript
import { parseValidationResponse, applyValidation } from '@/lib/prompt-validator';

describe('prompt-validator', () => {
  describe('parseValidationResponse', () => {
    it('parses clean response', () => {
      const result = parseValidationResponse(JSON.stringify({
        hasViolations: false,
        violations: [],
        correctedText: null,
      }));
      expect(result.hasViolations).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('parses response with violations', () => {
      const result = parseValidationResponse(JSON.stringify({
        hasViolations: true,
        violations: [
          { rule: 'banned_phrase', original: 'journey', fixed: 'path', location: 'bodyText' },
        ],
        correctedText: 'The path was long.',
      }));
      expect(result.hasViolations).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.correctedText).toBe('The path was long.');
    });

    it('handles malformed JSON gracefully', () => {
      const result = parseValidationResponse('not json at all');
      expect(result.hasViolations).toBe(false);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('applyValidation', () => {
    it('returns original when no violations', () => {
      const day = { bodyText: 'Good text.', title: 'Title' };
      const validation = { hasViolations: false, violations: [], correctedText: null };
      const result = applyValidation(day as any, validation);
      expect(result.bodyText).toBe('Good text.');
    });

    it('applies correctedText to bodyText', () => {
      const day = { bodyText: 'A journey of faith.', title: 'Title' };
      const validation = {
        hasViolations: true,
        violations: [{ rule: 'banned_phrase', original: 'journey', fixed: 'walk', location: 'bodyText' }],
        correctedText: 'A walk of faith.',
      };
      const result = applyValidation(day as any, validation);
      expect(result.bodyText).toBe('A walk of faith.');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx jest src/lib/__tests__/prompt-validator.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompt-validator.ts**

Create `mobile/src/lib/prompt-validator.ts`:

```typescript
/**
 * Prompt Validation Chain
 *
 * After devotional generation, sends the output to Haiku for rule-checking.
 * Haiku validates against condensed rules, returns violations and correctedText.
 * correctedText is authoritative — the app uses it as the final output.
 *
 * Call path: mobile → backend proxy (/api/generate/devotional) → Anthropic Haiku
 */

import { postJsonWithBackendFallback } from './devotional-service';
import { VALIDATION_RULES } from '@/constants/prompt-rules';
import { logger } from '@/lib/logger';
import { getAuthHeaders, PRIMARY_BACKEND_URL } from '@/lib/api-config';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Shared Haiku model constant — single source of truth */
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationViolation {
  rule: string;
  original: string;
  fixed: string | null;
  location: string;
}

export interface ValidationResult {
  hasViolations: boolean;
  violations: ValidationViolation[];
  correctedText: string | null;
}

// ---------------------------------------------------------------------------
// Parse Haiku's validation response
// ---------------------------------------------------------------------------

export function parseValidationResponse(raw: string): ValidationResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      hasViolations: !!parsed.hasViolations,
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      correctedText: typeof parsed.correctedText === 'string' ? parsed.correctedText : null,
    };
  } catch {
    logger.warn('[Validator] Failed to parse validation response, passing through');
    return { hasViolations: false, violations: [], correctedText: null };
  }
}

// ---------------------------------------------------------------------------
// Apply validation result to a devotional day
// ---------------------------------------------------------------------------

export function applyValidation<T extends { bodyText: string }>(
  day: T,
  validation: ValidationResult,
): T {
  if (!validation.hasViolations || !validation.correctedText) {
    return day;
  }
  return { ...day, bodyText: validation.correctedText };
}

// ---------------------------------------------------------------------------
// Run validation chain (call Haiku via backend proxy)
// ---------------------------------------------------------------------------

export async function validateDevotional(bodyText: string): Promise<ValidationResult> {
  try {
    const validatorPrompt = `<task>
Review this devotional text against the rules below.
For each violation found, return the original text and a corrected version.
Corrections must preserve the author's voice and meaning — change only what violates a rule.
If no violations, return the text unchanged.
</task>

${VALIDATION_RULES}

<devotional>
${bodyText}
</devotional>

Return ONLY valid JSON:
{
  "hasViolations": true|false,
  "violations": [
    {
      "rule": "banned_phrase|first_person|negation_pattern|em_dash|capitalization|word_count|opening_pattern|closing_pattern",
      "original": "the exact violating text",
      "fixed": "the corrected text (null for flag-only rules)",
      "location": "bodyText"
    }
  ],
  "correctedText": "full corrected text with all fixes applied, or null if no auto-fixable violations"
}`;

    const { response } = await postJsonWithBackendFallback(
      '/api/generate/devotional',
      {
        model: HAIKU_MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: 'You are a strict text validator. Return only valid JSON. No commentary.',
        messages: [{ role: 'user', content: validatorPrompt }],
      },
      { timeoutMs: 30000 },
    );

    if (!response.ok) {
      logger.warn(`[Validator] HTTP ${response.status}, passing through`);
      return { hasViolations: false, violations: [], correctedText: null };
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
    return parseValidationResponse(text);
  } catch (err) {
    logger.warn('[Validator] Validation failed, passing through:', err);
    return { hasViolations: false, violations: [], correctedText: null };
  }
}

// ---------------------------------------------------------------------------
// Log generation + violations to backend (async, fire-and-forget)
// ---------------------------------------------------------------------------

export async function logGenerationToBackend(params: {
  model: string;
  persona: string | null;
  dayNumber: number;
  seriesLength: number;
  promptHash: string;
  hadViolations: boolean;
  violations: ValidationViolation[];
}): Promise<{ activeDynamicExample: { rule: string; badText: string; goodText: string } | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${PRIMARY_BACKEND_URL}/api/prompt-generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Silent — logging is best-effort
  }
  return { activeDynamicExample: null };
}
```

- [ ] **Step 4: Verify backend proxy respects model parameter**

Before running tests, verify that `handleAIRequest` in `backend/src/index.ts` forwards the `model` field from the request body to Anthropic. Check ~line 415-430. If the backend overrides the model (e.g., always uses Sonnet), the validator will use the wrong model and cost 3x more. The existing ALLOWED_MODELS set already includes `claude-haiku-4-5-20251001`, so this should work.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx jest src/lib/__tests__/prompt-validator.test.ts --no-coverage
```

Expected: All 5 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/prompt-validator.ts src/lib/__tests__/prompt-validator.test.ts
git commit -m "feat: add prompt validation chain

Haiku validator via backend proxy, parse violations, apply
correctedText, log generations to backend (async)"
```

---

## Task 6: Mobile — Persona.ts XML Restructure

Transform PERSONA_FULL from ALL-CAPS headers to XML tags with WHY rationale, positive framing, and self-verification checklist. This is the foundation that all prompts build on.

**Files:**
- Modify: `mobile/src/constants/persona.ts`

- [ ] **Step 1: Restructure PERSONA_FULL with XML tags**

Replace the entire `PERSONA_FULL` constant (lines 67-106 of `persona.ts`) with XML-tagged version:

```typescript
export const PERSONA_FULL = `<voice_persona>
You are a friend who's about 5 years ahead of the reader in faith. Not a pastor. Not a professor. Someone who's been through real darkness and found something real there. You read widely but don't show off. You pray honestly, sometimes with doubt. You never make the reader feel small for questioning.
</voice_persona>

<voice_rules reason="These measurable targets keep the writing natural and prevent AI monotone">
- Sentence rhythm: average 10-14 words per sentence. 40%+ of your sentences should be under 8 words. Never write 3 long sentences in a row.
- Vocabulary: Grade 7-8 reading level. No seminary jargon. Say what you mean plainly.
- Write the way a real 28-year-old would text a close friend about something that matters.
- Zero hedging: No "perhaps," "maybe consider," "it might be worth." Say it or don't.
- Honesty: Name hard things directly. Never minimize. Never rush past pain. But don't dwell. Acknowledge and move with them.
- Openings: Start with something natural, a question, an observation, or a short statement. Never "Have you ever..."
- Closings: End with a question or a short sentence. Never summarize.
- Address: Use "you" freely. Use their name once per piece, early and natural.
- Tone: Casual but sincere, like a voice note from a friend, not a sermon or a poem.
- Humor: Dry, rare, never at the reader's expense.
</voice_rules>

<point_of_view reason="You are an AI. First-person anecdotes are dishonest and break the trust this app is built on">
- Do not write in first person ("I", "I've", "I'm", "my", "me", "we", "our"). You have no personal experiences, memories, or anecdotes.
- Use second person ("you", "your") to address the reader directly. This is your primary voice.
- Use third person for stories and examples: "A woman once...", "There was a farmer who..."
- You can create original parables and illustrative stories, but they must be third person.
- You can reference real historical figures, biblical characters, and documented events.
- The only exception: brief direct-to-God prayer lines ("God, help us see...") in closing prayers.
</point_of_view>

<formatting_rules>
- Always capitalize "God" when referring to the Christian God. Capitalize "He", "Him", "His" when referring to God or Jesus.
- Do not use em dashes. Use commas, periods, or "and" instead. Em dashes cause awkward pauses in text-to-speech.
- Do not use profanity or crude language. Keep it clean but not stiff.
</formatting_rules>

<banned_phrases reason="These are recognized AI tells. Readers who have seen AI-generated content will immediately dismiss the devotional">
"journey," "season," "unpack," "lean into," "sit with," "pour out," "throne of grace," "wrestle with," "beautiful," "amazing," "incredible," "powerful," "deeply," "profoundly," "truly," "really," "Have you ever," "Here's the thing," "Let that sink in," "Read that again," "In a world where," "What if I told you," "Think about that for a moment," "Can I be honest?," "step into," "this changes everything," "just want to."
Also: "Here's what most people miss/skip/don't see." Just say the insight directly, the preamble adds nothing.
Also: Staccato commands ("Read that again. Not quickly." / "Stop. Think about that."). Strong content does not need commands telling the reader how to receive it.
</banned_phrases>

<anti_patterns reason="The 'Not X. But Y.' pattern is the most common AI devotional tell. Readers recognize it instantly">
Do not use the "not a...it's a..." rhetorical pattern. Examples to avoid:
- "That's not weakness, that's courage"
- "This isn't punishment, it's an invitation"
- "God isn't distant, He's right here"
State what something IS, directly. Say "That takes courage" instead of "That's not weakness, that's courage."
</anti_patterns>

<positive_direction reason="Knowing what TO write is as important as knowing what to avoid">
- Write like you are texting a close friend about something that actually matters to you.
- End with a single question the reader will carry into their day, or a short sentence that lands without explanation.
- Say it directly. If you believe it, state it. Your confidence gives the reader permission to consider it.
</positive_direction>

<self_check>
Before finalizing, verify:
1. No first-person pronouns (I/my/me/we/our) except in closing prayers
2. No phrases from the banned list
3. No "Not X. But Y." negation patterns
4. God/He/Him/His capitalized when referring to God
5. No em dashes
6. Opening is natural (not "Have you ever...")
7. Closing is a question or short sentence (not a summary)
8. Body text within word count range for this duration
</self_check>`;
```

- [ ] **Step 2: Update PERSONA_BRIEF similarly**

Replace `PERSONA_BRIEF` with a condensed XML version (~80 tokens, same content):

```typescript
export const PERSONA_BRIEF = `<voice>
You are a friend 5 years ahead in faith. Not a pastor, not a professor. Short sentences (avg 10-14 words, 40%+ under 8 words). Write like a 28-year-old texting a close friend about something real. Zero hedging. Name hard things directly. No purple prose.
</voice>
<rules>
Never use: "journey," "season," "lean into," "sit with," "unpack," "beautiful," "amazing," "Have you ever," "deeply," "profoundly." Never use the "not a...it's a..." reframe pattern. Do not write in first person (I/my/me/we/our), you are an AI with no personal experiences. Use second person. Always capitalize "God." End with a question or short sentence, never a summary.
</rules>`;
```

- [ ] **Step 3: Verify the build still works**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit 2>&1 | head -20
```

Expected: No type errors from persona.ts changes (it's just string constants).

- [ ] **Step 4: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/constants/persona.ts
git commit -m "refactor: restructure persona.ts with XML tags and WHY rationale

XML-tagged sections, WHY reasons on every rule, positive framing,
self-verification checklist. Foundation for prompt caching optimization."
```

---

## Task 7: Mobile — Few-Shot Examples

Static examples for devotional generation (3 universal + 5 persona) and companion chat (10 scenarios). Plus dynamic example caching.

**Files:**
- Create: `mobile/src/lib/prompt-examples.ts`

- [ ] **Step 1: Create prompt-examples.ts with universal examples**

Create `mobile/src/lib/prompt-examples.ts`. This file needs carefully crafted examples. Each example must follow every rule in persona.ts (no banned phrases, no first-person, no negation patterns, etc.).

Use Opus at maximum thinking depth to craft these examples. The file structure:

```typescript
/**
 * Few-shot examples for AI prompt engineering.
 *
 * Static examples anchor quality. Dynamic examples auto-target
 * the most-violated rule from the self-improving system.
 */

import type { PersonaTrait } from '@/constants/devotional-personas-v2';

// ---------------------------------------------------------------------------
// Universal Core Examples (3 — injected into every devotional generation)
// ---------------------------------------------------------------------------

export const UNIVERSAL_EXAMPLES = `<examples>
<example type="good" label="natural opening">
{name}, there is a verse you have probably read a dozen times. Romans 8:28, the one about all things working together. Most people stop there.

But the next verse says something that changes the whole picture. God is shaping you into the image of His Son. Not fixing you. Not optimizing you. Shaping you.

That is a slower word. A more patient word.
</example>

<example type="contrast" label="banned patterns vs clean writing">
<bad>
This journey of faith is truly beautiful. Have you ever felt like God was doing something incredible in your life? Here's the thing — that's not weakness, that's courage. Let that sink in. In a world where everyone is searching, God meets you right where you are.
</bad>
<good>
Faith does not always feel like progress. Some mornings you wake up and wonder if anything changed at all. Paul knew that feeling. He called it groaning. The whole creation groans, he said, and so do you. That is honest. And God does not flinch at honest.
</good>
</example>

<example type="good" label="closing">
So here is the question you might carry into tomorrow: What if the thing you are most afraid to say out loud is the exact thing God is waiting to hear from you?
</example>
</examples>`;

// ---------------------------------------------------------------------------
// Persona-specific examples (1 per archetype, ~100 words each)
// ---------------------------------------------------------------------------

const PERSONA_EXAMPLES: Record<string, string> = {
  gentle_guide: `<persona_example voice="gentle_guide">
{name}, you might not feel ready for this. That is okay.

There is a verse in Isaiah where God tells His people to wait. Not the motivational-poster kind of waiting. The kind where your legs are tired and you are not sure the sun is coming up. "Those who wait on the Lord shall renew their strength."

Renew. Not create from scratch. He is not asking you to start over. He is asking you to stay.

What would it look like to stay one more day?
</persona_example>`,

  prophetic_challenger: `<persona_example voice="prophetic_challenger">
{name}, you have been playing it safe. You know it.

James did not mince words: "Faith without works is dead." Not struggling. Not tired. Dead. That is a hard word because James meant it to be hard.

The question is not whether you believe the right things. You do. The question is whether your Tuesday looks any different because of it.

God is not interested in your theology if it never makes it to your calendar. So what are you going to do about this week?
</persona_example>`,

  poetic_mystic: `<persona_example voice="poetic_mystic">
There is a kind of silence that feels like absence. And then there is the silence of someone sitting beside you who does not need to speak.

{name}, the psalmist called it selah. Pause. Breathe. Let the weight of the words settle like dust after a long walk.

God is not always loud. Sometimes He is the space between the notes. The rest in the music that makes the melody make sense.

You do not need to fill the quiet today. Just be in it.
</persona_example>`,

  scholarly_pastor: `<persona_example voice="scholarly_pastor">
{name}, the Greek word Paul uses here is katallage. Most translations say "reconciliation," but that misses something. Katallage means an exchange, a complete reversal of relationship.

In the Roman world, this was a diplomatic term. Two nations at war would undergo katallage, a formal restoration of peace. Paul borrows that word and gives it to a carpenter from Nazareth and a God who refuses to stay angry.

That context matters because reconciliation is not a feeling. It is an accomplished fact. What changes when you stop trying to earn what has already been given?
</persona_example>`,

  storyteller: `<persona_example voice="storyteller">
A woman in the third century named Perpetua kept a diary in prison. She was twenty-two, had a baby, and her father begged her to recant. She wrote that she could no more call herself something other than Christian than a jug could call itself something other than a jug.

{name}, she meant every word. She had lost the ability to pretend.

Most of faith is not dramatic. It is the quiet refusal to be something you are not, even when it would be easier.

What are you pretending about right now?
</persona_example>`,
};

// ---------------------------------------------------------------------------
// Trait-to-archetype mapping (v2 PersonaTraits → v1 example key)
// ---------------------------------------------------------------------------

const TRAIT_TO_ARCHETYPE: Record<string, string> = {
  gentle: 'gentle_guide',
  warm: 'gentle_guide',
  pastoral: 'gentle_guide',
  midwife: 'gentle_guide',
  intercessor: 'gentle_guide',
  challenging: 'prophetic_challenger',
  prophetic: 'prophetic_challenger',
  urgent: 'prophetic_challenger',
  iconoclast: 'prophetic_challenger',
  prophetic_lament: 'prophetic_challenger',
  poetic: 'poetic_mystic',
  mystical: 'poetic_mystic',
  apophatic: 'poetic_mystic',
  doxological: 'poetic_mystic',
  liturgical: 'poetic_mystic',
  monastic: 'poetic_mystic',
  scholarly: 'scholarly_pastor',
  socratic: 'scholarly_pastor',
  practical: 'scholarly_pastor',
  narrative: 'storyteller',
  raw: 'storyteller',
  confessional: 'storyteller',
  comic: 'storyteller',
  pilgrim: 'storyteller',
  artisan: 'storyteller',
  elder: 'storyteller',
  witty: 'storyteller',
};

export function getPersonaExample(primaryTrait: PersonaTrait): string {
  const archetype = TRAIT_TO_ARCHETYPE[primaryTrait] || 'gentle_guide';
  return PERSONA_EXAMPLES[archetype] || PERSONA_EXAMPLES.gentle_guide;
}

// ---------------------------------------------------------------------------
// Dynamic example cache (from self-improving system)
// ---------------------------------------------------------------------------

let cachedDynamicExample: { rule: string; badText: string; goodText: string } | null = null;

export function setCachedDynamicExample(example: { rule: string; badText: string; goodText: string } | null): void {
  cachedDynamicExample = example;
}

export function getDynamicExampleXml(): string {
  if (!cachedDynamicExample) return '';
  return `
<dynamic_example rule="${cachedDynamicExample.rule}" reason="This rule has a high violation rate — pay extra attention">
<bad>${cachedDynamicExample.badText}</bad>
<good>${cachedDynamicExample.goodText}</good>
</dynamic_example>`;
}
```

- [ ] **Step 2: Write tests for prompt-examples.ts**

Create `mobile/src/lib/__tests__/prompt-examples.test.ts`:

```typescript
import { getPersonaExample, UNIVERSAL_EXAMPLES, getDynamicExampleXml, setCachedDynamicExample } from '@/lib/prompt-examples';
import type { PersonaTrait } from '@/constants/devotional-personas-v2';

// All 27 PersonaTrait values
const ALL_TRAITS: PersonaTrait[] = [
  'gentle', 'challenging', 'poetic', 'scholarly', 'narrative', 'raw', 'warm',
  'prophetic', 'mystical', 'pastoral', 'witty', 'urgent', 'confessional',
  'practical', 'liturgical', 'apophatic', 'monastic', 'prophetic_lament',
  'doxological', 'socratic', 'midwife', 'iconoclast', 'elder', 'pilgrim',
  'artisan', 'comic', 'intercessor',
];

describe('prompt-examples', () => {
  it('UNIVERSAL_EXAMPLES is non-empty and contains XML tags', () => {
    expect(UNIVERSAL_EXAMPLES.length).toBeGreaterThan(100);
    expect(UNIVERSAL_EXAMPLES).toContain('<examples>');
    expect(UNIVERSAL_EXAMPLES).toContain('</examples>');
  });

  it('every PersonaTrait maps to a non-empty example', () => {
    for (const trait of ALL_TRAITS) {
      const example = getPersonaExample(trait);
      expect(example.length).toBeGreaterThan(50);
      expect(example).toContain('<persona_example');
    }
  });

  it('getDynamicExampleXml returns empty when no cache', () => {
    setCachedDynamicExample(null);
    expect(getDynamicExampleXml()).toBe('');
  });

  it('getDynamicExampleXml returns XML when cached', () => {
    setCachedDynamicExample({ rule: 'banned_phrase', badText: 'bad', goodText: 'good' });
    const xml = getDynamicExampleXml();
    expect(xml).toContain('<dynamic_example');
    expect(xml).toContain('bad');
    expect(xml).toContain('good');
    setCachedDynamicExample(null); // cleanup
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx jest src/lib/__tests__/prompt-examples.test.ts --no-coverage
```

Expected: All 4 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/prompt-examples.ts src/lib/__tests__/prompt-examples.test.ts
git commit -m "feat: add few-shot examples for devotional and companion prompts

3 universal core examples (opening, contrast, closing),
5 persona-specific examples with trait-to-archetype mapping,
dynamic example cache for self-improving system"
```

---

## Task 8: Mobile — Wire Validator into Progressive Generation

The critical integration: after Sonnet generates a devotional day, run it through Haiku validation, apply fixes, and log to backend.

**Files:**
- Modify: `mobile/src/lib/progressive-generation.ts` (around lines 700-736)

- [ ] **Step 1: Add imports**

At the top of `progressive-generation.ts`, add after line 19 (`import { sanitizeForPrompt }...`):

```typescript
import { validateDevotional, applyValidation, logGenerationToBackend, type ValidationResult } from './prompt-validator';
import { UNIVERSAL_EXAMPLES, getPersonaExample, getDynamicExampleXml, setCachedDynamicExample } from './prompt-examples';
```

- [ ] **Step 2: Inject examples into system prompt**

In `_generateProgressiveDayInternal`, modify the systemPrompt assembly (around line 631-644). After the existing array join, append examples:

```typescript
  const systemPrompt = [
    baseSystem,
    PETER_ENNS_ADDITION,
    CRAFT_FOUNDATION,
    ANTI_SLOP_DIRECTIVE,
    RHETORICAL_QUESTION_DIRECTIVE,
    convictionDirective,
    parableGuardrails,
    dialogueGuardrails,
    patternBreaks,
    voiceOverlay,
    voiceAdaptation,
    STICKY_SENTENCE_INSTRUCTION,
    // Few-shot examples (prompt engineering overhaul)
    UNIVERSAL_EXAMPLES,
    getPersonaExample(persona.primary),
    getDynamicExampleXml(),
  ].join('');
```

- [ ] **Step 3: Add validation after day object construction**

After the `day` object is constructed (around line 727, after `logger.log(... "Day ${dayNumber} generated"...)`), add the validation chain:

```typescript
  // --- Validation chain: run Haiku validator on bodyText ---
  let validationResult: ValidationResult = { hasViolations: false, violations: [], correctedText: null };
  try {
    validationResult = await validateDevotional(day.bodyText);
    if (validationResult.hasViolations && validationResult.correctedText) {
      logger.log(`Day ${dayNumber}: validator found ${validationResult.violations.length} violations, applying fixes`);
      day.bodyText = validationResult.correctedText;
    }
  } catch (valErr) {
    logger.warn(`Day ${dayNumber}: validation failed, using original text`, valErr);
  }

  // --- Log generation + violations to backend (async, fire-and-forget) ---
  const promptHashValue = ''; // TODO: compute SHA-256 of static system prompt portion
  logGenerationToBackend({
    model: 'claude-sonnet-4-6',
    persona: persona.primary,
    dayNumber,
    seriesLength: context.devotionalLength,
    promptHash: promptHashValue,
    hadViolations: validationResult.hasViolations,
    violations: validationResult.violations.map(v => ({
      ...v,
      autoFixed: v.fixed !== null,
    })),
  }).then(result => {
    if (result.activeDynamicExample) {
      setCachedDynamicExample(result.activeDynamicExample);
    }
  }).catch(() => { /* silent */ });
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit 2>&1 | head -20
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/progressive-generation.ts
git commit -m "feat: wire validation chain into progressive generation

After Sonnet generates a day, Haiku validates for violations.
Auto-fixes applied via correctedText. Violations logged to backend.
Dynamic examples cached from backend response."
```

---

## Task 9: Backend — Expanded Companion Static Prompt

Full rewrite of companion-prompt.ts: 14 categories, ~6,000 static tokens, XML structure, proper static/dynamic split for caching.

**Files:**
- Modify: `backend/src/lib/companion-prompt.ts`

- [ ] **Step 1: Rewrite STATIC_PROMPT**

Replace the `STATIC_PROMPT` constant (lines 112-148 of `companion-prompt.ts`) with the 14-category expanded version. The new prompt is too large to include inline here — it should be crafted carefully using the spec's category table as a guide:

1. Identity & Self-Awareness (~400 tokens) — "{companionName}" identity, never Claude
2. Purpose & Philosophy (~500 tokens) — why this companion exists
3. Theological Guardrails (~800 tokens) — core doctrinal positions
4. Pastoral Care Instincts (~700 tokens) — recognizing professional help needs
5. Sensitive Topic Navigation (~500 tokens) — suffering, politics, other faiths
6. Scripture Fluency (~400 tokens) — when to quote vs be present
7. Conversation Intelligence (~400 tokens) — when to push back vs listen
8. Prayer Partnership (~300 tokens) — praying together
9. Devotional Context Awareness (~400 tokens) — referencing past devotionals
10. Content Creation Partner (~300 tokens) — helping users create (Bible talks, lessons)
11. Response Formatting (~250 tokens) — format to match content type
12. Voice Rules + WHY Rationale (~500 tokens) — banned phrases, rhythm, anti-slop
13. Conversation Examples (10) (~750 tokens) — grief, doubt, celebration, etc.
14. Self-Check (~100 tokens) — identity verification

Each category uses XML tags. Total: ~6,000 static tokens.

**Crafting approach:** Use Opus at maximum thinking depth to write the full 14-category prompt. Feed it the spec's category table (Section 5.1), the existing `STATIC_PROMPT` from `companion-prompt.ts` (lines 112-148) as the baseline to expand from, the doctrinal beliefs from `unfold_doctrinal_beliefs.md`, and the conversation examples from the spec's companion section. Each category should be wrapped in XML tags (`<identity>`, `<purpose>`, `<theology>`, `<pastoral_care>`, `<sensitive_topics>`, `<scripture_fluency>`, `<conversation_intelligence>`, `<prayer_partnership>`, `<devotional_context>`, `<content_creation>`, `<response_formatting>`, `<voice_rules>`, `<conversation_examples>`, `<self_check>`).

**Key rules for writing this prompt:**
- Add `reason="..."` attributes to WHY-heavy sections
- Keep the `BANNED_PHRASES_SUBSET` but move it inside `<voice_rules>`
- Move `CRISIS PROTOCOL` into `<pastoral_care>` with stronger formatting
- The 10 conversation examples (grief, doubt, celebration, theological question, one-word, first conversation, prayer request, returning after gap, crisis-adjacent, practical question) go in `<conversation_examples>` — each ~60-80 words
- Add `<content_creation>` section for future companion capability (Bible talks, lessons, discussion questions)
- Add `<self_check>` at the end (identity, banned phrases, tone matching)
- The existing dynamic builder (`buildCompanionSystemPrompt`) stays the same — only the static prefix changes

- [ ] **Step 2: Verify the dynamic builder still works**

The `buildCompanionSystemPrompt()` function (lines 217-285) should not need changes — it appends dynamic context after the static prefix. Verify the function signature and return format are unchanged.

- [ ] **Step 3: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/lib/companion-prompt.ts
git commit -m "feat(backend): expand companion static prompt to 14 categories

~6,000 tokens static (up from ~700). XML structure, WHY rationale,
10 conversation examples, content creation partner section.
Comfortably exceeds Haiku cache threshold."
```

---

## Task 10: Mobile — Wire Companion Feedback to Backend

Make the existing thumbs up/down actually log to the backend.

**Files:**
- Modify: `mobile/src/lib/companion-chat-store.ts` (setFeedback at lines 172-188)

- [ ] **Step 1: Add backend feedback call to setFeedback**

In `companion-chat-store.ts`:

1. Add imports at the top of the file:

```typescript
import { getAuthHeaders, PRIMARY_BACKEND_URL } from '@/lib/api-config';
```

2. Modify the `setFeedback` action. After the existing local state update, add an async call to the backend:

```typescript
setFeedback: (id, feedback) =>
  set((s) => {
    const now = new Date().toISOString();
    const activeId = s.activeConversationId;

    // Fire backend log (async, best-effort)
    const activeConv = s.conversations.find(c => c.id === activeId);
    const msg = activeConv?.messages.find(m => m.id === id);
    if (msg) {
      const prevMsg = activeConv?.messages
        .filter(m => m.role === 'user')
        .slice(-1)[0];

      getAuthHeaders().then(headers => {
        fetch(`${PRIMARY_BACKEND_URL}/api/companion-feedback`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messageId: id,
            feedback,
            messageContent: msg.content?.slice(0, 5000),
            userMessage: prevMsg?.content?.slice(0, 5000),
            model: 'claude-haiku-4-5-20251001',
            companionName: null, // filled from store if available
            contextSummary: activeConv?.topicTags?.join(', '),
          }),
        }).catch(() => { /* silent */ });
      });
    }

    return {
      conversations: s.conversations.map(c => {
        if (c.id !== activeId) return c;
        return {
          ...c,
          updatedAt: now,
          messages: c.messages.map(m =>
            m.id === id ? { ...m, feedback, updatedAt: now } : m
          ),
        };
      }),
    };
  }),
```

- [ ] **Step 2: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/companion-chat-store.ts
git commit -m "feat: wire companion thumbs up/down to backend

setFeedback now POSTs to /api/companion-feedback (async, best-effort).
Local state update unchanged."
```

---

## Task 11: Mobile — Grok Prompt Improvements

Apply universal prompt engineering techniques to Grok-powered endpoints.

**Files:**
- Modify: `mobile/src/lib/companion-service.ts` (mood check-in prompts)
- Modify: `backend/src/utils/fish-audio-annotation-prompt.ts` (TTS annotation)

- [ ] **Step 1: Improve companion-service.ts mood check-in prompt**

In the system prompt construction (around lines 86-105 of `companion-service.ts`), restructure with clear sections, WHY rationale, and 2-3 short examples:

- Add structured section headers (not XML — Grok convention is plain headers)
- Add WHY rationale on key rules
- Add 2 brief examples (happy mood response, struggling mood response)
- Keep firm guardrail language (Grok benefits from it)

- [ ] **Step 2: Improve fish-audio-annotation-prompt.ts**

In `backend/src/utils/fish-audio-annotation-prompt.ts`, add:
- WHY rationale on the pacing rules ("Three-dot pauses because TTS engines need explicit timing cues")
- One short before/after example showing annotation applied to a paragraph
- Keep the current structure (it's already well-organized)

- [ ] **Step 3: Commit mobile changes**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/companion-service.ts
git commit -m "feat: improve Grok mood check-in prompt engineering

Structured sections, WHY rationale, and short examples for mood check-in."
```

- [ ] **Step 4: Commit backend changes**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/utils/fish-audio-annotation-prompt.ts
git commit -m "feat(backend): improve TTS annotation prompt

Structured sections, WHY rationale, and before/after example."
```

---

## Task 12: Prompt Caching Optimization

Reorder all prompts so static content comes first, then cache_control breakpoint, then dynamic content. The backend already supports `cache_control` in the Anthropic proxy.

**Files:**
- Verify: `backend/src/index.ts` (handleAnthropic already places cache_control)
- Verify: `mobile/src/lib/progressive-generation.ts` (systemPrompt is fully static already)
- Verify: `backend/src/lib/companion-prompt.ts` (static/dynamic split)

- [ ] **Step 1: Verify devotional generation caching**

The systemPrompt in `progressive-generation.ts` (Task 8) is fully static per-persona — examples, rules, directives are all static strings. The dynamic content (user context, series data) goes in the user message, not the system prompt. This means the system prompt is already cache-optimal.

Verify that `postJsonWithBackendFallback` sends `system` as a string, and the backend's `handleAnthropic` wraps it with `cache_control`.

- [ ] **Step 2: Verify companion prompt caching**

The expanded companion prompt (Task 9) has ~6,000 static tokens, well above the 4,096 Haiku threshold. The `buildCompanionSystemPrompt` returns static + dynamic as a single string — the backend's companion route should use `cache_control` on the static portion.

Check `backend/src/routes/companion.ts` for how the system prompt is sent to Anthropic. If it sends the full string without `cache_control`, add it.

- [ ] **Step 3: Commit (if any changes)**

```bash
git commit -m "feat: optimize prompt caching placement

Verify cache_control breakpoints on devotional and companion prompts."
```

---

## Task 13: Backend — Adaptive Example Injection

The self-improving system: evaluate violation rates, auto-generate contrast examples when a rule exceeds 20%.

**Files:**
- Create or modify: `backend/src/routes/prompt-generations.ts` (add evaluation function)

- [ ] **Step 1: Add adaptive evaluation function**

Add to `backend/src/routes/prompt-generations.ts`:

```typescript
// ---------------------------------------------------------------------------
// Adaptive example injection — evaluates after each generation log
// ---------------------------------------------------------------------------

async function evaluateAndInjectExample(): Promise<void> {
  try {
    // Count total generations in last 7 days
    const since = new Date(Date.now() - 7 * 86400000);
    const [genCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(promptGenerations)
      .where(gte(promptGenerations.createdAt, since));

    const totalGens = genCount?.count ?? 0;
    if (totalGens < 50) return; // Minimum threshold

    // Check for active example with cooldown
    const activeExamples = await db.select()
      .from(dynamicPromptExamples)
      .where(eq(dynamicPromptExamples.active, true))
      .limit(1);

    if (activeExamples.length > 0) {
      const active = activeExamples[0];
      const daysSinceCreation = (Date.now() - new Date(active.createdAt!).getTime()) / 86400000;
      if (daysSinceCreation < 7) return; // 7-day cooldown

      // Check if the active example's rule has dropped below 10%
      const [ruleViolCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(promptViolations)
        .where(and(
          eq(promptViolations.rule, active.rule),
          gte(promptViolations.createdAt, since),
        ));

      const ruleRate = (ruleViolCount?.count ?? 0) / totalGens;
      if (ruleRate < 0.10) {
        // Auto-retire
        await db.update(dynamicPromptExamples)
          .set({ active: false, retiredAt: new Date() })
          .where(eq(dynamicPromptExamples.id, active.id));
        console.log(`[adaptive] Retired example for "${active.rule}" (rate dropped to ${(ruleRate * 100).toFixed(1)}%)`);
      } else {
        return; // Active example still needed
      }
    }

    // Find the worst-offending rule (>20% violation rate)
    const ruleStats = await db.select({
      rule: promptViolations.rule,
      count: sql<number>`count(*)::int`,
    })
      .from(promptViolations)
      .where(gte(promptViolations.createdAt, since))
      .groupBy(promptViolations.rule)
      .orderBy(desc(sql`count(*)`))
      .limit(1);

    if (ruleStats.length === 0) return;

    const worstRule = ruleStats[0];
    const worstRate = worstRule.count / totalGens;

    if (worstRate < 0.20) return; // No rule exceeds threshold

    // Get 3 example violations for this rule
    const exampleViolations = await db.select({
      original: promptViolations.original,
      fixed: promptViolations.fixed,
    })
      .from(promptViolations)
      .where(and(
        eq(promptViolations.rule, worstRule.rule),
        gte(promptViolations.createdAt, since),
      ))
      .limit(3);

    // Generate a contrast example using Haiku (~$0.003)
    const exampleContext = exampleViolations.map(v => `Original: "${v.original}" → Fixed: "${v.fixed || 'N/A'}"`).join('\n');

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic();
    const exampleGen = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      temperature: 0.3,
      system: "You generate concise bad/good contrast examples for AI writing rules. Return ONLY valid JSON.",
      messages: [{
        role: "user",
        content: `The rule "${worstRule.rule}" is frequently violated in devotional writing.\n\nRecent violations:\n${exampleContext}\n\nWrite a single bad/good contrast pair (~50 words each) that demonstrates this rule. The "bad" text should contain the violation pattern. The "good" text should show the same idea written correctly.\n\nReturn: {"badText": "...", "goodText": "..."}`,
      }],
    });

    let badText = '';
    let goodText = '';
    try {
      const genText = exampleGen.content[0].type === 'text' ? exampleGen.content[0].text : '';
      const genJson = JSON.parse(genText.match(/\{[\s\S]*\}/)?.[0] || '{}');
      badText = genJson.badText || exampleViolations.map(v => v.original).join(' ');
      goodText = genJson.goodText || exampleViolations.filter(v => v.fixed).map(v => v.fixed).join(' ') || 'Fix pending';
    } catch {
      // Fallback to raw concatenation if Haiku generation fails
      badText = exampleViolations.map(v => v.original).join(' ');
      goodText = exampleViolations.filter(v => v.fixed).map(v => v.fixed).join(' ') || 'Fix pending';
    }

    await db.insert(dynamicPromptExamples).values({
      rule: worstRule.rule,
      badText: badText.slice(0, 2000),
      goodText: goodText.slice(0, 2000),
      active: true,
      violationRateAtCreation: worstRate,
    });

    console.log(`[adaptive] Injected example for "${worstRule.rule}" (rate: ${(worstRate * 100).toFixed(1)}%)`);
  } catch (err) {
    console.error('[adaptive] Evaluation failed:', err);
  }
}
```

- [ ] **Step 2: Call evaluation after each generation log**

In the POST /api/prompt-generations handler, after the successful insert, add:

```typescript
    // Trigger adaptive evaluation (async, don't block response)
    evaluateAndInjectExample().catch(() => {});
```

- [ ] **Step 3: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/routes/prompt-generations.ts
git commit -m "feat(backend): add adaptive example injection

Evaluates violation rates after each generation log.
Auto-generates contrast examples when a rule exceeds 20%.
Auto-retires when rule drops below 10%. 7-day cooldown."
```

---

## Verification Checklist

After all tasks are complete:

- [ ] Run full test suite: `cd mobile && npx jest --no-coverage`
- [ ] TypeScript compiles: `cd mobile && npx tsc --noEmit`
- [ ] Backend starts: `cd backend && npm run dev`
- [ ] Push backend schema: `cd backend && npx drizzle-kit push`
- [ ] Test POST /api/prompt-generations with curl
- [ ] Test GET /api/prompt-generations/summary with curl (using admin Clerk ID)
- [ ] Test POST /api/companion-feedback with curl
- [ ] Test GET /api/prompt-examples/active with curl
- [ ] Generate a devotional and verify validation chain runs (check logs)
- [ ] Thumbs up/down in companion chat and verify backend receives it
- [ ] Check Railway logs for [adaptive] evaluation messages
