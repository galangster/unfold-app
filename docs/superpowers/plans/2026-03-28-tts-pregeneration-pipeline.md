# TTS Pre-Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-generate devotional audio after text generation so it's ready when the user opens the app in the morning — plus persistent Cloudflare R2 storage and AI-driven emotion tagging.

**Architecture:** Evening triggers (check-in completion + 9 PM app open) fire alongside existing BackgroundFetch/morning-open triggers. After text generation succeeds, `preGenerateAudio()` calls the backend TTS route, which annotates text with Grok (Fish Audio brackets), generates audio via Fish Audio S2 Pro, uploads to Cloudflare R2, and returns a CDN URL. The mobile client downloads from R2 instead of the ephemeral Railway CDN.

**Tech Stack:** Expo/React Native (mobile), Express + Fish Audio S2 Pro (backend), Cloudflare R2 (@aws-sdk/client-s3), Grok via xAI API (emotion tagging), Jest (mobile tests), Vitest (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-27-tts-pregeneration-pipeline-design.md`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `backend/src/utils/ai-client.ts` | Shared xAI/Grok calling utility with timeout support |
| `backend/src/utils/r2-storage.ts` | Cloudflare R2 upload, existence check, URL generation |
| `backend/src/utils/fish-audio-annotation-prompt.ts` | System prompt constant for AI emotion tagging |
| `backend/src/utils/__tests__/ai-client.test.ts` | Tests for AI client |
| `backend/src/utils/__tests__/r2-storage.test.ts` | Tests for R2 utilities |
| `backend/src/utils/__tests__/annotate-for-tts.test.ts` | Tests for AI annotation + fallback |
| `src/lib/__tests__/store-migration-v28.test.ts` | Store migration test |
| `src/lib/__tests__/build-tts-text.test.ts` | Tests for shared TTS text builder |
| `src/lib/__tests__/evening-cutoff.test.ts` | Tests for evening cutoff + guards |

### Modified Files — Mobile

| File | Changes |
|------|---------|
| `src/lib/store.ts:690,758,1331,1651,1946` | Add `lastEveningGenerationDate` field + setter, migration v27→v28 |
| `src/lib/cutoff-logic.ts` | Add `isPastEveningCutoff()` |
| `src/lib/tts-service.ts` | Add `buildTtsText()`, export `humanizeReference()`, update `downloadAudio()` for `audioUrl` |
| `src/app/(tabs)/(today)/reading.tsx:67-73,376,551` | Replace inline text construction with `buildTtsText()`, remove local `humanizeReference()` |
| `src/lib/progressive-generation.ts` | Add `preGenerateAudio()` and `attemptEveningGeneration()` |
| `src/lib/background-generation.ts:66-69` | Add `preGenerateAudio()` call after successful generation |
| `src/app/(tabs)/(today)/index.tsx:216-227` | Add evening trigger + TTS pre-gen after morning trigger |
| `src/app/(tabs)/(today)/evening-wind-down.tsx:251-267` | Call `attemptEveningGeneration()` after check-in |

### Modified Files — Backend

| File | Changes |
|------|---------|
| `backend/src/routes/tts.ts:60-62,109-186` | Reorder flow: raw hash → R2 check → annotate → Fish Audio → R2 upload. Return `audioUrl`. |
| `backend/src/utils/emotion-tags.ts` | Add `annotateForTts()` async function, keep `injectEmotionTags()` as fallback |
| `backend/package.json` | Add `@aws-sdk/client-s3` |

---

## Task 1: Store Migration v27 → v28

**Files:**
- Modify: `src/lib/store.ts:690,758,1331,1651,1946`
- Test: `src/lib/__tests__/store-migration-v28.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/store-migration-v28.test.ts`:

```typescript
/**
 * Test store migration v27 → v28.
 * Mirrors the pattern in store-migration-v27.test.ts.
 */
function applyMigrationV28(state: Record<string, any>): Record<string, any> {
  state.lastEveningGenerationDate = state.lastEveningGenerationDate ?? '';
  return state;
}

describe('Store migration v27→v28', () => {
  it('adds lastEveningGenerationDate with empty string default', () => {
    const stateV27: Record<string, any> = {
      devotionals: [],
      lastGenerationCutoffDate: '2026-03-27',
    };
    const migrated = applyMigrationV28({ ...stateV27 });
    expect(migrated.lastEveningGenerationDate).toBe('');
    expect(migrated.lastGenerationCutoffDate).toBe('2026-03-27');
  });

  it('preserves existing lastEveningGenerationDate if already set', () => {
    const state: Record<string, any> = {
      lastEveningGenerationDate: '2026-03-27',
    };
    const migrated = applyMigrationV28({ ...state });
    expect(migrated.lastEveningGenerationDate).toBe('2026-03-27');
  });

  it('handles undefined gracefully (nullish coalescing)', () => {
    const state: Record<string, any> = {
      lastEveningGenerationDate: undefined,
    };
    const migrated = applyMigrationV28({ ...state });
    expect(migrated.lastEveningGenerationDate).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/store-migration-v28.test.ts --no-coverage`
Expected: PASS (test is self-contained with local function — this establishes the contract)

- [ ] **Step 3: Implement the store migration**

In `src/lib/store.ts`, make these changes:

**a) Add state field (after line 690 where `lastGenerationCutoffDate` is defined):**
```typescript
lastEveningGenerationDate: string;
```

**b) Add setter type (after `setLastGenerationCutoffDate`):**
```typescript
setLastEveningGenerationDate: (date: string) => void;
```

**c) Add default value (after line 758 where `lastGenerationCutoffDate: ''` is):**
```typescript
lastEveningGenerationDate: '',
```

**d) Add setter implementation (after line 1331 where `setLastGenerationCutoffDate` is):**
```typescript
setLastEveningGenerationDate: (date) => set({ lastEveningGenerationDate: date }),
```

**e) Bump version (line 1651):**
```typescript
version: 28, // v28: Add lastEveningGenerationDate for evening generation triggers
```

**f) Add migration block (after the v26→v27 migration block, around line 1951):**
```typescript
// Migration from version 27 to 28: Add evening generation tracking
if (version < 28) {
  try {
    (state as any).lastEveningGenerationDate = (state as any).lastEveningGenerationDate ?? '';
  } catch (err) {
    console.error('[store] Migration v27→28 failed:', err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/store-migration-v28.test.ts --no-coverage`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/store.ts src/lib/__tests__/store-migration-v28.test.ts
git commit -m "feat: add store migration v27→v28 for lastEveningGenerationDate"
```

---

## Task 2: Extract `buildTtsText()` and `humanizeReference()`

**Files:**
- Modify: `src/lib/tts-service.ts`
- Modify: `src/app/(tabs)/(today)/reading.tsx:67-73,376,551`
- Test: `src/lib/__tests__/build-tts-text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/build-tts-text.test.ts`:

```typescript
import { buildTtsText, humanizeReference } from '../tts-service';

describe('humanizeReference', () => {
  it('converts chapter:verse format', () => {
    expect(humanizeReference('Romans 8:28')).toBe('Romans chapter 8, verse 28');
  });

  it('converts chapter:verse-verse range', () => {
    expect(humanizeReference('Psalm 139:1-4')).toBe('Psalm chapter 139, verses 1 through 4');
  });

  it('leaves text without colons unchanged', () => {
    expect(humanizeReference('Genesis')).toBe('Genesis');
  });

  it('handles multiple references', () => {
    expect(humanizeReference('John 3:16; Romans 8:28')).toBe(
      'John chapter 3, verse 16; Romans chapter 8, verse 28'
    );
  });
});

describe('buildTtsText', () => {
  const mockDay = {
    scriptureReference: 'Psalm 23:1-3',
    scriptureText: 'The Lord is my shepherd, I shall not want.',
    bodyText: 'Today we explore what it means to rest in God.',
  };

  it('produces the exact format used by reading.tsx inline construction', () => {
    // This is the format from reading.tsx lines 376 and 551:
    // `${humanizeReference(ref)}.\n\n${scriptureText}\n\n...\n\n${bodyText}`
    const expected =
      'Psalm 23, verses 1 through 3.\n\n' +
      'The Lord is my shepherd, I shall not want.\n\n' +
      '...\n\n' +
      'Today we explore what it means to rest in God.';

    expect(buildTtsText(mockDay)).toBe(expected);
  });

  it('handles empty scriptureReference', () => {
    const day = { ...mockDay, scriptureReference: '' };
    const result = buildTtsText(day);
    expect(result).toContain('.\n\n');
    expect(result).toContain(mockDay.scriptureText);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/build-tts-text.test.ts --no-coverage`
Expected: FAIL — `humanizeReference` and `buildTtsText` not exported from tts-service

- [ ] **Step 3: Add `humanizeReference()` and `buildTtsText()` to tts-service.ts**

Add these exports to `src/lib/tts-service.ts` (before the `hashKey` function, around line 57):

```typescript
// ─── Shared TTS text construction ────────────────────────────

/**
 * Convert Bible reference notation to natural speech.
 * "Romans 8:28" → "Romans chapter 8, verse 28"
 * "Psalm 139:1-4" → "Psalm 139, verses 1 through 4"
 */
export function humanizeReference(ref: string): string {
  return ref
    .replace(/(\d+):(\d+)-(\d+)/g, 'chapter $1, verses $2 through $3')
    .replace(/(\d+):(\d+)/g, 'chapter $1, verse $2');
}

/**
 * Build the full TTS text from a devotional day.
 * CRITICAL: This must produce identical output to the inline construction
 * in reading.tsx (lines 376 and 551) to avoid cache key mismatches.
 */
export function buildTtsText(day: {
  scriptureReference: string;
  scriptureText: string;
  bodyText: string;
}): string {
  return `${humanizeReference(day.scriptureReference)}.\n\n${day.scriptureText}\n\n...\n\n${day.bodyText}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/build-tts-text.test.ts --no-coverage`
Expected: PASS — 6 tests pass

- [ ] **Step 5: Update reading.tsx to use shared functions**

In `src/app/(tabs)/(today)/reading.tsx`:

**a) Replace the local `humanizeReference` function (lines 67-73) with import:**
Remove the local function definition and add to imports:
```typescript
import { buildTtsText } from '@/lib/tts-service';
```

**b) Replace first inline construction (line 376):**
Change from:
```typescript
const fullText = `${humanizeReference(currentDayData.scriptureReference)}.\n\n${currentDayData.scriptureText}\n\n...\n\n${currentDayData.bodyText}`;
```
To:
```typescript
const fullText = buildTtsText(currentDayData);
```

**c) Replace second inline construction (line 551):**
Same change — replace inline template string with `buildTtsText(currentDayData)`.

- [ ] **Step 6: Run all tests to verify nothing broke**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/tts-service.ts src/lib/__tests__/build-tts-text.test.ts src/app/(tabs)/(today)/reading.tsx
git commit -m "feat: extract buildTtsText() and humanizeReference() as shared exports"
```

---

## Task 3: Evening Cutoff Logic

**Files:**
- Modify: `src/lib/cutoff-logic.ts`
- Test: `src/lib/__tests__/evening-cutoff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/evening-cutoff.test.ts`:

```typescript
import { isPastEveningCutoff } from '../cutoff-logic';

describe('isPastEveningCutoff', () => {
  it('returns true at exactly 9 PM (21:00)', () => {
    const ninePM = new Date(2026, 2, 28, 21, 0, 0);
    expect(isPastEveningCutoff(ninePM)).toBe(true);
  });

  it('returns false at 8:59 PM (20:59)', () => {
    const beforeNine = new Date(2026, 2, 28, 20, 59, 0);
    expect(isPastEveningCutoff(beforeNine)).toBe(false);
  });

  it('returns true at 11 PM', () => {
    const elevenPM = new Date(2026, 2, 28, 23, 0, 0);
    expect(isPastEveningCutoff(elevenPM)).toBe(true);
  });

  it('returns false in the morning', () => {
    const morning = new Date(2026, 2, 28, 8, 0, 0);
    expect(isPastEveningCutoff(morning)).toBe(false);
  });

  it('supports custom cutoff hour', () => {
    const eightPM = new Date(2026, 2, 28, 20, 0, 0);
    expect(isPastEveningCutoff(eightPM, 20)).toBe(true);
    expect(isPastEveningCutoff(eightPM, 21)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/evening-cutoff.test.ts --no-coverage`
Expected: FAIL — `isPastEveningCutoff` is not exported from cutoff-logic

- [ ] **Step 3: Implement `isPastEveningCutoff()`**

Add to the end of `src/lib/cutoff-logic.ts`:

```typescript

// ─── Evening cutoff ──────────────────────────────────────────

const DEFAULT_EVENING_CUTOFF_HOUR = 21; // 9 PM local time

/**
 * Returns true if current time is past the evening cutoff (default 9 PM).
 * Used for evening generation triggers — not related to midnight cutoff.
 */
export function isPastEveningCutoff(
  now: Date = new Date(),
  cutoffHour: number = DEFAULT_EVENING_CUTOFF_HOUR,
): boolean {
  return now.getHours() >= cutoffHour;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/evening-cutoff.test.ts --no-coverage`
Expected: PASS — 5 tests pass

- [ ] **Step 5: Run existing cutoff tests to verify no regression**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/cutoff-logic.test.ts --no-coverage`
Expected: PASS — existing 4 tests still pass

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/cutoff-logic.ts src/lib/__tests__/evening-cutoff.test.ts
git commit -m "feat: add isPastEveningCutoff() for 9 PM generation trigger"
```

---

## Task 4: Backend `ai-client.ts` Shared Utility

**Files:**
- Create: `backend/src/utils/ai-client.ts`
- Test: `backend/src/utils/__tests__/ai-client.test.ts`

**Reference:** Read `backend/src/index.ts:266-329` — the existing `handleXai()` function that we're extracting from.

- [ ] **Step 1: Write the failing test**

Create `backend/src/utils/__tests__/ai-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We'll test the module after creating it
describe('callAI', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.XAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.XAI_API_KEY;
  });

  it('calls xAI API with correct params and returns text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'annotated text' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    }) as any;

    const { callAI } = await import('../ai-client');
    const result = await callAI({
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 300,
      temperature: 0.3,
      system: 'You are a test.',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.text).toBe('annotated text');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
        }),
      }),
    );
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    }) as any;

    const { callAI } = await import('../ai-client');
    await expect(callAI({
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 300,
      temperature: 0.3,
      system: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow();
  });

  it('throws when XAI_API_KEY is missing', async () => {
    delete process.env.XAI_API_KEY;
    // Need fresh import to pick up missing env var
    vi.resetModules();
    const { callAI } = await import('../ai-client');
    await expect(callAI({
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 100,
      temperature: 0.3,
      system: 'test',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow(/XAI_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run src/utils/__tests__/ai-client.test.ts`
Expected: FAIL — module `../ai-client` does not exist

- [ ] **Step 3: Implement `ai-client.ts`**

Create `backend/src/utils/ai-client.ts`:

```typescript
/**
 * Shared AI client for calling xAI/Grok.
 * Extracted from handleXai() in index.ts for reuse
 * by the TTS emotion tagging pipeline.
 */

export interface CallAIParams {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: { role: string; content: string }[];
  timeoutMs?: number;
}

export interface CallAIResult {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function callAI(params: CallAIParams): Promise<CallAIResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY is not configured');
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Build OpenAI-compatible messages array
  const messages: Array<{ role: string; content: string }> = [];
  if (params.system) {
    messages.push({ role: 'system', content: params.system });
  }
  for (const msg of params.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.max_tokens,
      temperature: params.temperature,
      messages,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown');
    throw new Error(`xAI API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? '';
  const usage = data.usage;

  return {
    text,
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run src/utils/__tests__/ai-client.test.ts`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/utils/ai-client.ts src/utils/__tests__/ai-client.test.ts
git commit -m "feat: extract shared ai-client.ts utility from handleXai()"
```

---

## Task 5: Fish Audio Annotation Prompt

**Files:**
- Create: `backend/src/utils/fish-audio-annotation-prompt.ts`

**Reference:** Research Fish Audio S2 Pro bracket syntax from their API docs. The existing `emotion-tags.ts` uses bracket syntax like `[gentle, intimate prayer voice, speaking softly]`.

- [ ] **Step 1: Research Fish Audio bracket syntax**

Check Fish Audio's documentation for the full bracket syntax reference. The current codebase uses natural-language descriptions in square brackets. Capture all supported modifiers and examples.

- [ ] **Step 2: Create the prompt constant**

Create `backend/src/utils/fish-audio-annotation-prompt.ts`:

```typescript
/**
 * System prompt for Grok to annotate devotional text with
 * Fish Audio S2 Pro expressive bracket syntax.
 */

export const FISH_AUDIO_ANNOTATION_PROMPT = `You are a professional audiobook director preparing devotional text for text-to-speech narration using Fish Audio S2 Pro.

Your job is to insert expressive bracket annotations into the text so it sounds warm, natural, and dynamic when read aloud. The brackets tell the TTS engine HOW to read each section.

## BRACKET SYNTAX

Fish Audio S2 Pro uses natural-language brackets at the start of sections:
- [warm and inviting, like greeting a close friend]
- [reading scripture with reverence and weight, slower pace]
- [gentle, intimate prayer voice, speaking softly]
- [thoughtful and present, speaking with care]
- [encouraging and direct, speaking with conviction]
- [warm and joyful, celebrating with genuine gratitude]
- [quiet reflection, measured pace]
- [building intensity, voice rising with emphasis]
- [tender, compassionate tone]
- [confident declaration, clear and strong]

Place ONE bracket annotation before each section or paragraph. Vary them — never use the same bracket twice in a row.

## SECTION GUIDELINES

- **Opening/greeting**: [warm and inviting, like greeting a close friend]
- **Scripture quotation**: [reading scripture with reverence and weight, slower pace]
- **Personal story or illustration**: [intimate and conversational, like telling a friend]
- **Theological explanation**: [thoughtful and present, speaking with care]
- **Application or challenge**: [encouraging and direct, speaking with conviction]
- **Prayer**: [gentle, intimate prayer voice, speaking softly]
- **Closing/sending**: [warm, tender sending-off tone]

## SCRIPTURE REFERENCE HUMANIZATION

Convert ALL scripture references to natural speech format:
- "Romans 8:28" → "Romans chapter 8, verse 28"
- "Psalm 139:1-4" → "Psalm 139, verses 1 through 4"
- "John 3:16" → "John chapter 3, verse 16"
- "1 Corinthians 13:4-7" → "First Corinthians chapter 13, verses 4 through 7"
- "2 Timothy 1:7" → "Second Timothy chapter 1, verse 7"

IMPORTANT: If a reference is ALREADY in humanized form (e.g., "Romans chapter 8, verse 28"), leave it as-is. Only convert raw citation format.

## PACING

- Insert "..." (three dots) at major section transitions for a natural pause
- Scripture quotes should breathe — add a beat before and after
- Prayers should slow down naturally

## RULES

- Return the FULL text with brackets inserted. Do not summarize or shorten.
- Do NOT add any text, commentary, or explanation. Only add brackets and humanize references.
- Do NOT change any words in the original text (except scripture reference formatting).
- Do NOT wrap output in markdown code blocks.
- Vary the brackets throughout — monotone reading is the enemy.
- Keep brackets natural and conversational, not theatrical.`;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/utils/fish-audio-annotation-prompt.ts
git commit -m "feat: add Fish Audio annotation system prompt for Grok"
```

---

## Task 6: `annotateForTts()` + Fallback

**Files:**
- Modify: `backend/src/utils/emotion-tags.ts`
- Test: `backend/src/utils/__tests__/annotate-for-tts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/utils/__tests__/annotate-for-tts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('annotateForTts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.XAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.XAI_API_KEY;
    vi.resetModules();
  });

  it('returns annotated text from Grok on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: { content: '[warm] Hello friend.\n[reverent] The Lord is good.' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 80 },
      }),
    }) as any;

    const { annotateForTts } = await import('../emotion-tags');
    const result = await annotateForTts('Hello friend.\nThe Lord is good.');
    expect(result).toContain('[warm]');
    expect(result).toContain('[reverent]');
  });

  it('falls back to injectEmotionTags on Grok failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const { annotateForTts, injectEmotionTags } = await import('../emotion-tags');
    const text = 'Good morning, friend.\nThe Lord is good.';
    const result = await annotateForTts(text);

    // Should return SOMETHING (the regex fallback), not throw
    expect(result).toBeTruthy();
    expect(result).toBe(injectEmotionTags(text));
  });

  it('falls back on empty Grok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      }),
    }) as any;

    const { annotateForTts } = await import('../emotion-tags');
    const text = 'Good morning.';
    const result = await annotateForTts(text);
    // Empty AI response → fallback to regex
    expect(result).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run src/utils/__tests__/annotate-for-tts.test.ts`
Expected: FAIL — `annotateForTts` is not exported from `emotion-tags`

- [ ] **Step 3: Add `annotateForTts()` to emotion-tags.ts**

Add at the end of `backend/src/utils/emotion-tags.ts`:

```typescript

// ---------------------------------------------------------------------------
// AI-powered annotation (Grok) — falls back to regex on failure
// ---------------------------------------------------------------------------

import { callAI } from './ai-client';
import { FISH_AUDIO_ANNOTATION_PROMPT } from './fish-audio-annotation-prompt';

/**
 * Annotate devotional text with Fish Audio S2 Pro bracket syntax using Grok.
 * Falls back to regex-based injectEmotionTags() on any failure.
 */
export async function annotateForTts(text: string): Promise<string> {
  if (!text.trim()) return '';

  try {
    const response = await callAI({
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: Math.ceil(text.length * 1.3),
      temperature: 0.3,
      system: FISH_AUDIO_ANNOTATION_PROMPT,
      messages: [{ role: 'user', content: text }],
      timeoutMs: 10_000,
    });

    // Validate: AI should return non-empty text roughly the same length
    if (!response.text || response.text.length < text.length * 0.5) {
      console.warn('[emotion-tags] AI annotation returned suspiciously short text, falling back to regex');
      return injectEmotionTags(text);
    }

    return response.text;
  } catch (error) {
    console.warn('[emotion-tags] AI annotation failed, falling back to regex:', error);
    return injectEmotionTags(text);
  }
}
```

**Note:** Move the import statement to the top of the file (after the existing imports, or at the top since there are currently none).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run src/utils/__tests__/annotate-for-tts.test.ts`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Run existing emotion-tags tests**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run src/utils/__tests__/emotion-tags.test.ts`
Expected: Results may show failures on old bracket format — these tests predate the bracket syntax update. Do NOT fix them in this task (out of scope).

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/utils/emotion-tags.ts src/utils/__tests__/annotate-for-tts.test.ts
git commit -m "feat: add annotateForTts() with Grok AI + regex fallback"
```

---

## Task 7: Cloudflare R2 Storage Utilities

**Files:**
- Create: `backend/src/utils/r2-storage.ts`
- Test: `backend/src/utils/__tests__/r2-storage.test.ts`
- Modify: `backend/package.json` (add `@aws-sdk/client-s3`)

- [ ] **Step 1: Install @aws-sdk/client-s3**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npm install @aws-sdk/client-s3`

- [ ] **Step 2: Write the failing test**

Create `backend/src/utils/__tests__/r2-storage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @aws-sdk/client-s3 before importing
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    HeadObjectCommand: vi.fn((params: any) => ({ ...params, _type: 'HeadObject' })),
    PutObjectCommand: vi.fn((params: any) => ({ ...params, _type: 'PutObject' })),
    __mockSend: mockSend,
  };
});

describe('r2-storage', () => {
  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'unfold-audio';
    process.env.R2_PUBLIC_URL = 'https://audio.test.com';
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_PUBLIC_URL;
  });

  it('getR2PublicUrl returns correct URL format', async () => {
    const { getR2PublicUrl } = await import('../r2-storage');
    expect(getR2PublicUrl('abc123')).toBe('https://audio.test.com/audio/abc123.mp3');
  });

  it('audioExistsInR2 returns true when HeadObject succeeds', async () => {
    const { __mockSend } = await import('@aws-sdk/client-s3') as any;
    __mockSend.mockResolvedValueOnce({});

    const { audioExistsInR2 } = await import('../r2-storage');
    const exists = await audioExistsInR2('abc123');
    expect(exists).toBe(true);
  });

  it('audioExistsInR2 returns false when HeadObject throws NotFound', async () => {
    const { __mockSend } = await import('@aws-sdk/client-s3') as any;
    __mockSend.mockRejectedValueOnce({ name: 'NotFound' });

    const { audioExistsInR2 } = await import('../r2-storage');
    const exists = await audioExistsInR2('abc123');
    expect(exists).toBe(false);
  });

  it('uploadAudioToR2 uploads buffer and returns public URL', async () => {
    const { __mockSend } = await import('@aws-sdk/client-s3') as any;
    __mockSend.mockResolvedValueOnce({});

    const { uploadAudioToR2 } = await import('../r2-storage');
    const url = await uploadAudioToR2('abc123', Buffer.from('fake-audio'));
    expect(url).toBe('https://audio.test.com/audio/abc123.mp3');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run src/utils/__tests__/r2-storage.test.ts`
Expected: FAIL — module `../r2-storage` does not exist

- [ ] **Step 4: Implement r2-storage.ts**

Create `backend/src/utils/r2-storage.ts`:

```typescript
/**
 * Cloudflare R2 storage for persistent TTS audio.
 * Uses S3-compatible API via @aws-sdk/client-s3.
 *
 * Audio persists indefinitely — no TTL, no expiration.
 * Keys are content hashes (no user-identifiable data).
 */
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function getBucketName(): string {
  return process.env.R2_BUCKET_NAME || 'unfold-audio';
}

function audioKey(hash: string): string {
  return `audio/${hash}.mp3`;
}

/**
 * Get the public CDN URL for an audio file.
 */
export function getR2PublicUrl(hash: string): string {
  const base = process.env.R2_PUBLIC_URL || '';
  return `${base}/${audioKey(hash)}`;
}

/**
 * Check if audio exists in R2 by content hash.
 */
export async function audioExistsInR2(hash: string): Promise<boolean> {
  try {
    const client = getR2Client();
    await client.send(new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: audioKey(hash),
    }));
    return true;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error('[R2] HeadObject error:', err);
    return false;
  }
}

/**
 * Upload audio buffer to R2. Returns the public CDN URL.
 */
export async function uploadAudioToR2(hash: string, buffer: Buffer): Promise<string> {
  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: getBucketName(),
    Key: audioKey(hash),
    Body: buffer,
    ContentType: 'audio/mpeg',
    CacheControl: 'public, max-age=31536000', // 1 year — content-addressed, never changes
  }));
  return getR2PublicUrl(hash);
}

/**
 * Check if R2 is configured. Used to gracefully degrade when env vars are missing.
 */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run src/utils/__tests__/r2-storage.test.ts`
Expected: PASS — 4 tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/utils/r2-storage.ts src/utils/__tests__/r2-storage.test.ts package.json package-lock.json
git commit -m "feat: add Cloudflare R2 storage utilities for persistent TTS audio"
```

---

## Task 8: Update TTS Route — R2 Integration + AI Annotation

**Files:**
- Modify: `backend/src/routes/tts.ts:60-62,109-186`

This is the biggest backend change. The TTS route flow changes from:
```
validate → injectEmotionTags → hash tagged text → check in-memory → Fish Audio → cache in-memory
```
To:
```
validate → hash RAW text → check R2 → annotateForTts → Fish Audio → upload R2 → cache in-memory
```

- [ ] **Step 1: Update the `contentHash` function to use raw text**

In `backend/src/routes/tts.ts`, the `contentHash` function at line 60-62 stays the same — but it will now be called on raw text instead of tagged text. No code change needed here, just usage change.

- [ ] **Step 2: Add R2 and annotation imports**

At the top of `backend/src/routes/tts.ts`, add after existing imports (line 17):

```typescript
import { annotateForTts } from "../utils/emotion-tags";
import { audioExistsInR2, uploadAudioToR2, getR2PublicUrl, isR2Configured } from "../utils/r2-storage";
```

- [ ] **Step 3: Rewrite the POST handler (lines 109-186)**

Replace the existing try block inside the POST handler (lines 109-186) with the new flow:

```typescript
  try {
    const resolvedVoice = resolveVoiceId(rawVoice);

    // Step 1: Compute hash from RAW text (pre-annotation) for deterministic R2 lookup
    const rawHash = contentHash(text, resolvedVoice);

    // Step 2: Check R2 first (persistent storage) — skip annotation AND Fish Audio on hit
    if (isR2Configured()) {
      try {
        const existsInR2 = await audioExistsInR2(rawHash);
        if (existsInR2) {
          const audioUrl = getR2PublicUrl(rawHash);
          console.log(`[tts] R2 cache HIT (${rawHash})`);
          // Also serve via legacy download flow for backward compat
          const cached = contentCache.get(rawHash);
          const downloadId = crypto.randomUUID();
          if (cached) {
            audioCache.set(downloadId, { buffer: cached.buffer, createdAt: Date.now() });
          }
          res.status(200).json({ downloadId, audioHash: rawHash, audioUrl });
          return;
        }
      } catch (r2Err) {
        console.warn('[tts] R2 check failed, proceeding to generate:', r2Err);
      }
    }

    // Step 3: Check in-memory content cache (hot cache, raw text hash key)
    const cached = contentCache.get(rawHash);
    if (cached) {
      const downloadId = crypto.randomUUID();
      audioCache.set(downloadId, { buffer: cached.buffer, createdAt: Date.now() });
      const audioUrl = isR2Configured() ? getR2PublicUrl(rawHash) : undefined;
      console.log(`[tts] Content cache HIT (${rawHash}), ${cached.buffer.byteLength} bytes`);
      res.status(200).json({ downloadId, audioHash: rawHash, ...(audioUrl && { audioUrl }) });
      return;
    }

    // Step 4: Annotate text with AI emotion tags (Grok, falls back to regex)
    console.log(`[tts] Generating audio for voice=${resolvedVoice}, ${text.length} chars`);
    const taggedText = await annotateForTts(text);

    // Step 5: Call Fish Audio with annotated text
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let fetchRes: any;
    try {
      fetchRes = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
          'Content-Type': 'application/json',
          'model': process.env.FISH_AUDIO_MODEL || 's2-pro',
        },
        body: JSON.stringify({
          text: taggedText,
          reference_id: VOICE_MAP[resolvedVoice],
          format: 'mp3',
          mp3_bitrate: 128,
          sample_rate: 44100,
          chunk_length: 200,
          latency: 'normal',
          normalize: true,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        res.status(504).json({ error: 'TTS generation timed out' });
        return;
      }
      throw err;
    }
    clearTimeout(timeout);

    if (!fetchRes.ok) {
      const errorBody = await fetchRes.text().catch(() => 'unknown');
      console.error(`[tts] Fish Audio API error: ${fetchRes.status} — ${errorBody}`);
      res.status(502).json({ error: 'TTS generation failed' });
      return;
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (audioBuffer.byteLength === 0) {
      console.error(`[tts] Fish Audio returned empty response`);
      res.status(502).json({ error: "TTS service returned empty audio" });
      return;
    }

    // Step 6: Upload to R2 (non-blocking — don't fail the request if R2 is down)
    let audioUrl: string | undefined;
    if (isR2Configured()) {
      try {
        audioUrl = await uploadAudioToR2(rawHash, audioBuffer);
        console.log(`[tts] Uploaded to R2: ${audioUrl}`);
      } catch (r2Err) {
        console.warn('[tts] R2 upload failed (audio still served from memory):', r2Err);
      }
    }

    // Step 7: Cache in-memory (raw text hash key)
    contentCache.set(rawHash, { buffer: audioBuffer, createdAt: Date.now() });
    const downloadId = crypto.randomUUID();
    audioCache.set(downloadId, { buffer: audioBuffer, createdAt: Date.now() });

    console.log(`[tts] Generated ${audioBuffer.byteLength} bytes, hash=${rawHash}, downloadId=${downloadId}`);

    res.status(200).json({ downloadId, audioHash: rawHash, ...(audioUrl && { audioUrl }) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[tts] Error: ${msg}`);
    res.status(500).json({ error: "TTS generation failed" });
  }
```

- [ ] **Step 4: Update the CDN router to use raw hash keying**

The `audioCdnRouter` at lines 232-247 already uses `contentCache.get(hash)` — no change needed since contentCache now uses raw hash keys.

- [ ] **Step 5: Run backend tests**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/routes/tts.ts
git commit -m "feat: integrate R2 storage + AI annotation into TTS route"
```

---

## Task 9: Mobile Download Update — Use `audioUrl` from Response

**Files:**
- Modify: `src/lib/tts-service.ts:105-186`

The backend now returns `audioUrl` (R2 public URL) alongside `downloadId`. Update the mobile client to prefer `audioUrl` when available.

- [ ] **Step 1: Update `downloadAudio()` in tts-service.ts**

In `src/lib/tts-service.ts`, update the `downloadAudio` function (lines 105-186).

Replace lines 143-155 (the response parsing and download URL construction):

```typescript
    const { downloadId, audioHash, audioUrl } = await genResponse.json();
    if (!downloadId && !audioUrl) {
      throw new Error('TTS proxy returned no downloadId or audioUrl');
    }

    logger.log(`[TTS] generation complete — audioHash=${audioHash}, audioUrl=${audioUrl ? 'yes' : 'no'}, ${Date.now() - fetchStart}ms`);

    // Step 2: Native download — prefer R2 URL, fall back to legacy CDN/download endpoints
    const DOWNLOAD_TIMEOUT = 30_000;
    const downloadUrl = audioUrl
      ?? (audioHash ? `${RAILWAY_BACKEND_URL}/api/audio/${audioHash}` : `${RAILWAY_BACKEND_URL}/api/tts-download/${downloadId}`);
```

The rest of the download logic (FileSystem.downloadAsync, file validation) stays the same.

- [ ] **Step 2: Run mobile tests**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/tts-service.ts
git commit -m "feat: prefer R2 audioUrl in TTS download, fall back to legacy endpoints"
```

---

## Task 10: `preGenerateAudio()` Function

**Files:**
- Modify: `src/lib/progressive-generation.ts`

- [ ] **Step 1: Add imports**

At the top of `src/lib/progressive-generation.ts`, add:

```typescript
import { buildTtsText, prefetchDevotionalAudio, getDefaultVoice } from '@/lib/tts-service';
```

Check which of these are already imported and only add the missing ones.

- [ ] **Step 2: Add `preGenerateAudio()` function**

Add near `triggerNextDayGeneration()` (around line 1300):

```typescript
/**
 * Pre-generate TTS audio for a devotional day.
 * Called after text generation succeeds — audio is a bonus, not a blocker.
 * Silently fails so devotional text delivery is never blocked by audio issues.
 */
export async function preGenerateAudio(
  devotionalId: string,
  dayNumber: number,
): Promise<void> {
  try {
    const store = useUnfoldStore.getState();
    const devotional = store.devotionals.find((d) => d.id === devotionalId);
    const day = devotional?.days.find((d) => d.dayNumber === dayNumber);
    if (!day) return;

    const voiceId = store.user?.preferredVoice || getDefaultVoice();
    const text = buildTtsText(day);
    await prefetchDevotionalAudio(text, voiceId);
  } catch {
    // Silent fail — devotional text is the priority, audio is a bonus
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/progressive-generation.ts
git commit -m "feat: add preGenerateAudio() for background TTS pre-generation"
```

---

## Task 11: Evening Trigger Wiring + `attemptEveningGeneration()`

**Files:**
- Modify: `src/lib/progressive-generation.ts`
- Modify: `src/app/(tabs)/(today)/evening-wind-down.tsx:251-267`
- Modify: `src/app/(tabs)/(today)/index.tsx:216-227`
- Modify: `src/lib/background-generation.ts`

This task wires up all 4 trigger points.

- [ ] **Step 1: Add `attemptEveningGeneration()` to progressive-generation.ts**

Add after `preGenerateAudio()`:

```typescript
import { isPastEveningCutoff } from '@/lib/cutoff-logic';
import { todayDateString } from '@/lib/cutoff-logic';
import { refreshDailyReminder } from '@/lib/notifications';
```

(Check which are already imported — `todayDateString` may already be imported.)

```typescript
/**
 * Attempt evening generation — fires when user completes evening check-in
 * or opens the app after 9 PM. All guards are idempotent.
 */
export async function attemptEveningGeneration(
  devotionalId: string,
): Promise<boolean> {
  const store = useUnfoldStore.getState();
  const today = todayDateString();

  // Guard: already generated tonight?
  if (store.lastEveningGenerationDate === today) return false;

  // Guard: past evening cutoff?
  if (!isPastEveningCutoff()) return false;

  // Guard: active progressive devotional with missing next day?
  const devotional = store.devotionals.find(
    (d) => d.id === devotionalId && d.generationMode === 'progressive',
  );
  if (!devotional) return false;

  const nextDay = devotional.currentDay;
  if (devotional.days.some((d) => d.dayNumber === nextDay)) return false;
  if (nextDay > devotional.totalDays) return false;

  // Generate
  const result = await triggerNextDayGeneration(devotionalId, nextDay - 1);
  if (result) {
    store.setLastEveningGenerationDate(today);
    store.setLastGenerationCutoffDate(today); // prevent midnight/morning double-gen
    refreshDailyReminder();
    await preGenerateAudio(devotionalId, nextDay);
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Wire Trigger 1 — Evening check-in completion**

In `src/app/(tabs)/(today)/evening-wind-down.tsx`, update `handleShowCelebration` (line 251):

Add import at top:
```typescript
import { attemptEveningGeneration } from '@/lib/progressive-generation';
```

After the `addCheckIn()` call and before `cancelAndRescheduleEveningForTomorrow()`, add:

```typescript
    // Trigger evening generation (idempotent — no-op if already generated)
    if (currentDevotional) {
      attemptEveningGeneration(currentDevotional.id).catch(() => {});
    }
```

The full `handleShowCelebration` should look like:

```typescript
const handleShowCelebration = useCallback(() => {
  if (currentDevotional && currentDay) {
    addCheckIn({
      devotionalId: currentDevotional.id,
      dayNumber: currentDay.dayNumber,
      timeOfDay: 'evening',
      mood: 3 as const,
      moodLabel: 'completed',
    });
    // Trigger evening generation (idempotent — no-op if already generated)
    attemptEveningGeneration(currentDevotional.id).catch(() => {});
    cancelAndRescheduleEveningForTomorrow();
  }
  const msg = EVENING_CELEBRATION_MESSAGES[Math.floor(Math.random() * EVENING_CELEBRATION_MESSAGES.length)];
  setCelebrationMessage(msg);
  setShowCelebration(true);
}, [currentDevotional, currentDay, addCheckIn]);
```

- [ ] **Step 3: Wire Trigger 2 — Late-night app open**

In `src/app/(tabs)/(today)/index.tsx`, add imports:

```typescript
import { isPastEveningCutoff } from '@/lib/cutoff-logic';
import { attemptEveningGeneration } from '@/lib/progressive-generation';
```

After the existing morning generation block (around line 227, after `setIsPreparingCurrentDay(false)`), add an `else if` for evening:

```typescript
} else if (isPastEveningCutoff()) {
  // Evening trigger: generate next day if past 9 PM
  attemptEveningGeneration(currentDevotional.id).catch(() => {});
}
```

The combined block should look like:

```typescript
const lastCutoff = useUnfoldStore.getState().lastGenerationCutoffDate;
if (isPastCutoff(lastCutoff)) {
  triggerNextDayGeneration(currentDevotional.id, currentDay - 1)
    .then(async () => {
      useUnfoldStore.getState().setLastGenerationCutoffDate(todayDateString());
      refreshDailyReminder();
      // Pre-generate TTS audio for the new day
      await preGenerateAudio(currentDevotional.id, currentDay).catch(() => {});
    })
    .finally(() => setIsPreparingCurrentDay(false));
} else if (isPastEveningCutoff()) {
  // Evening trigger: generate next day if past 9 PM
  attemptEveningGeneration(currentDevotional.id).catch(() => {});
}
```

Also add `preGenerateAudio` import:
```typescript
import { preGenerateAudio } from '@/lib/progressive-generation';
```

- [ ] **Step 4: Wire Trigger 3 — BackgroundFetch**

In `src/lib/background-generation.ts`, add import:

```typescript
import { preGenerateAudio } from '@/lib/progressive-generation';
```

After the successful generation call (around line 69 where `setLastGenerationCutoffDate` is called), add:

```typescript
// Pre-generate TTS audio for the newly generated day
await preGenerateAudio(devotional.id, devotional.currentDay).catch(() => {});
```

- [ ] **Step 5: Run all mobile tests**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/progressive-generation.ts src/app/(tabs)/(today)/evening-wind-down.tsx src/app/(tabs)/(today)/index.tsx src/lib/background-generation.ts
git commit -m "feat: wire all 4 evening generation triggers + TTS pre-generation"
```

---

## Task 12: Environment Variables + Backend Deploy Config

**Files:**
- Backend Railway environment

- [ ] **Step 1: Add R2 environment variables to Railway**

These need to be added to the Railway backend service:

```
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
R2_BUCKET_NAME=unfold-audio
R2_PUBLIC_URL=<r2-public-url>
```

**Setup steps:**
1. Log into Cloudflare dashboard → R2 → Create bucket `unfold-audio`
2. Enable public access for the bucket (or set up a custom domain)
3. Create R2 API token with read/write permissions
4. Add env vars to Railway

- [ ] **Step 2: Verify R2 is accessible**

Test with a curl command or via the Cloudflare dashboard that the bucket is reachable.

- [ ] **Step 3: Deploy backend**

Push backend changes and verify Railway deploys successfully. Check logs for any startup errors related to R2.

---

## Task 13: Build, Verify, and Screenshot

- [ ] **Step 1: Build the mobile app**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx expo run:ios --device "iPhone 17 Pro"`

- [ ] **Step 2: Screenshot verification**

Take a screenshot to verify the app builds and runs without red screen errors:
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

- [ ] **Step 3: Run all tests (mobile + backend)**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest --no-coverage
cd /Users/galangster/clawd/work/unfold/backend && npx vitest run
```

- [ ] **Step 4: Verify evening trigger fires**

Open the app in simulator past 9 PM (or mock the time) and verify generation triggers in Metro logs. Look for:
- `[tts] Generating audio for voice=...`
- `[tts] Uploaded to R2: ...`
- `[TTS] cache MISS — downloading`

---

## Dependency Graph

```
Task 1 (store migration) ──┐
Task 2 (buildTtsText)   ──┤
Task 3 (evening cutoff) ──┼── Task 10 (preGenerateAudio) ── Task 11 (trigger wiring)
Task 4 (ai-client)     ──┤                                        │
Task 5 (annotation prompt) ┼── Task 6 (annotateForTts) ──┐        │
Task 7 (R2 storage)     ──┼── Task 8 (TTS route update) ─┼── Task 9 (mobile download)
                                                           └── Task 12 (env vars)
                                                           └── Task 13 (verify)
```

Tasks 1-7 can be parallelized (backend tasks 4-7 are independent of mobile tasks 1-3). Tasks 8-9 depend on 4-7. Tasks 10-11 depend on 1-3. Task 12 depends on 7-8. Task 13 depends on everything.
