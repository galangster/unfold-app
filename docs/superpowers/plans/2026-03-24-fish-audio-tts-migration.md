# Fish Audio S2 Pro TTS Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Smallest.ai Lightning with Fish Audio S2 Pro in the backend TTS proxy, add structural emotion tags, expand from 2 to 3-4 voices, and update mobile cache/voice IDs.

**Architecture:** The backend two-step proxy pattern (`POST /api/tts` → `GET /api/tts/:id`) stays identical. Only the internal API call changes (Smallest.ai → Fish Audio). Chunking and WAV concatenation are deleted entirely. A new emotion tag injection step runs before the API call. Mobile changes are limited to cache keys, file extension, and voice IDs.

**Tech Stack:** Fish Audio S2 Pro API, Express (backend on Railway), expo-audio (mobile), Zustand (state)

**Spec:** `docs/superpowers/specs/2026-03-24-fish-audio-tts-migration-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/routes/tts.ts` | Modify | Rewrite API call, delete chunking/WAV logic, add voice map, call emotion tagger |
| `backend/src/utils/emotion-tags.ts` | Create | Structural emotion tag injection function |
| `backend/src/utils/__tests__/emotion-tags.test.ts` | Create | Unit tests for emotion tag injection |
| `app/mobile/src/lib/tts-service.ts` | Modify | Cache extension `.wav`→`.mp3`, version `v7`→`v8`, new voice IDs, legacy mapping |
| `app/mobile/src/app/(tabs)/(you)/settings.tsx` | Modify | Expand voice picker to 3-4 voices, update VOICE_SAMPLES |
| `app/mobile/src/assets/audio/voice-samples/` | Modify | Add new voice sample MP3s (user provides after audition) |
| `backend/.env.example` | Modify | `SMALLEST_AI_API_KEY` → `FISH_AUDIO_API_KEY` |

---

## Task 1: Backend — Create Emotion Tag Injection Function (TDD)

**Files:**
- Create: `backend/src/utils/emotion-tags.ts`
- Create: `backend/src/utils/__tests__/emotion-tags.test.ts`

**Context:** Fish Audio S1/S2 Pro supports emotion tags in `(parenthesis)` syntax at the start of sentences. We inject tags based on content structure patterns that already exist in devotional text. Priority order (highest first): prayer → scripture → opening line → encouragement → application → reflection.

- [ ] **Step 1: Set up test file**

Check if the backend has a test runner configured:

```bash
cd /Users/galangster/clawd/work/unfold/backend
cat package.json | grep -A5 '"scripts"'
cat package.json | grep -E "jest|vitest|mocha"
```

If no test runner exists, install vitest:

```bash
bun add -d vitest
```

Add test script to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Create the test directory:

```bash
mkdir -p src/utils/__tests__
```

- [ ] **Step 2: Write failing tests**

Create `backend/src/utils/__tests__/emotion-tags.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { injectEmotionTags } from '../emotion-tags';

describe('injectEmotionTags', () => {
  it('returns empty string for empty input', () => {
    expect(injectEmotionTags('')).toBe('');
  });

  it('tags opening line with (warm)', () => {
    const text = 'Good morning, beloved. Today we reflect on grace.';
    const result = injectEmotionTags(text);
    expect(result).toMatch(/^\(warm\) Good morning/);
  });

  it('tags scripture quotes starting with > as (calm)', () => {
    const text = 'Consider this passage:\n> The Lord is my shepherd, I shall not want.';
    const result = injectEmotionTags(text);
    expect(result).toContain('(calm) The Lord is my shepherd');
  });

  it('tags scripture quotes in double quotes with book reference as (calm)', () => {
    const text = 'As Paul wrote: "For God so loved the world" (John 3:16).';
    const result = injectEmotionTags(text);
    expect(result).toContain('(calm)');
  });

  it('tags prayer sections with (whispering)', () => {
    const text = 'Let us close in prayer.\nPrayer: Lord, help me surrender my worries to you.';
    const result = injectEmotionTags(text);
    expect(result).toContain('(whispering) Lord, help me surrender');
  });

  it('tags lines after "Let us pray" header with (whispering)', () => {
    const text = 'Let us pray.\nFather, guide our steps today.';
    const result = injectEmotionTags(text);
    expect(result).toContain('(whispering) Father, guide');
  });

  it('tags encouragement with exclamation + keywords as (grateful)', () => {
    const text = 'Praise the Lord for His goodness!';
    const result = injectEmotionTags(text);
    expect(result).toContain('(grateful) Praise the Lord');
  });

  it('tags application/challenge sentences with you/your as (hopeful)', () => {
    const text = 'What area of your life needs surrender today?';
    const result = injectEmotionTags(text);
    expect(result).toContain('(hopeful) What area of your life');
  });

  it('tags mid-text reflection as (compassionate)', () => {
    // Mid-devotional exposition that doesn't match prayer/scripture/encouragement/application
    // gets (compassionate) — every devotional sentence warrants a tag
    const text = 'Opening line here.\nGrace is a gift we cannot earn through our own effort.';
    const result = injectEmotionTags(text);
    expect(result).toContain('(compassionate) Grace is a gift');
  });

  it('applies only one tag per sentence (no stacking)', () => {
    // "Prayer: Thank God!" matches both prayer and encouragement — prayer wins (higher priority)
    const text = 'Opening line.\nPrayer: Thank God for everything!';
    const result = injectEmotionTags(text);
    const prayerLine = result.split('\n').find(l => l.includes('Thank God'));
    expect(prayerLine).toMatch(/^\(whispering\)/);
    expect(prayerLine).not.toContain('(grateful)');
  });

  it('respects priority order: prayer > scripture > opening > encouragement > application > reflection', () => {
    // Scripture line that also has "you" — scripture (priority 2) wins over application (priority 5)
    const text = 'First line.\n> "You are the light of the world" (Matthew 5:14).';
    const result = injectEmotionTags(text);
    const scriptureLine = result.split('\n').find(l => l.includes('light of the world'));
    expect(scriptureLine).toMatch(/\(calm\)/);
    expect(scriptureLine).not.toContain('(hopeful)');
  });

  it('leaves sentences untagged when no pattern matches and not in fallback position', () => {
    // Single short sentence with no patterns
    const text = 'Hmm.';
    const result = injectEmotionTags(text);
    // Opening line gets (warm)
    expect(result).toBe('(warm) Hmm.');
  });

  it('handles a full devotional with mixed content', () => {
    const text = [
      'Good morning, friend.',
      '> "Be still and know that I am God." (Psalm 46:10)',
      'In the chaos of daily life, stillness feels impossible.',
      'What would it look like for you to pause and listen today?',
      'Thank God for His patience!',
      'Prayer: Father, teach me to be still before you.',
    ].join('\n');

    const result = injectEmotionTags(text);
    const lines = result.split('\n');

    expect(lines[0]).toMatch(/^\(warm\)/);          // Opening
    expect(lines[1]).toMatch(/\(calm\)/);            // Scripture
    expect(lines[2]).toMatch(/\(compassionate\)/);   // Reflection
    expect(lines[3]).toMatch(/\(hopeful\)/);          // Application (has "you")
    expect(lines[4]).toMatch(/\(grateful\)/);         // Encouragement
    expect(lines[5]).toMatch(/\(whispering\)/);       // Prayer
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/galangster/clawd/work/unfold/backend
bun run test src/utils/__tests__/emotion-tags.test.ts
```

Expected: FAIL — `Cannot find module '../emotion-tags'`

- [ ] **Step 4: Implement emotion tag injection**

Create `backend/src/utils/emotion-tags.ts`:

```typescript
/**
 * Structural emotion tag injection for Fish Audio TTS.
 *
 * Adds (parenthesis) emotion tags at the start of sentences based on
 * content patterns in devotional text. Zero AI cost — pure regex matching.
 *
 * Priority order (highest first):
 * 1. Prayer closing → (whispering)
 * 2. Scripture quotes → (calm)
 * 3. Opening line → (warm)
 * 4. Encouragement → (grateful)
 * 5. Application/challenge → (hopeful)
 * 6. Reflection/exposition → (compassionate)
 */

const PRAYER_HEADER = /^(prayer\s*:|let us pray)/i;
const SCRIPTURE_BLOCKQUOTE = /^>\s*/;
const SCRIPTURE_QUOTED = /^"[^"]+"\s*\([A-Z][a-z]+ \d+:\d+/;
const ENCOURAGEMENT_KEYWORDS = /\b(praise|thank god|hallelujah|glory)\b/i;
const ENCOURAGEMENT_EXCLAIM = /!$/;
const APPLICATION_PRONOUNS = /\b(you|your|you're|yourself)\b/i;

type TagResult = { tag: string; cleanLine: string } | null;

function detectPrayer(line: string, inPrayerSection: boolean): TagResult {
  if (PRAYER_HEADER.test(line)) {
    // Strip the "Prayer:" prefix — the tag replaces it tonally
    const cleaned = line.replace(/^prayer\s*:\s*/i, '').replace(/^let us pray\.\s*/i, '');
    return cleaned.trim()
      ? { tag: '(whispering)', cleanLine: cleaned.trim() }
      : null; // Header-only line like "Let us pray." — mark section, skip tagging
  }
  if (inPrayerSection) {
    return { tag: '(whispering)', cleanLine: line };
  }
  return null;
}

function detectScripture(line: string): TagResult {
  if (SCRIPTURE_BLOCKQUOTE.test(line)) {
    const cleaned = line.replace(/^>\s*/, '');
    return { tag: '(calm)', cleanLine: cleaned };
  }
  if (SCRIPTURE_QUOTED.test(line)) {
    return { tag: '(calm)', cleanLine: line };
  }
  return null;
}

function detectEncouragement(line: string): TagResult {
  if (ENCOURAGEMENT_KEYWORDS.test(line) && ENCOURAGEMENT_EXCLAIM.test(line.trim())) {
    return { tag: '(grateful)', cleanLine: line };
  }
  return null;
}

function detectApplication(line: string): TagResult {
  if (APPLICATION_PRONOUNS.test(line)) {
    return { tag: '(hopeful)', cleanLine: line };
  }
  return null;
}

export function injectEmotionTags(text: string): string {
  if (!text.trim()) return '';

  const lines = text.split('\n');
  const taggedLines: string[] = [];
  let inPrayerSection = false;
  let isFirstContentLine = true;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      taggedLines.push('');
      continue;
    }

    // Check if this line starts a prayer section
    if (PRAYER_HEADER.test(line)) {
      inPrayerSection = true;
    }

    // Apply priority order: prayer > scripture > opening > encouragement > application > reflection
    let result: TagResult = null;

    // Priority 1: Prayer
    result = detectPrayer(line, inPrayerSection);
    if (result) {
      taggedLines.push(`${result.tag} ${result.cleanLine}`);
      isFirstContentLine = false;
      continue;
    }

    // Priority 2: Scripture
    result = detectScripture(line);
    if (result) {
      taggedLines.push(`${result.tag} ${result.cleanLine}`);
      isFirstContentLine = false;
      continue;
    }

    // Priority 3: Opening line
    if (isFirstContentLine) {
      taggedLines.push(`(warm) ${line}`);
      isFirstContentLine = false;
      continue;
    }

    // Priority 4: Encouragement
    result = detectEncouragement(line);
    if (result) {
      taggedLines.push(`${result.tag} ${result.cleanLine}`);
      continue;
    }

    // Priority 5: Application/challenge
    result = detectApplication(line);
    if (result) {
      taggedLines.push(`${result.tag} ${result.cleanLine}`);
      continue;
    }

    // Priority 6: Reflection (fallback)
    taggedLines.push(`(compassionate) ${line}`);
  }

  return taggedLines.join('\n');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/galangster/clawd/work/unfold/backend
bun run test src/utils/__tests__/emotion-tags.test.ts
```

Expected: All 12 tests PASS.

If any fail, adjust the implementation to match the expected behavior (the tests define the contract). Common adjustments:
- The "Let us pray." line itself vs content after it — handle the header line and subsequent lines
- Encouragement detection may need tuning (must have BOTH keyword + exclamation)

- [ ] **Step 6: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/utils/emotion-tags.ts src/utils/__tests__/emotion-tags.test.ts
git commit -m "feat(tts): add structural emotion tag injection for Fish Audio

TDD-built helper that injects Fish Audio emotion tags based on
devotional content patterns. Six tag types with priority ordering.
Zero AI cost — pure regex matching."
```

---

## Task 2: Backend — Rewrite TTS Route for Fish Audio

**Files:**
- Modify: `backend/src/routes/tts.ts` (lines 1-231)

**Context:** This file currently calls Smallest.ai with chunking + WAV concatenation. Replace with a single Fish Audio API call returning MP3. The two-step proxy pattern (POST → GET) stays identical. The client contract (`{text, voiceId}` → `{downloadId}`) is unchanged.

**Reference:** Read the current file first. Key sections to understand:
- Lines 26-29: `VALID_VOICE_IDS` set
- Lines 49-85: `chunkTextAtSentenceBoundaries()` function — DELETE
- Lines 87-143: WAV generation loop + concatenation — REPLACE
- Lines 22, 40-47: Cache with TTL — KEEP (change content type only)

- [ ] **Step 1: Read the current backend tts.ts**

```bash
cat /Users/galangster/clawd/work/unfold/backend/src/routes/tts.ts
```

Understand the full file before making changes.

- [ ] **Step 2: Add Fish Audio voice map and update valid voice IDs**

At the top of the file, replace the Smallest.ai constants:

```typescript
// Fish Audio S2 Pro voice map
// Keys are client-facing voice IDs, values are Fish Audio reference_ids
// NOTE: reference_ids are placeholders — replace with actual IDs after voice audition
const VOICE_MAP: Record<string, string> = {
  'caleb': 'PLACEHOLDER_CALEB_REFERENCE_ID',    // Warm, pastoral male
  'grace': 'PLACEHOLDER_GRACE_REFERENCE_ID',    // Gentle, reflective female
  'eli':   'PLACEHOLDER_ELI_REFERENCE_ID',      // Wise mentor
};

// Legacy voice ID mapping (users with stored preferences from Smallest.ai era)
const LEGACY_VOICE_MAP: Record<string, string> = {
  'arman': 'caleb',
  'jasmine': 'grace',
};

const VALID_VOICE_IDS = new Set([...Object.keys(VOICE_MAP), ...Object.keys(LEGACY_VOICE_MAP)]);
const DEFAULT_VOICE = 'caleb';
```

- [ ] **Step 3: Add voice resolution function**

```typescript
function resolveVoiceId(voiceId: string): string {
  // Map legacy IDs to new ones
  const mapped = LEGACY_VOICE_MAP[voiceId] || voiceId;
  // Fall back to default if unknown
  return VOICE_MAP[mapped] ? mapped : DEFAULT_VOICE;
}
```

- [ ] **Step 4: Delete chunking function**

Remove the entire `chunkTextAtSentenceBoundaries()` function (approximately lines 49-85). This is no longer needed — Fish Audio handles up to 40K characters in a single request.

- [ ] **Step 5: Rewrite the POST /api/tts handler**

Replace the Smallest.ai generation logic with Fish Audio. The handler should:

1. Validate input (same as before)
2. Resolve voice ID (new: handles legacy mapping)
3. Inject emotion tags (new: import from `../utils/emotion-tags`)
4. Single fetch to Fish Audio API (replaces chunk loop + WAV concat)
5. Collect response buffer (MP3, not WAV)
6. Cache and return downloadId (same pattern)

```typescript
import { injectEmotionTags } from '../utils/emotion-tags';

// In the POST handler, replace the generation logic:

const resolvedVoice = resolveVoiceId(voiceId);
const taggedText = injectEmotionTags(text);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000);

let fishResponse: Response;
try {
  fishResponse = await fetch('https://api.fish.audio/v1/tts', {
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
    return res.status(504).json({ error: 'TTS generation timed out' });
  }
  throw err;
}
clearTimeout(timeout);

if (!fishResponse.ok) {
  const errorBody = await fishResponse.text().catch(() => 'unknown');
  console.error(`Fish Audio API error: ${fishResponse.status} — ${errorBody}`);
  return res.status(502).json({ error: 'TTS generation failed' });
}

// Collect chunked response into buffer
const arrayBuffer = await fishResponse.arrayBuffer();
const audioBuffer = Buffer.from(arrayBuffer);
```

- [ ] **Step 6: Update the GET handler content type**

Change the response content type from WAV to MP3:

```typescript
// In the GET /api/tts/:id handler:
res.set('Content-Type', 'audio/mpeg');  // Was 'audio/wav'
```

- [ ] **Step 7: Delete WAV-specific imports and utilities**

Remove any WAV header construction, PCM concatenation, or buffer manipulation utilities that were specific to the Smallest.ai chunking approach. These are no longer needed since Fish Audio returns a complete MP3 file.

- [ ] **Step 8: Update environment variable references**

Replace all references to `SMALLEST_AI_API_KEY` with `FISH_AUDIO_API_KEY`. Update `backend/.env.example`:

```
# TTS — Fish Audio S2 Pro
FISH_AUDIO_API_KEY=your_fish_audio_api_key_here
FISH_AUDIO_MODEL=s2-pro
```

- [ ] **Step 9: Verify backend compiles**

```bash
cd /Users/galangster/clawd/work/unfold/backend
bun run build  # or: npx tsc --noEmit
```

Expected: No TypeScript errors. If the build script doesn't exist, run `npx tsc --noEmit` to type-check.

- [ ] **Step 10: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/routes/tts.ts .env.example
git commit -m "feat(tts): migrate from Smallest.ai to Fish Audio S2 Pro

- Single API call replaces chunked generation + WAV concatenation
- MP3 output (was WAV) — better quality, smaller files
- Structural emotion tags injected before generation
- Legacy voice ID mapping (arman→caleb, jasmine→grace)
- 60s timeout for full-text generation
- ~50 lines of chunking/WAV code deleted"
```

---

## Task 3: Mobile — Update TTS Service

**Files:**
- Modify: `app/mobile/src/lib/tts-service.ts`

**Context:** The mobile TTS service handles caching, voice IDs, and request deduplication. Three changes: (1) cache files become `.mp3`, (2) cache version bumps to `v8`, (3) voice catalog expands with legacy fallback mapping. The API contract with the backend is unchanged.

**Reference:** Read the current `tts-service.ts` first. Key sections:
- Lines 26-29: `TTS_VOICES` array
- Line ~67: `getCacheFile()` — filename pattern `tts_{hash}.wav`
- Line ~51: Cache key prefix `v7:{voiceId}:{text}`
- Lines 150-221: `streamDevotionalAudio()`, `getDefaultVoice()`

- [ ] **Step 1: Read the current tts-service.ts**

```bash
cat /Users/galangster/clawd/work/unfold/app/mobile/src/lib/tts-service.ts
```

- [ ] **Step 2: Update voice catalog**

Replace the `TTS_VOICES` array:

```typescript
export const TTS_VOICES = [
  { id: 'caleb', name: 'Caleb', description: 'Warm, pastoral male voice', premium: false },
  { id: 'grace', name: 'Grace', description: 'Gentle, reflective female voice', premium: false },
  { id: 'eli', name: 'Eli', description: 'Wise, authoritative mentor voice', premium: false },
] as const;
```

Names are placeholders — update after user picks voices during audition.

- [ ] **Step 3: Add legacy voice ID mapping**

Add after `TTS_VOICES`:

```typescript
// Map legacy Smallest.ai voice IDs to new Fish Audio voice IDs
const LEGACY_VOICE_MAP: Record<string, string> = {
  'arman': 'caleb',
  'jasmine': 'grace',
};

/** Resolve a voice ID, mapping legacy IDs to current ones */
function resolveVoiceId(voiceId: string): string {
  const mapped = LEGACY_VOICE_MAP[voiceId] || voiceId;
  const isValid = TTS_VOICES.some(v => v.id === mapped);
  return isValid ? mapped : TTS_VOICES[0].id;
}
```

- [ ] **Step 4: Update cache version and file extension**

Find the cache key construction (around line 51) and update:

```typescript
// Change v7 → v8 to invalidate stale WAV cache entries
const cacheKey = `v8:${voiceId}:${text}`;
```

Find the cache filename pattern (around line 67) and update:

```typescript
// Change .wav → .mp3
const cacheFile = `${Paths.cache}/tts_${hash}.mp3`;
```

**Note:** `clearAudioCache()` (around line 82) already handles both `.wav` and `.mp3` extensions. No changes needed there — just verify it's still correct.

- [ ] **Step 5: Update getDefaultVoice**

```typescript
export function getDefaultVoice(isPremium?: boolean): string {
  return 'caleb';  // Was 'arman'
}
```

- [ ] **Step 6: Wire resolveVoiceId into streamDevotionalAudio**

In `streamDevotionalAudio()`, resolve the voice ID before using it:

```typescript
export async function streamDevotionalAudio(text: string, voiceId?: string) {
  const resolvedVoice = resolveVoiceId(voiceId || getDefaultVoice());
  // Use resolvedVoice instead of voiceId for cache key and API call
  // ...
}
```

Do the same in `prefetchDevotionalAudio()` if it accepts a voiceId parameter.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/lib/tts-service.ts
git commit -m "feat(tts): update mobile TTS service for Fish Audio migration

- Voice catalog: arman/jasmine → caleb/grace/eli
- Legacy voice ID mapping for existing user preferences
- Cache version v7→v8 (invalidates stale WAV entries)
- Cache extension .wav→.mp3"
```

---

## Task 4: Mobile — Update Settings Voice Picker

**Files:**
- Modify: `app/mobile/src/app/(tabs)/(you)/settings.tsx`
- Modify: `app/mobile/src/assets/audio/voice-samples/` (add new sample files)

**Context:** The settings screen has a "Reading Voice" section with voice pills and preview playback. Update `VOICE_SAMPLES` to reference new voice files, expand from 2 to 3 voices.

**Reference:** Read the relevant section of settings.tsx first:
- Lines 35-38: `VOICE_SAMPLES` record
- Lines 115-151: Voice preview logic
- Lines 1330-1455: Voice selection UI

- [ ] **Step 1: Read the voice-related sections of settings.tsx**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
head -40 src/app/\(tabs\)/\(you\)/settings.tsx
sed -n '115,155p' src/app/\(tabs\)/\(you\)/settings.tsx
```

- [ ] **Step 2: Generate voice sample MP3s**

**This step requires the user to have selected Fish Audio voices.** Until then, use placeholder files.

Option A (voices selected): Generate short Psalm 23:1 samples via Fish Audio API or playground for each voice, save as:
- `src/assets/audio/voice-samples/caleb.mp3`
- `src/assets/audio/voice-samples/grace.mp3`
- `src/assets/audio/voice-samples/eli.mp3`

Option B (placeholder): Copy existing `arman.mp3` temporarily:

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile/src/assets/audio/voice-samples
cp arman.mp3 caleb.mp3
cp jasmine.mp3 grace.mp3
cp arman.mp3 eli.mp3
```

Old sample files (`arman.mp3`, `jasmine.mp3`, `david.mp3`, `elena.mp3`, `katie.mp3`, `marcus.mp3`, `michael.mp3`, `sophia.mp3`) can be deleted after migration is verified — they are legacy assets.

- [ ] **Step 3: Update VOICE_SAMPLES record**

In `settings.tsx`, replace the `VOICE_SAMPLES` constant:

```typescript
const VOICE_SAMPLES: Record<string, any> = {
  'caleb': require('@/assets/audio/voice-samples/caleb.mp3'),
  'grace': require('@/assets/audio/voice-samples/grace.mp3'),
  'eli': require('@/assets/audio/voice-samples/eli.mp3'),
};
```

- [ ] **Step 4: Verify voice picker renders correctly**

The voice picker UI maps over `TTS_VOICES` (imported from tts-service.ts) and uses `VOICE_SAMPLES[voice.id]` for preview playback. Since we updated both `TTS_VOICES` (Task 3) and `VOICE_SAMPLES` (this task), the picker should render 3 voices with working preview.

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
git add src/app/\(tabs\)/\(you\)/settings.tsx src/assets/audio/voice-samples/
git commit -m "feat(tts): update settings voice picker for Fish Audio voices

- VOICE_SAMPLES updated: caleb, grace, eli (was arman, jasmine)
- 3 voice options (was 2)
- Sample MP3s added (placeholder — replace after voice audition)"
```

---

## Task 5: Backend — Deploy to Railway

**Files:**
- None (environment configuration only)

**Context:** The backend runs on Railway. We need to add the Fish Audio API key and optionally remove the Smallest.ai key.

- [ ] **Step 1: Set Railway environment variables**

```bash
# If Railway CLI is installed:
railway variables set FISH_AUDIO_API_KEY=<your-fish-audio-api-key>
railway variables set FISH_AUDIO_MODEL=s2-pro

# Or set via Railway dashboard:
# https://railway.app → unfold-backend → Variables
# Add: FISH_AUDIO_API_KEY = <key from fish.audio dashboard>
# Add: FISH_AUDIO_MODEL = s2-pro
```

- [ ] **Step 2: Push backend changes**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git push origin main
```

Railway auto-deploys on push. Wait for deployment to complete.

- [ ] **Step 3: Verify deployment health**

```bash
curl -s https://unfold-backend-production.up.railway.app/health
```

Expected: 200 OK response.

- [ ] **Step 4: Commit environment changes (if any local .env changes)**

No commit needed — environment variables are set in Railway dashboard, not in code.

---

## Task 6: End-to-End Verification

**Files:** None (testing only)

**Context:** Verify the full TTS flow works: mobile app → backend proxy → Fish Audio API → audio playback.

- [ ] **Step 1: Test backend TTS endpoint directly**

```bash
# Test POST to generate audio
curl -X POST https://unfold-backend-production.up.railway.app/api/tts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <test-clerk-token>" \
  -d '{"text": "The Lord is my shepherd, I shall not want. He makes me lie down in green pastures.", "voiceId": "caleb"}' \
  -o /dev/null -w "%{http_code}"
```

Expected: `200` response with `{"downloadId": "..."}`.

```bash
# Test GET to download audio (use the downloadId from above)
curl -s https://unfold-backend-production.up.railway.app/api/tts/<downloadId> \
  -o /tmp/test-tts.mp3

# Verify it's a valid MP3
file /tmp/test-tts.mp3
```

Expected: `MPEG ADTS, layer III` or similar MP3 identification.

```bash
# Play the audio to verify quality
open /tmp/test-tts.mp3
```

Listen for: clear speech, correct voice, emotion tag effect (warm opening, calm scripture delivery).

- [ ] **Step 2: Test legacy voice ID fallback**

```bash
curl -X POST https://unfold-backend-production.up.railway.app/api/tts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <test-clerk-token>" \
  -d '{"text": "Testing legacy voice mapping.", "voiceId": "arman"}' \
  -o /dev/null -w "%{http_code}"
```

Expected: `200` — "arman" should map to "caleb" internally.

- [ ] **Step 3: Test emotion tag injection on devotional-style text**

```bash
curl -X POST https://unfold-backend-production.up.railway.app/api/tts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <test-clerk-token>" \
  -d '{"text": "Good morning, beloved.\n> \"Be still and know that I am God.\" (Psalm 46:10)\nIn the chaos of daily life, stillness feels impossible.\nWhat would it look like for you to pause today?\nPraise God for His patience!\nPrayer: Father, teach me to be still.", "voiceId": "caleb"}'
```

Listen for tonal variation across the devotional sections (warm → calm → reflective → encouraging → whispered prayer).

- [ ] **Step 4: Build and test mobile app**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx expo run:ios --device "iPhone 17 Pro"
```

Test flow:
1. Open a devotional → tap the audio play button → audio should play (MP3 format)
2. Go to Settings → Reading Voice → verify 3 voices listed (caleb, grace, eli)
3. Tap a voice preview → should hear sample audio
4. Switch voices → play a devotional → should use selected voice
5. Kill and reopen app → audio player should restore correctly
6. Navigate to evening wind-down → play scripture audio → verify default voice path works (no voiceId param)

- [ ] **Step 5: Take verification screenshot**

```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-tts.png && sips -Z 1000 /tmp/sim-tts.png
```

Verify: settings voice picker shows 3 voices, audio player plays correctly.

- [ ] **Step 6: Final commit (if any fixes needed)**

If any adjustments were needed during testing, commit them:

```bash
git status  # Review changes first
git add <specific-changed-files>
git commit -m "fix(tts): adjustments from end-to-end testing"
```

---

## Voice Audition Checkpoint

**After Task 6 is verified with placeholder voices**, the user selects real Fish Audio voices:

1. User browses [fish.audio](https://fish.audio) voice library or creates custom voice clones
2. User provides `reference_id` values for each selected voice
3. Update `VOICE_MAP` in `backend/src/routes/tts.ts` with real reference_ids
4. Generate real voice samples (Psalm 23:1) and replace placeholder MP3s in `assets/audio/voice-samples/`
5. Update voice names/descriptions in `tts-service.ts` and `settings.tsx` if needed
6. Push backend + mobile changes
7. Re-run Task 6 verification with real voices

**Sync note:** `VOICE_MAP` (backend) and `TTS_VOICES` + `LEGACY_VOICE_MAP` (mobile) must stay in sync. When adding/removing voices, update both codebases together.
