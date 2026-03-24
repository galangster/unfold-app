# TTS System Rewrite: Smallest.ai + Floating Bar Player

## Problem

The current TTS system is broken — the app freezes on play and requires force quit. The freeze is immediate on tap regardless of content length, pointing to the audio player initialization (50ms `updateInterval`, 100ms polling loop, `setAudioModeAsync` blocking) rather than the download pipeline. Additionally:

1. Cartesia costs ~$0.040/1K chars — expensive at scale
2. The audio player is a 1,150-line bottom sheet with karaoke mode, gesture scrubber, and complex state management — over-engineered for the current needs
3. The `cartesia.ts` service (517 lines) manually decodes base64 on the main thread, concatenates chunks with ID3 header stripping, and includes disabled SSML injection

## Solution

Three-layer rewrite:

1. **Backend**: Swap Cartesia proxy to Smallest.ai (Lightning v3.1). Raw binary audio — no base64 encoding/decoding.
2. **Client TTS Service**: Replace `cartesia.ts` with a lean `tts-service.ts` (~120 lines). Single request per devotional (no chunking), binary download, filesystem cache.
3. **Audio Player**: Replace 1,150-line bottom sheet with a ~250-line floating bar component. Glass-effect bar at bottom of reading screen with play/pause, skip ±10s, progress, speed picker.

## Architecture

### Backend Proxy (Smallest.ai)

**Current** (`/api/tts`): Accepts `{ text, voiceId, format }`, proxies to Cartesia `/tts/bytes` with Sonic-3 model, returns base64 JSON or binary MP3. Max 2,000 chars. 5 whitelisted voices.

**New** (`/api/tts`): Same endpoint contract, proxies to Smallest.ai `https://waves-api.smallest.ai/api/v1/lightning/get_speech` instead. Returns raw binary MP3. No base64 encoding needed.

```
Client → POST /api/tts { text, voiceId }
Backend → POST waves-api.smallest.ai/api/v1/lightning/get_speech
  Headers: Authorization: Bearer $SMALLEST_AI_API_KEY
  Body: { text, voice_id, sample_rate: 24000, add_wav_header: false, language: "en" }
Backend ← raw audio bytes (MP3)
Client ← raw audio bytes (streamed)
```

**Key changes:**
- Replace `CARTESIA_API_KEY` env var with `SMALLEST_AI_API_KEY`
- Remove base64 encoding path — always return binary
- Increase max text length from 2,000 to 5,000 chars (Smallest.ai supports longer input)
- Update voice whitelist to Smallest.ai voice IDs
- Keep 24-hour cache headers
- Increase `AbortSignal.timeout` from 30s to 60s (longer text = longer generation)
- Model: `lightning` (v3.1 — latest, best quality/speed)
- **Output format:** Smallest.ai with `add_wav_header: false` returns raw PCM. To get MP3, use `speed: 1.0` parameter and set `Content-Type: audio/mpeg` in the request, or post-process. Verify exact format param during implementation — if Smallest.ai doesn't support direct MP3, pipe through ffmpeg on backend or accept WAV on client (expo-audio handles both).

**Voice mapping:**

| Current (Cartesia) | New (Smallest.ai) | Notes |
|---|---|---|
| Katie (default free) | `emily` | Warm, conversational female |
| Thomas | `george` | Authoritative male |
| Liam | `jasper` | Younger male |
| Sophia | `ariana` | Expressive female |
| Marcus | `james` | Deep, pastoral male |

Note: Exact Smallest.ai voice IDs need to be auditioned and confirmed. The names above are placeholders based on available voice catalog. We'll audition voices before finalizing.

**Cost comparison:**
- Cartesia: ~$0.040/1K chars
- Smallest.ai: ~$0.005/1K chars (8x cheaper)
- 5-min devotional (~1,200 words / ~6,000 chars): Cartesia $0.24, Smallest.ai $0.03

### Client TTS Service

**Current** (`src/lib/cartesia.ts`, 517 lines):
- `splitTextIntoChunks()` at 1,500 chars → multiple API calls
- `Promise.all` parallel chunk download
- `base64ToUint8Array()` manual decode on main thread
- ID3 header stripping for concatenation
- SSML injection (disabled)
- In-flight dedup via `downloadInProgress` Map
- Filesystem cache with `expo-file-system`

**New** (`src/lib/tts-service.ts`, ~120 lines):
- Single API call per devotional (no chunking — Smallest.ai handles longer text)
- Binary download via `FileSystem.downloadAsync()` — no base64 decode
- Filesystem cache keyed by text hash + voice ID
- In-flight dedup preserved
- No SSML (Smallest.ai has pronunciation dictionaries if needed later)
- Prefetch on mount preserved

```typescript
// Public API — preserves current function signatures for drop-in replacement
export const TTS_VOICES: VoiceOption[] = [ ... ]; // replaces CARTESIA_VOICES
export function getDefaultVoice(isPremium?: boolean): string { ... } // returns voice ID string
export function getAvailableVoices(isPremium?: boolean): VoiceOption[] { ... } // returns voice list
export async function streamDevotionalAudio(text: string, voiceId: string): Promise<{ audioUrl: string }> { ... }
export async function prefetchDevotionalAudio(text: string, voiceId: string): Promise<void> { ... }
export async function clearAudioCache(): Promise<void> { ... }
```

**API signature compatibility:** The public API preserves the current signatures exactly:
- `getDefaultVoice(isPremium?)` returns a voice ID `string` (not an object)
- `getAvailableVoices(isPremium?)` returns the full voice list (same name as current)
- `streamDevotionalAudio()` returns `Promise<{ audioUrl: string }>` (same shape as current `TTSResult` — `wordTimestamps` and `duration` fields dropped since they were only used by karaoke)
- `TTS_VOICES` replaces `CARTESIA_VOICES` — same shape, new IDs
- `getAuthHeaders` from `@/lib/api-config` is used for authenticated backend requests
- `reportError` from `@/lib/report-error` is preserved for production observability

**Cache strategy:**
- Key: `sha256(text + voiceId).mp3`
- Location: `${FileSystem.cacheDirectory}tts/`
- Check existence before downloading
- `clearAudioCache()` deletes the entire `tts/` directory
- On first launch after migration, old Cartesia cache files are harmless (different hash keys) but waste space — `clearAudioCache()` in the store migration handles cleanup

### Audio Player: Floating Bar

**Current** (`src/components/AudioPlayerBottomSheet.tsx`, 1,151 lines):
- Bottom sheet with drag handle, 48% snap point
- `useAudioPlayer(null, { updateInterval: 50 })` — 50ms update polling
- 100ms `setInterval` status polling loop
- Karaoke "Listen Along" overlay
- Gesture-based scrubber (react-native-gesture-handler)
- Speed picker sheet
- Loading bar animation
- Complex autoplay ref flag pattern

**New** (`src/components/AudioPlayerBar.tsx`, ~250 lines):
- Fixed-position bar at bottom of reading screen (above safe area)
- Glass effect: `rgba(background, 0.95)` + blur
- No bottom sheet, no drag handle, no karaoke
- Event-driven status updates (no polling)
- Simple controls: skip -10s, play/pause, skip +10s, time, speed cycle

**Layout:**
```
┌──────────────────────────────────────────────┐
│ ▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃ (progress bar)   │
│                                              │
│  -10  ▶️  +10          2:14 / 6:30    [1x]  │
│                                              │
└──────────────────────────────────────────────┘
```

**Progress bar:** Thin (2px) accent-colored bar along the top edge of the floating bar. No scrubber/dragging — tap to seek is sufficient for devotional audio.

**Speed picker:** Tapping the speed pill cycles through: 1x → 1.25x → 1.5x → 2x → 0.75x → 1x. No modal or sheet.

**Player lifecycle:**
1. User taps speaker icon in reading header → TTS service begins download
2. Once audio file is ready → bar fades in from bottom
3. Playback starts automatically
4. User can pause/resume, skip, change speed
5. When audio completes → bar stays visible (allows replay)
6. Navigating away from reading screen → audio stops, bar hides

**expo-audio usage (simplified):**
```typescript
const player = useAudioPlayer(audioSource); // no updateInterval
// Use player.addListener('playingChange', ...) for status
// Use player.currentTime / player.duration for progress
// Poll at 1000ms (1 second) for time display updates — not 50ms
```

**Silent mode support:** Call `Audio.setAudioModeAsync({ playsInSilentMode: true })` once when the player mounts. This currently lives in `AudioPlayerBottomSheet.tsx` line 295 and must be preserved in the new component or in `reading.tsx`.

**Integration with reading.tsx:**
- Replace `AudioPlayerBottomSheet` import with `AudioPlayerBar`
- Remove `BottomSheet` import from `@gorhom/bottom-sheet` (no longer needed for audio player type)
- Remove `audioPlayerRef` (no sheet to expand/collapse)
- Remove `audioExpandTimerRef` (no delayed expand)
- Keep `isAudioPlayerVisible` state
- Keep `prefetchDevotionalAudio` call on mount
- Simplify play button handler: set visible, pass audio URI

## Data Flow

```
reading.tsx mount
  └→ prefetchDevotionalAudio(text, voiceId)
       └→ tts-service.ts: check cache → if miss, download from /api/tts
            └→ backend tts.ts: proxy to Smallest.ai → return binary MP3
       └→ return file URI

User taps play button
  └→ reading.tsx: setAudioPlayerVisible(true)
  └→ AudioPlayerBar receives audioUri prop
       └→ useAudioPlayer(audioUri)
       └→ player.play()
       └→ 1s interval updates time display
       └→ Controls: play/pause, skip ±10s, speed cycle
```

## File Changes

### Backend
- **Modify:** `src/routes/tts.ts` — Swap Cartesia API call to Smallest.ai, remove base64 path, update voice whitelist, increase text limit
- **Modify:** `.env` — Replace `CARTESIA_API_KEY` with `SMALLEST_AI_API_KEY`

### Mobile — New Files
- **Create:** `src/lib/tts-service.ts` — Lean TTS download/cache service (~120 lines)
- **Create:** `src/components/AudioPlayerBar.tsx` — Floating bar player (~250 lines)

### Mobile — Modify
- **Modify:** `src/app/(tabs)/(today)/reading.tsx` — Swap `AudioPlayerBottomSheet` → `AudioPlayerBar`, swap `cartesia` → `tts-service` imports, remove `BottomSheet` import from `@gorhom/bottom-sheet`, remove `audioPlayerRef` and `audioExpandTimerRef`, simplify play handler. Add `Audio.setAudioModeAsync({ playsInSilentMode: true })` call (currently lives in deleted AudioPlayerBottomSheet).
- **Modify:** `src/app/(tabs)/(today)/evening-wind-down.tsx` — Swap `import { streamDevotionalAudio } from '@/lib/cartesia'` to `'@/lib/tts-service'`. Update `result.audioUrl` access to match new return shape.
- **Modify:** `src/lib/store.ts` — Add store migration (v7 → v8) to map old Cartesia voice UUIDs to new Smallest.ai voice IDs in `user.preferredVoice`. Default voice changes from Cartesia Katie UUID to Smallest.ai equivalent.
- **Modify:** `src/app/(tabs)/(you)/settings.tsx` — Swap `CARTESIA_VOICES` import to `TTS_VOICES` from `tts-service`, update `VOICE_SAMPLES` keys to Smallest.ai voice IDs, update voice preview to use new service.
- **Modify:** `src/lib/rate-limit.ts` — Adjust TTS rate limit (currently 30 requests/hour for chunked requests; with single-request-per-devotional, this can be lowered to 10/hour).

### Mobile — Delete
- **Delete:** `src/lib/cartesia.ts` — Replaced by `tts-service.ts`
- **Delete:** `src/components/AudioPlayerBottomSheet.tsx` — Replaced by `AudioPlayerBar.tsx`
- **Delete:** `src/components/KaraokeView.tsx` — Only imported by `AudioPlayerBottomSheet.tsx` (confirmed single consumer). No longer needed.

## Constraints

- No SSML — Smallest.ai doesn't support it. Pronunciation dictionaries available if needed later.
- Voice quality must be auditioned before finalizing voice IDs — the mapping above is estimated.
- Keep the same premium gating logic (audio is a premium feature).
- The reading.tsx prefetch pattern stays identical — just the import source changes.
- Backend keeps same rate limiting and cache headers.
- No streaming playback in v1 — download full file, then play. Streaming can be added later via Smallest.ai SSE endpoint.

## Out of Scope

- Karaoke/listen-along mode (dropped per user request)
- Streaming playback (download-then-play is sufficient for devotional length)
- SSML or pronunciation dictionaries
- New voice audition UI (use existing settings voice picker)
- Offline download manager
- Background audio playback (Control Center integration)
