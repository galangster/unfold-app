# Fish Audio S2 Pro TTS Migration — Design Spec

**Date:** 2026-03-24
**Goal:** Replace Smallest.ai Lightning with Fish Audio S2 Pro for Unfold's TTS, adding structural emotion tags and expanding from 2 to 3-4 voices.
**Architecture:** Direct swap of the backend proxy route (same two-step pattern), structural emotion tag injection before API call, MP3 output instead of WAV. Mobile changes limited to cache keys and voice IDs.
**Tech Stack:** Fish Audio S2 Pro API, Express (backend), expo-audio (mobile), Zustand (state)

---

## 1. Backend TTS Route Rewrite

**File:** `unfold-backend/src/routes/tts.ts`

### Current Flow (Smallest.ai)
1. Receive `{text, voiceId}` from client
2. Chunk text at sentence boundaries (240-char limit per Smallest.ai's ~250-char max)
3. Call `waves-api.smallest.ai` sequentially per chunk
4. Concatenate WAV buffers (strip headers, merge PCM data)
5. Cache concatenated WAV in memory map with UUID key, 5-min TTL
6. Return `{downloadId}`
7. GET `/api/tts/:id` serves cached WAV binary, deletes after serving

### New Flow (Fish Audio)
1. Receive `{text, voiceId}` from client (same contract)
2. Inject structural emotion tags based on content patterns (new step)
3. Single POST to `https://api.fish.audio/v1/tts` with full text
4. Collect chunked MP3 response into buffer
5. Cache MP3 in memory map with UUID key, 5-min TTL (same pattern)
6. Return `{downloadId}` (same contract)
7. GET `/api/tts/:id` serves cached MP3 binary with `Content-Type: audio/mpeg`, deletes after serving

### API Call Shape

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout for full-text generation

const response = await fetch('https://api.fish.audio/v1/tts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
    'Content-Type': 'application/json',
    'model': 's2-pro',
  },
  body: JSON.stringify({
    text: taggedText,
    reference_id: VOICE_MAP[voiceId],
    format: 'mp3',
    mp3_bitrate: 128,
    sample_rate: 44100,
    chunk_length: 200,
    latency: 'normal',
    normalize: true,
  }),
  signal: controller.signal,
});
clearTimeout(timeout);
```

**Timeout:** 60 seconds (vs 30s for Smallest.ai). Single-request full-text generation may take longer than chunked 240-char requests. If timeout fires, return 504 to client.

### What Gets Deleted
- Sentence-boundary chunking logic (~40 lines)
- WAV header stripping and buffer concatenation (~30 lines)
- Smallest.ai-specific auth and URL constants

### What Gets Added
- Emotion tag injection helper function call
- Fish Audio API call (single request)
- Voice map constant (`voiceId` string → Fish Audio `reference_id`)

**Net change:** ~80 lines modified, ~50 lines deleted.

---

## 2. Structural Emotion Tag Injection

**Location:** New helper function in `tts.ts` (or extracted to `utils/emotion-tags.ts` if the file gets large).

### Purpose
Add Fish Audio emotion tags to devotional text based on content structure. Zero AI cost — purely regex/string-matching on patterns that already exist in generated devotional text.

### Tag Mapping

| Content Pattern | Detection Method | Tag |
|---|---|---|
| Scripture quotes | Lines starting with `>` or `"..."` with book:chapter ref | `(calm)` |
| Reflection/exposition | Paragraphs between scripture and application | `(compassionate)` |
| Application/challenge | Sentences with "you"/"your", imperative verbs | `(hopeful)` |
| Prayer closing | Lines after "Prayer:" or "Let us pray" header | `(whispering)` |
| Opening line | First sentence of devotional | `(warm)` |
| Encouragement | Exclamation marks, "Praise", "Thank God" | `(grateful)` |

### Rules
- Tags go at the **start of sentences** (Fish Audio requirement)
- Maximum one tag per sentence (no stacking)
- If no pattern matches a sentence, no tag is inserted (plain text works fine)
- Emotion tags don't count toward billing (confirmed in Fish Audio docs)
- Uses S1 `(parenthesis)` syntax which is compatible with S2 Pro

### Priority Order (when multiple patterns match)
1. Prayer closing (highest — most specific structural marker)
2. Scripture quotes (explicit formatting markers like `>`)
3. Encouragement (exclamation + keyword combo)
4. Application/challenge (pronoun-based, broader match)
5. Opening line (positional — first sentence only, lowest specific match)
6. Reflection/exposition (lowest — catch-all for devotional content)

Note: Opening line is below encouragement/application so that a single-line "Praise the Lord!" gets `(grateful)` rather than `(warm)`. In practice, multi-line devotionals always have a plain opening sentence that correctly gets `(warm)`.

### Example Transform

```
Input:
  "The Lord is my shepherd, I shall not want."
  "What does it mean to truly trust God with your provision?"
  "Prayer: Lord, help me surrender my worries to you."

Output:
  "(calm) The Lord is my shepherd, I shall not want."
  "(hopeful) What does it mean to truly trust God with your provision?"
  "(whispering) Prayer: Lord, help me surrender my worries to you."
```

---

## 3. Voice Selection

### Voice Lineup (3-4 voices)

| Slot | Character | Source |
|---|---|---|
| Default male | Warm, steady, pastoral | Fish Audio voice library or custom clone |
| Default female | Gentle, reflective | Fish Audio voice library or custom clone |
| Elder/mentor | Deep, authoritative, wise | Fish Audio voice library or custom clone |
| Optional 4th | Young, conversational | Fish Audio voice library (if good fit found) |

### Voice Selection Process
- User auditions voices during implementation via Fish Audio playground
- Selected voices yield `reference_id` values
- IDs are stored in a `VOICE_MAP` constant in the backend

### Backend Voice Map

```typescript
const VOICE_MAP: Record<string, string> = {
  'caleb': 'fish-audio-reference-id-1',    // Warm male
  'grace': 'fish-audio-reference-id-2',    // Gentle female
  'eli':   'fish-audio-reference-id-3',    // Wise mentor
  // Optional 4th voice
};
```

Names are placeholders — user picks final names and voices during implementation.

---

## 4. Mobile Changes

### `src/lib/tts-service.ts`
- Cache filename extension: `.wav` → `.mp3`
- Cache version prefix: `v7:{voiceId}:{text}` → `v8:{voiceId}:{text}` (invalidates stale WAV cache)
- Voice ID constants: `arman`/`jasmine` → Fish Audio voice names (matching backend `VOICE_MAP` keys)
- Add legacy voice ID mapping: `resolveVoiceId()` should map `'arman'` → new default male, `'jasmine'` → new default female, so users with stored preferences get a graceful migration (no store version bump needed — just a fallback map)
- No changes to request/response contract

### `src/app/(tabs)/(you)/settings.tsx`
- Expand voice picker from 2 to 3-4 voices
- Replace bundled sample MP3s at `assets/audio/voice-samples/{voiceId}.mp3` with Fish Audio generated samples
- Update `VOICE_SAMPLES` record with new voice IDs, display names, and descriptions

### `src/app/(tabs)/(today)/evening-wind-down.tsx`
- Also calls `streamDevotionalAudio` — the `resolveVoiceId` fallback handles old voice IDs gracefully, no explicit changes needed. Listed here for implementer awareness.

### Files That Don't Change
- `useGlobalAudioPlayer.ts` — expo-audio plays MP3 natively
- `audio-player-state.ts` — Zustand store unchanged
- `AudioPlayerOverlay.tsx`, `AudioPlayerBar.tsx`, `AudioPlayerSheet.tsx`, `AudioPlayerPill.tsx` — UI unchanged
- `reading.tsx` — same API contract

---

## 5. Environment & Configuration

### Railway Environment Variables
- Add: `FISH_AUDIO_API_KEY`
- Add (optional): `FISH_AUDIO_MODEL` (default: `s2-pro`)
- Remove: `SMALLEST_AI_API_KEY`

### `.env.example`
- Update variable names to reflect Fish Audio

---

## 6. Cost Model

Fish Audio S2 Pro pricing: $15 per 1M UTF-8 bytes.

Assumptions: average devotional = 2,500 chars, 80% of DAU listen daily.

| DAU | Monthly Bytes | Fish Audio | Smallest.ai (current) |
|---|---|---|---|
| 50 | 3M | ~$45 | ~$73 |
| 100 | 6M | ~$90 | ~$97 |
| 500 | 30M | ~$450 | ~$289 |
| 1,000 | 60M | ~$900 | ~$529 |

Math: DAU * 2,500 bytes * 0.8 * 30 days. English text is ~1 byte/char in UTF-8. Emotion tags add negligible overhead (~70 bytes/devotional).

Fish Audio is cost-neutral up to ~100 DAU. Quality and reliability gains justify the cost at current scale.

### Scale Mitigation (future, not built now)
- Aggressive response caching (same text = same audio)
- Self-host Fish Speech (open-source, Apache-2.0 for S1-mini)
- Enterprise pricing negotiation

---

## 7. Migration Effort

| Area | Files | Time |
|---|---|---|
| Backend route rewrite | 1 (`tts.ts`) | ~2 hours |
| Mobile cache + voice IDs | 2 (`tts-service.ts`, `settings.tsx`) | ~1 hour |
| Voice audition | Fish Audio playground | 1-2 hours |
| End-to-end testing | Full flow | 1-2 hours |
| **Total** | | **~half a day** |

---

## 8. What This Does NOT Include

- Streaming audio (unnecessary at current scale, YAGNI)
- Fish Audio SDK integration (direct fetch is simpler)
- Premium/free tier voice routing (all users get Fish Audio)
- Self-hosting setup (future optimization)
- AI-generated emotion tags (structural tagging is sufficient)
