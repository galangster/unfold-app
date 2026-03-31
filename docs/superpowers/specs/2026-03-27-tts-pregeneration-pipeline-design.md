# TTS Pre-Generation Pipeline + Audio Persistence — Design Spec

**Date:** 2026-03-27
**Status:** Reviewed (v4 — second review fixes applied)
**Extends:** `2026-03-27-deferred-generation-architecture-design.md` (deferred generation, cutoff logic, background fetch)
**Scope:** Evening generation triggers, TTS audio pre-generation, AI-driven emotion tagging, persistent audio storage (Cloudflare R2)

---

## 1. Problem Statement

Three problems with the current TTS flow:

1. **Audio is never pre-generated.** TTS only fires when the user opens the reading screen and taps play (or when `prefetchDevotionalAudio()` runs on screen mount). This means 30-60 seconds of waiting for Fish Audio to generate — especially painful for the first play.

2. **Audio doesn't persist.** The backend stores audio in an in-memory `Map` with a 7-day TTL. Server restarts, Railway redeploys, or TTL expiration wipe everything. A user returning to a devotional 2 weeks later gets a 404.

3. **Emotion tagging is blunt.** The current `injectEmotionTags()` function uses regex pattern matching — every prayer gets the same bracket, every scripture gets the same bracket. It can't distinguish a lament from a praise psalm, can't humanize embedded scripture references ("Romans 8:28" reads as "Romans eight colon twenty-eight"), and can't adapt intensity to the narrative arc.

---

## 2. Architecture Overview

### 2.1 Evening Generation Triggers

The deferred generation spec (Section 3.1) uses a midnight cutoff. This spec adds two earlier trigger opportunities that fire when the user is actively in the app — no background execution needed.

**Trigger chain (all idempotent, first successful one wins):**

| Priority | Trigger | When | Context richness |
|----------|---------|------|-----------------|
| 1 | Evening check-in completion | User completes binary evening check-in | High — signals day is winding down; all journaling/reflection context accumulated so far is available |
| 2 | Late-night app open | User opens app after 9 PM | High — most daily context available |
| 3 | BackgroundFetch (existing) | iOS-determined, overnight | Same as #2 (midnight cutoff) |
| 4 | Morning app open (existing) | User opens app, next day missing | Same as #2 (midnight cutoff) |

After any trigger successfully generates devotional text, TTS pre-generation fires immediately.

### 2.2 TTS Pre-Generation Flow

```
Trigger fires → triggerNextDayGeneration() → addGeneratedDay() → preGenerateAudio()
                                                                       ↓
                                                              buildTtsText(day)
                                                                       ↓
                                                         POST /api/tts (backend)
                                                                       ↓
                                                    AI emotion tagging (Grok) ← NEW
                                                                       ↓
                                                        Fish Audio S2 Pro generates MP3
                                                                       ↓
                                                           Upload to Cloudflare R2 ← NEW
                                                                       ↓
                                                      Audio cached at CDN edge globally
                                                                       ↓
                                              Morning: user taps play → instant playback
```

---

## 3. Evening Cutoff Logic

### 3.1 New Function: `isPastEveningCutoff()`

Added to `cutoff-logic.ts` alongside existing `isPastCutoff()`:

```typescript
const DEFAULT_EVENING_CUTOFF_HOUR = 21; // 9 PM local time

export function isPastEveningCutoff(
  now: Date = new Date(),
  cutoffHour: number = DEFAULT_EVENING_CUTOFF_HOUR
): boolean {
  return now.getHours() >= cutoffHour;
}
```

The existing midnight `isPastCutoff()` is unchanged — BackgroundFetch and morning triggers still use it.

### 3.2 New Store Field: `lastEveningGenerationDate`

A YYYY-MM-DD string tracking whether evening generation has already fired today. Prevents double-generation if user completes evening check-in AND opens app at 10 PM.

```typescript
// State field
lastEveningGenerationDate: string; // default: ''

// Setter action
setLastEveningGenerationDate: (date: string) => void;
```

Added via store migration v27 → v28. (v27 is already shipped in Build 28.)

### 3.3 Guard Function: `attemptEveningGeneration()`

New function in `progressive-generation.ts`:

```typescript
export async function attemptEveningGeneration(devotionalId: string): Promise<boolean> {
  const store = useUnfoldStore.getState();
  const today = todayDateString();

  // Guard: already generated tonight?
  if (store.lastEveningGenerationDate === today) return false;

  // Guard: past evening cutoff?
  if (!isPastEveningCutoff()) return false;

  // Guard: active progressive devotional with missing next day?
  const devotional = store.devotionals.find(
    d => d.id === devotionalId && d.generationMode === 'progressive'
  );
  if (!devotional) return false;

  const nextDay = devotional.currentDay;
  if (devotional.days.some(d => d.dayNumber === nextDay)) return false;
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

### 3.4 Trigger 1: Evening Check-In Completion

In the evening check-in submission handler (after saving reflection data), call `attemptEveningGeneration()`. The user is actively in the app — no background execution concerns.

### 3.5 Trigger 2: Late-Night App Open

In the home screen focus effect (`index.tsx`), alongside the existing morning generation check:

```typescript
// Existing: morning generation (past midnight cutoff)
if (isPastCutoff(lastCutoff)) {
  triggerNextDayGeneration(...)
}

// NEW: evening generation (past 9 PM, user just opened app)
else if (isPastEveningCutoff() && lastEveningGenerationDate !== today) {
  attemptEveningGeneration(currentDevotional.id);
}
```

### 3.6 TTS Hook for Existing Triggers

BackgroundFetch (`background-generation.ts:66-69`) and morning app-open (`index.tsx:219-224`) already generate devotional text. Add `preGenerateAudio()` call after successful generation in both locations.

---

## 4. Shared TTS Text Utility

### 4.1 The Cache Key Mismatch Gotcha

The TTS text must be constructed identically everywhere or the content hash won't match — causing redundant Fish Audio calls and cache misses. Currently, text is built inline in `reading.tsx` at two locations (lines 376 and 551).

### 4.2 Shared Function

Extract to `tts-service.ts`:

```typescript
export function buildTtsText(day: { scriptureReference: string; scriptureText: string; bodyText: string }): string {
  return `${humanizeReference(day.scriptureReference)}.\n\n${day.scriptureText}\n\n...\n\n${day.bodyText}`;
}
```

`humanizeReference()` also moves from `reading.tsx` (local function, line 67) to a shared export in `tts-service.ts`.

### 4.3 Pre-Generation Function

```typescript
async function preGenerateAudio(devotionalId: string, dayNumber: number): Promise<void> {
  try {
    const store = useUnfoldStore.getState();
    const devotional = store.devotionals.find(d => d.id === devotionalId);
    const day = devotional?.days.find(d => d.dayNumber === dayNumber);
    if (!day) return;

    const voiceId = store.user?.preferredVoice || getDefaultVoice();
    const text = buildTtsText(day);
    await prefetchDevotionalAudio(text, voiceId);
  } catch {
    // Silent fail — devotional text is the priority, audio is a bonus
  }
}
```

### 4.4 Reading Screen Update

Replace inline text construction in `reading.tsx` with `buildTtsText(currentDayData)` at both call sites (prefetch useEffect and play handler).

**Backward compatibility:** The output of `buildTtsText()` MUST produce identical strings to the current inline construction in `reading.tsx` (lines 376 and 551). Write a unit test that captures the current inline output format and asserts `buildTtsText()` matches. This prevents breaking existing cached audio on user devices.

---

## 5. AI-Driven Emotion Tagging

### 5.1 Current State

`injectEmotionTags()` in `backend/src/utils/emotion-tags.ts` uses regex to detect 6 patterns (prayer, scripture, encouragement, application, opening, reflection) and inject Fish Audio S2 Pro bracket syntax. Same tag for every prayer, same tag for every scripture — no contextual awareness.

### 5.2 New Approach

Replace regex with a Grok-powered preprocessing step. Before sending text to Fish Audio, the backend calls Grok to annotate the text with contextually appropriate brackets.

**New backend function: `annotateForTts(text: string): Promise<string>`**

Located in `backend/src/utils/emotion-tags.ts` (replaces `injectEmotionTags`):

**New shared utility: `backend/src/utils/ai-client.ts`**

Extracts xAI/Grok calling logic from the inline `handleAIRequest()` handler into a reusable function:

```typescript
// backend/src/utils/ai-client.ts
export async function callAI(params: {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: { role: string; content: string }[];
  timeoutMs?: number;
}): Promise<{ text: string }> { ... }
```

Uses the existing xAI API key from environment variables. Default timeout: 10 seconds.

**Annotation function:**

```typescript
export async function annotateForTts(text: string): Promise<string> {
  // Grok fast model for speed + cost efficiency
  const response = await callAI({
    model: 'grok-4-1-fast-non-reasoning',
    max_tokens: Math.ceil(text.length * 1.3), // output ≈ input + brackets
    temperature: 0.3, // low temperature for consistency
    system: FISH_AUDIO_ANNOTATION_PROMPT,
    messages: [{ role: 'user', content: text }],
    timeoutMs: 10_000, // 10s hard timeout — fall back to regex on timeout
  });
  return response.text;
}
```

### 5.3 System Prompt

The system prompt includes:
1. Fish Audio S2 Pro bracket syntax documentation (what brackets are supported, how they affect voice)
2. Rules for scripture reference pronunciation ("Romans 8:28" → "Romans chapter 8, verse 28")
3. Instructions for reading different devotional sections with appropriate tone:
   - Opening: warm, inviting
   - Scripture: reverent, weighted, natural pacing
   - Personal story: intimate, conversational
   - Theological explanation: thoughtful, measured
   - Application/challenge: direct, encouraging
   - Prayer: gentle, intimate, slowing pace
   - Closing: warm, sending-off tone
4. Rules for pacing: natural pauses at section transitions, breathing room around scripture quotes
5. Emphasis on varying tone throughout — no monotone reading

### 5.4 Fish Audio Bracket Documentation

The system prompt must include Fish Audio's actual bracket syntax reference so Grok knows exactly what's available. This needs to be researched from Fish Audio's API docs and embedded in the prompt constant.

### 5.5 Scripture Reference Humanization

The AI annotation step also handles humanizing ALL embedded scripture references in the body text — not just the header reference. Examples:

- "as Paul writes in Romans 8:28" → "as Paul writes in Romans chapter 8, verse 28"
- "See also Psalm 139:1-4" → "See also Psalm 139, verses 1 through 4"
- "John 3:16 tells us" → "John chapter 3, verse 16 tells us"

This replaces the client-side `humanizeReference()` for the header reference — the AI handles everything in one pass.

**Note:** The client-side `buildTtsText()` still includes the raw `humanizeReference()` call for the header. The backend AI annotation will further process any remaining references. This is belt-and-suspenders — the client humanizes what it can, the AI catches everything else.

**Double-humanization risk:** The AI annotation prompt MUST include an instruction: "If a scripture reference is already in humanized form (e.g., 'Romans chapter 8, verse 28'), leave it as-is. Only humanize references in raw citation format (e.g., 'Romans 8:28')." This prevents the AI from mangling already-humanized references sent by the client.

### 5.6 Cost

- Input: ~1,300 tokens (1000-word devotional)
- Output: ~1,500 tokens (same text + brackets)
- Grok fast: ~$0.001-0.002 per devotional
- At 1K DAU: ~$1-2/month
- This is 5-10% of the Fish Audio TTS cost — negligible

### 5.7 Fallback

If Grok annotation fails (timeout, error, rate limit), fall back to the existing regex `injectEmotionTags()`. The regex version is kept as a fallback, not deleted.

### 5.8 Cache Implications

AI annotation is non-deterministic — same input could get slightly different brackets. This means a different content hash if regenerated. In practice this doesn't matter because:
- Each devotional is generated once (no re-generation)
- The content hash is computed on the annotated text and stored with the R2 file
- The mobile app uses the hash returned by the POST response, not a locally computed hash

---

## 6. Persistent Audio Storage (Cloudflare R2)

### 6.1 Current State

Audio is stored in-memory on the backend (`contentCache` Map, 7-day TTL). Server restart or redeploy = all audio lost. Railway CDN caches responses but is not persistent storage.

### 6.2 R2 Architecture

```
POST /api/tts flow:
  1. Check R2 for existing audio (content hash lookup)
  2. If exists → return R2 URL (cache hit)
  3. If not → call Fish Audio → upload MP3 to R2 → return R2 URL

Mobile app:
  Downloads from R2 public URL (Cloudflare CDN) instead of /api/audio/:hash
```

### 6.3 R2 Configuration

- **Bucket name:** `unfold-audio`
- **Key format:** `audio/{contentHash}.mp3`
- **Access:** Public read via Cloudflare CDN (custom domain or R2.dev subdomain)
- **No user-identifiable data** in keys — content hash is derived from text + voice ID only
- **No expiration** — audio persists indefinitely

### 6.4 Backend Changes

**New dependency:** `@aws-sdk/client-s3` (R2 uses S3-compatible API)

**Environment variables:**
```
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
R2_BUCKET_NAME=unfold-audio
R2_PUBLIC_URL=https://audio.unfold.app  # or R2.dev subdomain
```

**New utility: `backend/src/utils/r2-storage.ts`**

```typescript
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function audioExistsInR2(hash: string): Promise<boolean> { ... }
export async function uploadAudioToR2(hash: string, buffer: Buffer): Promise<string> { ... }
export function getR2PublicUrl(hash: string): string { ... }
```

### 6.5 Updated TTS Route Flow

```typescript
// POST /api/tts (updated flow)
1. Validate input (text, voiceId)
2. Resolve voice
3. Compute R2 lookup hash from RAW text + voiceId (pre-annotation)
4. Check R2 for existing audio → if exists, return R2 URL (skip annotation AND Fish Audio)
5. If not in R2 → annotate text with AI emotion tags (Grok)
6. Call Fish Audio with annotated text → get audio buffer
7. Upload to R2 using the RAW text hash as key
8. Optionally cache in-memory using raw text hash as key (hot cache for immediate re-request)
9. Return { audioHash: rawTextHash, audioUrl: R2 public URL }
```

**Critical:** The R2 lookup key MUST use the raw text hash (pre-annotation), NOT the annotated text hash. Since AI annotation is non-deterministic, the same raw text could produce different bracket placements on different runs. Using the raw hash ensures cache hits are reliable. The mobile client computes the same raw hash via `buildTtsText()` + `voiceId` for local cache keying.

**In-memory cache transition:** The existing `contentCache` in-memory Map also transitions to raw-text hash keying (same as R2). The `/api/audio/:hash` CDN endpoint serves from this raw-text-keyed cache. This ensures consistent keying across all cache layers (in-memory → R2 → CDN).

### 6.6 Mobile App Changes

The POST response now includes `audioUrl` (R2 public URL) instead of `downloadId`. The mobile app downloads directly from R2/Cloudflare CDN:

```typescript
const { audioHash, audioUrl } = await genResponse.json();
// audioUrl = "https://audio.unfold.app/audio/abc123def456.mp3"

const downloadResult = await FileSystem.downloadAsync(audioUrl, cachedFile.uri);
```

The `/api/audio/:hash` and `/api/tts-download/:id` endpoints are kept temporarily for backward compatibility but can be removed once all clients update.

### 6.7 Cost

- Storage: $0.015/GB/month (first 10 GB free)
- Egress: Free (Cloudflare's main selling point)
- 1K users × 30 days × 4 MB = 120 GB = ~$1.65/month
- 10K users × 365 days × 4 MB = 14 TB/year = ~$210/year

### 6.8 Privacy

- R2 keys are content hashes — no user IDs, names, or personal data
- Audio content is AI-narrated devotional text, not user-generated content
- No cross-user data exposure (different users with different devotionals = different hashes)
- Privacy policy update: "Narrated audio is stored securely in cloud storage to enable playback across sessions"

---

## 7. Day 1 UX (First-Time Audio)

When a user creates their first devotional series, Day 1 text is generated during onboarding (~10-15s). TTS pre-generation fires immediately after via `preGenerateAudio()`. Fish Audio generation takes 30-60 seconds.

**User experience:**
- User lands on reading screen → starts reading
- `prefetchDevotionalAudio()` fires on screen mount (existing behavior)
- If pre-generation is still in progress, it piggybacks on the in-flight request (deduplication via `inFlightRequests` Map)
- If user taps play before audio is ready → audio player shows loading state (existing behavior)
- Typical scenario: user reads for 2-3 minutes before tapping play → audio is likely already cached

**No toast or special UX needed.** The existing loading indicator on the play button handles the waiting state. Pre-generation just makes this window shorter.

---

## 8. Implementation Surface

### New Files

| File | Purpose |
|------|---------|
| `backend/src/utils/r2-storage.ts` | R2 upload, check, URL generation |
| `backend/src/utils/ai-client.ts` | Shared xAI/Grok calling utility extracted from `handleAIRequest()` |
| `backend/src/utils/fish-audio-annotation-prompt.ts` | System prompt for AI emotion tagging |

### Modified Files — Backend

| File | Changes |
|------|---------|
| `backend/src/routes/tts.ts` | Replace `injectEmotionTags()` with `annotateForTts()`. Add R2 upload after Fish Audio generation. Return `audioUrl` in response. Keep in-memory cache as hot-path. |
| `backend/src/utils/emotion-tags.ts` | Add `annotateForTts()` async function. Keep `injectEmotionTags()` as fallback. |
| `backend/package.json` | Add `@aws-sdk/client-s3` dependency |

### Modified Files — Mobile

| File | Changes |
|------|---------|
| `src/lib/tts-service.ts` | Add `buildTtsText()` and export `humanizeReference()`. Update `downloadAudio()` to use `audioUrl` from response. |
| `src/app/(tabs)/(today)/reading.tsx` | Replace inline text construction with `buildTtsText()`. Remove local `humanizeReference()`. |
| `src/lib/progressive-generation.ts` | Add `attemptEveningGeneration()` and `preGenerateAudio()`. Call `preGenerateAudio()` after successful generation in `triggerNextDayGeneration()`. |
| `src/lib/cutoff-logic.ts` | Add `isPastEveningCutoff()` function. |
| `src/lib/store.ts` | Add `lastEveningGenerationDate` field. Store migration. |
| `src/lib/background-generation.ts` | Add `preGenerateAudio()` call after successful background generation. |
| `src/app/(tabs)/(today)/index.tsx` | Add evening trigger check alongside existing morning check. Add `preGenerateAudio()` after morning generation. |
| `src/app/(tabs)/(today)/evening-wind-down.tsx` | Call `attemptEveningGeneration()` in `handleShowCelebration()` callback (line ~251) after `addCheckIn()`. |

### Environment Variables (Backend)

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=unfold-audio
R2_PUBLIC_URL=
```

---

## 9. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Grok annotation fails | Low | Fallback to regex `injectEmotionTags()`. No audio quality loss, just less nuanced. |
| R2 upload fails | Low | Keep in-memory cache as fallback. Audio still served from backend until next successful upload. |
| R2 credentials misconfigured | Low | Validate on server startup. Log clear error. Fall back to in-memory. |
| Content hash mismatch (client vs backend) | Medium | `buildTtsText()` shared utility eliminates client-side mismatch. Backend computes hash on annotated text and returns it — client never computes hash. |
| Evening generation doubles with midnight | None | `lastEveningGenerationDate` and `lastGenerationCutoffDate` both set on evening generation. All triggers check both. |
| Fish Audio rate limits during pre-generation | Low | Pre-generation uses existing rate limiting (`checkRateLimit('tts')`). If rate limited, audio generates on-demand when user taps play. |
| Large R2 storage over time | Very low | 14 TB/year at 10K DAU = $210/year. Acceptable. Optional: add lifecycle policy to expire audio older than 1 year. |

---

## 10. What This Does NOT Change

- No changes to the deferred generation architecture (midnight cutoff, background fetch, story dedup, series finale — all from the companion spec)
- No changes to the Fish Audio voice map or voice selection
- No changes to the audio player UI or playback behavior
- No changes to the reading screen layout
- No changes to premium gating (TTS remains premium-only)
- The existing `/api/tts-download/:id` one-time download flow is preserved for backward compatibility

---

## 11. TDD Strategy

Vertical slices — each slice adds one testable behavior end-to-end.

### Slice 1: Store migration v27 → v28
- Test: migration adds `lastEveningGenerationDate` field with default `''`
- Test: `setLastEveningGenerationDate()` setter works
- Implement: migration function + setter action

### Slice 2: `buildTtsText()` extraction
- Test: output matches current inline construction in `reading.tsx` (backward compatibility)
- Test: handles missing/empty fields gracefully
- Implement: extract function, update call sites

### Slice 3: `isPastEveningCutoff()` + guard
- Test: returns true at 9 PM, false at 8:59 PM
- Test: `attemptEveningGeneration()` respects `lastEveningGenerationDate` guard
- Implement: cutoff function + guard logic

### Slice 4: `ai-client.ts` shared utility
- Test: calls xAI with correct params, returns text
- Test: respects timeout, throws on timeout
- Implement: extract from `handleAIRequest()`

### Slice 5: `annotateForTts()` + fallback
- Test: annotated text contains Fish Audio brackets
- Test: falls back to `injectEmotionTags()` on Grok failure/timeout
- Test: does not double-humanize already-humanized references
- Implement: annotation function with prompt

### Slice 6: R2 storage utilities
- Test: `audioExistsInR2()` returns true/false correctly
- Test: `uploadAudioToR2()` uploads with correct key
- Test: `getR2PublicUrl()` returns expected URL format
- Implement: R2 client wrapper

### Slice 7: Updated TTS route (R2 integration)
- Test: returns R2 URL on cache hit (no Fish Audio call)
- Test: uploads to R2 on cache miss, returns R2 URL
- Test: R2 lookup uses RAW text hash (pre-annotation)
- Implement: update route flow

### Slice 8: `preGenerateAudio()` + trigger wiring
- Test: calls `prefetchDevotionalAudio()` with correct text and voice
- Test: silently fails without throwing
- Implement: function + hook into generation callbacks
