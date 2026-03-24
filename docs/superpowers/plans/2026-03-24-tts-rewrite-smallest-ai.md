# TTS System Rewrite: Smallest.ai + Floating Bar Player — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace broken Cartesia TTS system with Smallest.ai backend + lean client service + floating bar audio player.

**Architecture:** Three-layer swap: backend proxy (Cartesia → Smallest.ai), client TTS service (517-line cartesia.ts → ~120-line tts-service.ts with binary download + cache), and audio player (1,150-line bottom sheet → ~250-line floating bar). Public API signatures preserved for drop-in replacement.

**Tech Stack:** React Native (Expo SDK 55), expo-audio, expo-file-system, Express backend on Railway, Smallest.ai Lightning v3.1 API

**Spec:** `docs/superpowers/specs/2026-03-24-tts-rewrite-smallest-ai-design.md`

---

## File Map

- **Task 1:** Modify `backend/src/routes/tts.ts` — Swap Cartesia API → Smallest.ai
- **Task 2:** Create `src/lib/tts-service.ts` — New TTS download/cache service
- **Task 3:** Create `src/components/AudioPlayerBar.tsx` — New floating bar player
- **Task 4:** Modify `src/app/(tabs)/(today)/reading.tsx` — Wire new player + service
- **Task 5:** Modify `src/app/(tabs)/(today)/evening-wind-down.tsx`, `src/app/(tabs)/(you)/settings.tsx`, `src/lib/store.ts`, `src/lib/rate-limit.ts` — Update all remaining consumers
- **Task 6:** Delete `src/lib/cartesia.ts`, `src/components/AudioPlayerBottomSheet.tsx`, `src/components/KaraokeView.tsx`
- **Task 7:** Full verification — TypeScript, build, visual check

---

### Task 1: Backend — Swap Cartesia to Smallest.ai

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/routes/tts.ts`

**What:** Replace Cartesia API call with Smallest.ai Lightning endpoint. Remove base64 path. Update voice whitelist. Increase text limit and timeout.

- [ ] **Step 1: Update constants and voice whitelist**

In `/Users/galangster/clawd/work/unfold/backend/src/routes/tts.ts`, replace lines 10-23:

```typescript
const SMALLEST_AI_API_KEY = process.env.SMALLEST_AI_API_KEY || "";
const SMALLEST_AI_URL = "https://waves-api.smallest.ai/api/v1/lightning/get_speech";
const DEFAULT_VOICE = "emily"; // Warm, conversational female
const MAX_TEXT_LENGTH = 5000;

// Whitelist of valid Smallest.ai voice IDs
// Must match mobile TTS_VOICES in src/lib/tts-service.ts
const ALLOWED_VOICES = new Set([
  "emily",   // Warm, conversational (free)
  "george",  // Authoritative male
  "jasper",  // Younger male
  "ariana",  // Expressive female
  "james",   // Deep, pastoral male
]);
```

Note: These voice IDs are placeholders. Verify against actual Smallest.ai voice catalog at https://waves-docs.smallest.ai and update before deploying.

- [ ] **Step 2: Update the API key check**

Replace line 28 (`if (!CARTESIA_API_KEY)`) with:

```typescript
  if (!SMALLEST_AI_API_KEY) {
```

- [ ] **Step 3: Remove format/base64 handling and rewrite the API call**

Replace the entire try block (lines 56-93) with:

```typescript
  try {
    const apiRes = await fetch(SMALLEST_AI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SMALLEST_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_id: resolvedVoice,
        sample_rate: 24000,
        speed: 1.0,
        add_wav_header: true,
        language: "en",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text().catch(() => "");
      console.error(`[tts] Smallest.ai error ${apiRes.status}: ${errBody.slice(0, 200)}`);
      res.status(502).json({ error: "TTS service temporarily unavailable" });
      return;
    }

    const audioBuffer = Buffer.from(await apiRes.arrayBuffer());

    if (audioBuffer.byteLength === 0) {
      console.error("[tts] Smallest.ai returned empty response body");
      res.status(502).json({ error: "TTS service returned empty audio" });
      return;
    }

    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", audioBuffer.byteLength.toString());
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(audioBuffer);
```

- [ ] **Step 4: Remove unused `wantBase64` variable**

Delete line 54 (`const wantBase64 = format === "base64";`). The `format` destructure from `req.body` can also be removed — only `text` and `voiceId` are needed now.

- [ ] **Step 5: Update error log prefix**

In the catch block (line 94-95), change `Cartesia` references to `Smallest.ai`:

```typescript
    console.error(`[tts] Smallest.ai error: ${msg}`);
```

- [ ] **Step 6: Update the module JSDoc comment**

Replace lines 1-7 with:

```typescript
/**
 * Smallest.ai TTS Proxy — keeps API key server-side.
 * POST /api/tts  { text: string, voiceId?: string }
 *
 * Protected by auth + rate limiting from the main middleware stack.
 * Validates voice IDs against whitelist before proxying to Smallest.ai.
 */
```

- [ ] **Step 7: Add SMALLEST_AI_API_KEY to Railway environment**

Run (or do manually in Railway dashboard):
```bash
# In the backend directory
railway variables set SMALLEST_AI_API_KEY=<your-key-here>
```

Note: Get your API key from https://waves-docs.smallest.ai. The old `CARTESIA_API_KEY` can remain for now (unused) and be cleaned up later.

- [ ] **Step 8: Verify backend compiles**

Run: `cd /Users/galangster/clawd/work/unfold/backend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
cd /Users/galangster/clawd/work/unfold/backend
git add src/routes/tts.ts
git commit -m "feat: swap TTS backend from Cartesia to Smallest.ai Lightning"
```

---

### Task 2: Client — Create tts-service.ts

**Files:**
- Create: `src/lib/tts-service.ts`

**What:** New TTS download/cache service. Drop-in replacement for cartesia.ts with identical public API signatures. Single binary download (no chunking), filesystem cache, in-flight dedup.

- [ ] **Step 1: Create the complete tts-service.ts file**

Create `src/lib/tts-service.ts`:

```typescript
/**
 * TTS Service — Smallest.ai via Railway backend proxy.
 * Binary download, filesystem cache, in-flight dedup.
 * Drop-in replacement for cartesia.ts — same public API signatures.
 */

import { File, Paths, Directory } from 'expo-file-system';
import { logger } from '@/lib/logger';
import { reportError } from '@/lib/report-error';
import { getAuthHeaders, RAILWAY_BACKEND_URL } from '@/lib/api-config';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';

const TTS_PROXY_URL = `${RAILWAY_BACKEND_URL}/api/tts`;

// ─── Voice catalog ────────────────────────────────────────────
// NOTE: Voice IDs are placeholders — audition and update before shipping.

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  premium: boolean;
}

export const TTS_VOICES: VoiceOption[] = [
  { id: 'emily', name: 'Emily', description: 'Warm, contemplative — perfect for devotionals', premium: false },
  { id: 'george', name: 'George', description: 'Calm, authoritative male voice', premium: true },
  { id: 'jasper', name: 'Jasper', description: 'Warm, pastoral presence', premium: true },
  { id: 'ariana', name: 'Ariana', description: 'Gentle, nurturing voice', premium: true },
  { id: 'james', name: 'James', description: 'Deep, pastoral male voice', premium: true },
];

const DEFAULT_VOICE_ID = 'emily';

export function getDefaultVoice(isPremium: boolean = false): string {
  return DEFAULT_VOICE_ID;
}

export function getAvailableVoices(isPremium: boolean = false): VoiceOption[] {
  if (isPremium) return TTS_VOICES;
  return TTS_VOICES.filter(v => !v.premium);
}

// ─── Cache ────────────────────────────────────────────────────

/** Deterministic cache key from text + voiceId (djb2 + sdbm dual hash). */
function hashKey(text: string, voiceId: string): string {
  const input = `v5:${voiceId}:${text}`;
  let h1 = 5381;
  let h2 = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = (c + (h2 << 6) + (h2 << 16) - h2) | 0;
  }
  return Math.abs(h1).toString(36) + Math.abs(h2).toString(36);
}

function getCacheFile(key: string): File {
  return new File(Paths.cache, `tts_${key}.wav`);
}

function isCached(key: string): boolean {
  const file = getCacheFile(key);
  return file.exists && file.size > 0;
}

/** Clear entire TTS cache directory. */
export async function clearAudioCache(): Promise<void> {
  try {
    const cacheDir = new Directory(Paths.cache);
    if (cacheDir.exists) {
      // Directory.list() returns (Directory | File)[] — filter for File instances
      const entries = cacheDir.list();
      for (const entry of entries) {
        if (entry instanceof File && entry.uri.includes('tts_') && (entry.uri.endsWith('.wav') || entry.uri.endsWith('.mp3'))) {
          try { entry.delete(); } catch { /* skip locked files */ }
        }
      }
    }
  } catch (e) {
    logger.warn('[TTS] Failed to clear cache:', e);
  }
}

// ─── Download ─────────────────────────────────────────────────

const inFlightRequests = new Map<string, Promise<{ audioUrl: string }>>();

async function downloadAudio(text: string, voiceId: string, key: string): Promise<{ audioUrl: string }> {
  const cachedFile = getCacheFile(key);
  logger.log(`[TTS] downloadAudio START — textLen=${text.length}, voiceId=${voiceId}`);

  try {
    const headers = await getAuthHeaders();
    const fetchStart = Date.now();

    const response = await fetch(TTS_PROXY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voiceId }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`TTS proxy error: ${response.status} ${errBody.slice(0, 200)}`);
    }

    // Read binary response and write to cache using modern File API
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    cachedFile.write(bytes);

    logger.log(`[TTS] ✅ cached — ${bytes.length} bytes, ${Date.now() - fetchStart}ms`);
    return { audioUrl: cachedFile.uri };
  } catch (error) {
    logger.log(`[TTS] ❌ downloadAudio ERROR:`, error);
    throw error;
  } finally {
    inFlightRequests.delete(key);
  }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Download and cache TTS audio for a devotional.
 * Returns { audioUrl } pointing to the cached file.
 * Deduplicates in-flight requests (prefetch + play won't double-download).
 */
export async function streamDevotionalAudio(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
): Promise<{ audioUrl: string }> {
  try {
    const key = hashKey(text, voiceId);
    logger.log(`[TTS] streamDevotionalAudio — key=${key}, textLen=${text.length}`);

    // Return cached audio if available
    if (isCached(key)) {
      logger.log('[TTS] cache HIT');
      return { audioUrl: getCacheFile(key).uri };
    }
    logger.log('[TTS] cache MISS — downloading');

    // Rate limit check
    try {
      const rateCheck = await checkRateLimit('tts');
      if (!rateCheck.allowed) {
        throw new Error('TTS rate limit reached. Please try again later.');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('rate limit')) throw e;
      logger.warn('[TTS] Rate limit check failed, proceeding:', e);
    }

    // Deduplicate in-flight requests
    const existing = inFlightRequests.get(key);
    if (existing) {
      logger.log('[TTS] in-flight request found — piggybacking');
      try {
        return await existing;
      } catch {
        inFlightRequests.delete(key);
      }
    }

    const promise = downloadAudio(text, voiceId, key).then(async (result) => {
      await incrementRateLimit('tts');
      return result;
    });
    inFlightRequests.set(key, promise);
    return promise;
  } catch (error) {
    reportError('tts-audio', error, { voiceId });
    throw error;
  }
}

/**
 * Prefetch audio in background. Call when reading screen mounts.
 * By the time user taps play, audio is likely cached.
 */
export function prefetchDevotionalAudio(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
): void {
  const key = hashKey(text, voiceId);

  // Skip if cached or already downloading
  if (isCached(key)) return;
  if (inFlightRequests.has(key)) return;

  const promise = downloadAudio(text, voiceId, key);
  inFlightRequests.set(key, promise);
  promise.catch(() => { /* Silently fail — user hasn't tapped play yet */ });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "tts-service" | head -5`
Expected: No output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/tts-service.ts
git commit -m "feat: create tts-service.ts — lean Smallest.ai TTS client with cache"
```

---

### Task 3: Client — Create AudioPlayerBar.tsx

**Files:**
- Create: `src/components/AudioPlayerBar.tsx`

**What:** Floating bar audio player. Glass-effect bar at bottom of screen. Play/pause, skip ±10s, progress bar, speed cycle, time display. ~250 lines.

- [ ] **Step 1: Create the complete AudioPlayerBar.tsx file**

Create `src/components/AudioPlayerBar.tsx`:

```typescript
/**
 * AudioPlayerBar — Floating bar audio player.
 * Glass-effect bar at bottom of reading screen.
 * Controls: skip -10s, play/pause, skip +10s, time, speed cycle.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, XIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { alpha } from '@/components/ui';
import { logger } from '@/lib/logger';

const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75] as const;
const SKIP_SECONDS = 10;

interface AudioPlayerBarProps {
  audioUri: string | null;
  onClose?: () => void;
  /** Auto-play when audioUri becomes available */
  autoPlay?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayerBar({ audioUri, onClose, autoPlay = true }: AudioPlayerBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const player = useAudioPlayer(audioUri);

  // Configure audio mode for silent switch
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Auto-play when player is ready
  useEffect(() => {
    if (!player || !audioUri) return;

    if (autoPlay && !hasStarted) {
      // Small delay to let player initialize
      const timeout = setTimeout(() => {
        try {
          player.play();
          setIsPlaying(true);
          setHasStarted(true);
        } catch (e) {
          logger.error('[AudioPlayerBar] Auto-play failed:', e);
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [player, audioUri, autoPlay, hasStarted]);

  // Poll time at 1s interval (not 50ms)
  useEffect(() => {
    if (!player) return;

    timerRef.current = setInterval(() => {
      try {
        setCurrentTime(player.currentTime ?? 0);
        setDuration(player.duration ?? 0);

        // Detect playback completion
        if (player.duration > 0 && player.currentTime >= player.duration - 0.5) {
          setIsPlaying(false);
        }
      } catch { /* player may be released */ }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [player]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { player?.pause(); } catch { /* ignore */ }
    };
  }, [player]);

  const handlePlayPause = useCallback(() => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
        setHasStarted(true);
      }
    } catch (e) {
      logger.error('[AudioPlayerBar] Play/pause error:', e);
    }
  }, [player, isPlaying]);

  const handleSkip = useCallback(async (seconds: number) => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const newTime = Math.max(0, Math.min((player.currentTime ?? 0) + seconds, player.duration ?? 0));
      await player.seekTo(newTime);
      setCurrentTime(newTime);
    } catch (e) {
      logger.error('[AudioPlayerBar] Skip error:', e);
    }
  }, [player]);

  const handleSpeedCycle = useCallback(() => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    setSpeedIndex(nextIndex);
    try {
      player.setPlaybackRate(SPEED_OPTIONS[nextIndex]);
    } catch (e) {
      logger.error('[AudioPlayerBar] Speed change error:', e);
    }
  }, [player, speedIndex]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { player?.pause(); } catch { /* ignore */ }
    onClose?.();
  }, [player, onClose]);

  // Loading state: bar is visible but audio hasn't downloaded yet
  if (!audioUri) {
    return (
      <Animated.View
        entering={FadeInDown.duration(Duration.slow)}
        exiting={FadeOutDown.duration(Duration.normal)}
        style={[
          styles.container,
          {
            bottom: insets.bottom + Spacing['2'],
            backgroundColor: alpha(colors.background, 0.95),
            borderColor: alpha(colors.border, 0.5),
          },
        ]}
      >
        <View style={styles.controls}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.timeText, { color: colors.textMuted, marginLeft: Spacing['2'] }]}>
            Loading audio...
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => onClose?.()} accessibilityLabel="Close audio player" style={styles.skipButton}>
            <XIcon size={16} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  const progress = duration > 0 ? currentTime / duration : 0;
  const speed = SPEED_OPTIONS[speedIndex];

  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.slow)}
      exiting={FadeOutDown.duration(Duration.normal)}
      style={[
        styles.container,
        {
          bottom: insets.bottom + Spacing['2'],
          backgroundColor: alpha(colors.background, 0.95),
          borderColor: alpha(colors.border, 0.5),
        },
      ]}
    >
      {/* Progress bar along top edge */}
      <View style={[styles.progressTrack, { backgroundColor: alpha(colors.text, 0.08) }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress * 100}%` as any, backgroundColor: colors.accent },
          ]}
        />
      </View>

      {/* Controls row */}
      <View style={styles.controls}>
        {/* Skip back */}
        <TouchableOpacity
          onPress={() => handleSkip(-SKIP_SECONDS)}
          accessibilityLabel="Skip back 10 seconds"
          style={styles.skipButton}
        >
          <SkipBackIcon size={18} color={colors.textMuted} weight="light" />
        </TouchableOpacity>

        {/* Play/Pause */}
        <TouchableOpacity
          onPress={handlePlayPause}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={[styles.playButton, { backgroundColor: colors.accent }]}
        >
          {isPlaying ? (
            <PauseIcon size={18} color={colors.background} weight="fill" />
          ) : (
            <PlayIcon size={18} color={colors.background} weight="fill" />
          )}
        </TouchableOpacity>

        {/* Skip forward */}
        <TouchableOpacity
          onPress={() => handleSkip(SKIP_SECONDS)}
          accessibilityLabel="Skip forward 10 seconds"
          style={styles.skipButton}
        >
          <SkipForwardIcon size={18} color={colors.textMuted} weight="light" />
        </TouchableOpacity>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Time display */}
        <Text style={[styles.timeText, { color: colors.textMuted }]}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>

        {/* Speed pill */}
        <TouchableOpacity
          onPress={handleSpeedCycle}
          accessibilityLabel={`Playback speed ${speed}x`}
          style={[styles.speedPill, { backgroundColor: alpha(colors.text, 0.06) }]}
        >
          <Text style={[styles.speedText, { color: colors.textMuted }]}>{speed}x</Text>
        </TouchableOpacity>

        {/* Close button */}
        <TouchableOpacity
          onPress={handleClose}
          accessibilityLabel="Close audio player"
          style={styles.skipButton}
        >
          <XIcon size={16} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing['3'],
    right: Spacing['3'],
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    gap: Spacing['2.5'],
  },
  skipButton: {
    padding: Spacing['1'],
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  speedPill: {
    paddingHorizontal: Spacing['2'],
    paddingVertical: Spacing['1'],
    borderRadius: Radius.sm,
  },
  speedText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
});

export default AudioPlayerBar;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "AudioPlayerBar" | head -5`
Expected: No output (zero errors)

Note: There may be import issues with `expo-audio` vs `expo-av`. The current codebase uses `expo-audio` (line 247 of old AudioPlayerBottomSheet). If `useAudioPlayer` isn't found in `expo-audio`, check if it's from `expo-av` and adjust the import. The key thing is to use the same audio module the existing codebase uses.

- [ ] **Step 3: Commit**

```bash
git add src/components/AudioPlayerBar.tsx
git commit -m "feat: create AudioPlayerBar — floating bar audio player"
```

---

### Task 4: Client — Update reading.tsx

**Files:**
- Modify: `src/app/(tabs)/(today)/reading.tsx`

**What:** Swap old AudioPlayerBottomSheet + cartesia imports to new AudioPlayerBar + tts-service. Remove BottomSheet ref/type imports. Simplify play handler.

- [ ] **Step 1: Update imports**

In `src/app/(tabs)/(today)/reading.tsx`:

At line 49, change:
```typescript
import { AudioPlayer } from '@/components/AudioPlayerBottomSheet';
```
to:
```typescript
import { AudioPlayerBar } from '@/components/AudioPlayerBar';
```

At line 52, change:
```typescript
import { getDefaultVoice, prefetchDevotionalAudio } from '@/lib/cartesia';
```
to:
```typescript
import { getDefaultVoice, prefetchDevotionalAudio, streamDevotionalAudio } from '@/lib/tts-service';
```

If there is a `BottomSheet` import from `@gorhom/bottom-sheet` used only for the audio player ref type, remove it. Search for `audioPlayerRef` and its type — if it references `BottomSheet`, remove both the import and the ref declaration.

- [ ] **Step 2: Add audioUri state, remove sheet refs**

Find the `audioPlayerRef` declaration (should be a `useRef<BottomSheet>(null)`) and replace it with:

```typescript
const [audioUri, setAudioUri] = useState<string | null>(null);
```

Remove `audioExpandTimerRef` if it exists (it was used for the 50ms delay before expanding the sheet).

- [ ] **Step 3: Simplify play button handler**

Find the play button press handler (around line 1371-1405). The current handler checks premium, sets playing state, and auto-expands the sheet after 50ms. Replace with:

```typescript
const handlePlayAudio = useCallback(async () => {
  if (!isPremium) {
    setPremiumFeature('audio');
    setShowPremiumSheet(true);
    return;
  }
  if (!currentDayData) return;

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  setIsAudioPlayerVisible(true);

  // Track audio usage for premium nudge + widget bridge
  useUnfoldStore.getState().setHasUsedAudio();
  startReadingSession({
    devotionalTitle: currentDevotional?.title ?? 'Unfold',
    dayTitle: currentDayData?.title ?? 'Reading',
    dayNumber: viewingDay,
    totalDays: totalDays,
    totalMinutes: user?.readingDuration ?? 5,
    isListening: true,
  });

  // If we already have the URI (from prefetch), just show the bar
  if (audioUri) return;

  try {
    const voiceId = user?.preferredVoice || getDefaultVoice();
    const fullText = `${currentDayData.scriptureReference}.\n${currentDayData.scriptureText}\n\n${currentDayData.bodyText}`;
    const result = await streamDevotionalAudio(fullText, voiceId);
    setAudioUri(result.audioUrl);
  } catch (e) {
    logger.error('[Reading] Failed to load audio:', e);
  }
}, [isPremium, currentDayData, currentDevotional, audioUri, user?.preferredVoice, viewingDay, totalDays, user?.readingDuration]);
```

Update the play button's `onPress` to call `handlePlayAudio`.

- [ ] **Step 4: Update audio prefetch to set URI on cache hit**

Update the prefetch useEffect (lines 360-366) to also check if audio is already cached and set the URI:

```typescript
useEffect(() => {
  if (!isPremium || !currentDayData) return;
  const voiceId = user?.preferredVoice || getDefaultVoice();
  const fullText = `${currentDayData.scriptureReference}.\n${currentDayData.scriptureText}\n\n${currentDayData.bodyText}`;
  prefetchDevotionalAudio(fullText, voiceId);
}, [isPremium, currentDayData, user?.preferredVoice]);
```

This stays the same — the prefetch fires in background, and when the user taps play, `streamDevotionalAudio` returns the cached result instantly.

- [ ] **Step 5: Replace AudioPlayerBottomSheet render with AudioPlayerBar**

Find the AudioPlayer render (around lines 1977-1993). Replace with:

```typescript
{isPremium && isAudioPlayerVisible && (
  <AudioPlayerBar
    audioUri={audioUri}
    onClose={() => {
      setIsAudioPlayerVisible(false);
      setAudioUri(null);
      endReadingSession();
    }}
  />
)}
```

Remove any `BottomSheet`-related props (snapPoints, ref, etc.).

- [ ] **Step 6: Clean up — remove unused imports and refs**

Search for any remaining references to:
- `AudioPlayerBottomSheet` or `AudioPlayer` (old import)
- `audioPlayerRef` (old sheet ref)
- `audioExpandTimerRef` (old expand timer)
- `BottomSheet` from `@gorhom/bottom-sheet` (if only used for audio)

Remove all of them. Add `useState` to the React import if not already there.

- [ ] **Step 7: Reset audio state on day change**

Find the useEffect that cleans up audio when switching days (around line 431-437). Update it to also clear audioUri:

```typescript
// In the day-change cleanup effect:
setAudioUri(null);
setIsAudioPlayerVisible(false);
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "reading" | head -10`
Expected: No output (zero errors)

- [ ] **Step 9: Commit**

```bash
git add src/app/\(tabs\)/\(today\)/reading.tsx
git commit -m "feat: wire AudioPlayerBar + tts-service into reading screen"
```

---

### Task 5: Update remaining consumers

**Files:**
- Modify: `src/app/(tabs)/(today)/evening-wind-down.tsx`
- Modify: `src/app/(tabs)/(you)/settings.tsx`
- Modify: `src/lib/store.ts`
- Modify: `src/lib/rate-limit.ts`

- [ ] **Step 1: Update evening-wind-down.tsx import**

In `src/app/(tabs)/(today)/evening-wind-down.tsx`, at line 28, change:

```typescript
import { streamDevotionalAudio } from '@/lib/cartesia';
```
to:
```typescript
import { streamDevotionalAudio } from '@/lib/tts-service';
```

The usage at line 233-234 (`result.audioUrl`) stays the same — the new service returns the same `{ audioUrl }` shape.

- [ ] **Step 2: Update settings.tsx voice picker**

In `src/app/(tabs)/(you)/settings.tsx`, at line 29, change:

```typescript
import { CARTESIA_VOICES } from '@/lib/cartesia';
```
to:
```typescript
import { TTS_VOICES } from '@/lib/tts-service';
```

Then find-and-replace all occurrences of `CARTESIA_VOICES` with `TTS_VOICES` in this file. There should be ~3 occurrences:
- Line ~1373: `{CARTESIA_VOICES.find(...)` → `{TTS_VOICES.find(...)`
- Line ~1389: `{CARTESIA_VOICES.map(...)` → `{TTS_VOICES.map(...)`
- Any other reference

Also update the default voice fallback (line ~1390):
```typescript
// Old:
const isSelected = (user?.preferredVoice ?? '694f9389-aac1-45b6-b726-9d9369183238') === option.id;
// New:
const isSelected = (user?.preferredVoice ?? 'emily') === option.id;
```

Also update the `VOICE_SAMPLES` object (around lines 35-43). This maps voice IDs to bundled sample audio files. Update the keys from Cartesia UUIDs to Smallest.ai voice IDs:

```typescript
const VOICE_SAMPLES: Record<string, any> = {
  'emily': require('@/assets/audio/voice-samples/katie.mp3'),     // reuse existing samples for now
  'ariana': require('@/assets/audio/voice-samples/elena.mp3'),
  'james': require('@/assets/audio/voice-samples/marcus.mp3'),
  'george': require('@/assets/audio/voice-samples/david.mp3'),
  'jasper': require('@/assets/audio/voice-samples/grace.mp3'),
};
```

Note: These reuse the existing Cartesia voice samples temporarily. New samples from Smallest.ai voices should be generated later — but the keys must match NOW or voice preview will break.

- [ ] **Step 3: Add store migration for voice IDs**

In `src/lib/store.ts`:

1. Bump the store version from `24` to `25` (line 1598).

2. Add a new migration block after the last migration. Find the pattern of existing migrations and add:

```typescript
        // Migration from version 24 to 25: Map Cartesia voice UUIDs to Smallest.ai voice IDs
        if (version < 25) {
          try {
            const voiceMap: Record<string, string> = {
              '694f9389-aac1-45b6-b726-9d9369183238': 'emily',   // Katie → Emily
              '03496517-369a-4db1-8236-3d3ae459ddf7': 'ariana',  // Elena → Ariana
              '1463a4e1-56a1-4b41-b257-728d56e93605': 'james',   // Marcus → James
              '3246e36c-ac8c-418d-83cd-4eaad5a3b887': 'george',  // David → George
              '15a9cd88-84b0-4a8b-95f2-5d583b54c72e': 'jasper',  // Grace → Jasper
            };
            if (state.user && typeof state.user === 'object') {
              const oldVoice = state.user.preferredVoice;
              if (oldVoice && voiceMap[oldVoice]) {
                state.user.preferredVoice = voiceMap[oldVoice];
              } else if (!oldVoice || !['emily', 'george', 'jasper', 'ariana', 'james'].includes(oldVoice)) {
                state.user.preferredVoice = 'emily';
              }
              // Flag for cache cleanup — picked up by tts-service on first use
              state._needsTtsCacheCleanup = true;
            }
          } catch (err) {
            console.error('[store] Migration v24→25 failed:', err);
          }
        }
```

3. In `src/lib/tts-service.ts`, at the top of `streamDevotionalAudio()`, add a one-time cleanup check:

```typescript
// One-time cleanup of old Cartesia cache after store migration
const store = require('@/lib/store').useUnfoldStore;
if (store?.getState()?._needsTtsCacheCleanup) {
  store.getState().updateUser({ _needsTtsCacheCleanup: false } as any);
  clearAudioCache().catch(() => {});
}
```

This avoids dynamic `import()` inside the migration function and defers cache cleanup to the first actual TTS usage — safe and reliable.

- [ ] **Step 4: Update rate limit config**

In `src/lib/rate-limit.ts`, at line 51-52, change:

```typescript
  'tts': { maxRequests: 30, windowMs: 60 * 60 * 1000 },
```
to:
```typescript
  'tts': { maxRequests: 10, windowMs: 60 * 60 * 1000 },
```

(Single request per devotional instead of chunked = fewer requests needed.)

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -10`
Expected: No output (zero errors in src/)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(tabs\)/\(today\)/evening-wind-down.tsx src/app/\(tabs\)/\(you\)/settings.tsx src/lib/store.ts src/lib/rate-limit.ts
git commit -m "feat: update all consumers to use tts-service + migrate voice IDs"
```

---

### Task 6: Delete old files

**Files:**
- Delete: `src/lib/cartesia.ts`
- Delete: `src/components/AudioPlayerBottomSheet.tsx`
- Delete: `src/components/KaraokeView.tsx`

- [ ] **Step 1: Verify no remaining imports of old files**

Run:
```bash
grep -rn "from '@/lib/cartesia'" src/ | head -10
grep -rn "from '@/components/AudioPlayerBottomSheet'" src/ | head -10
grep -rn "from '@/components/KaraokeView'" src/ | head -10
```
Expected: No output for all three. If any results appear, update those files first before deleting.

- [ ] **Step 2: Delete the old files**

```bash
rm src/lib/cartesia.ts
rm src/components/AudioPlayerBottomSheet.tsx
rm src/components/KaraokeView.tsx
```

- [ ] **Step 3: Verify TypeScript still compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -10`
Expected: No output (zero errors)

- [ ] **Step 4: Commit**

```bash
git add -u src/lib/cartesia.ts src/components/AudioPlayerBottomSheet.tsx src/components/KaraokeView.tsx
git commit -m "chore: delete cartesia.ts, AudioPlayerBottomSheet, KaraokeView — replaced by tts-service + AudioPlayerBar"
```

---

### Task 7: Full verification

**Files:** None modified. Verification only.

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -10`
Expected: No output (zero errors in src/)

- [ ] **Step 2: Verify no remaining Cartesia references**

Run:
```bash
grep -rn "cartesia\|CARTESIA\|Cartesia" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```
Expected: No output (all Cartesia references removed from source)

- [ ] **Step 3: Verify new service is importable from all consumers**

Run:
```bash
grep -rn "from '@/lib/tts-service'" src/ | head -10
```
Expected: At least 3 matches (reading.tsx, evening-wind-down.tsx, settings.tsx)

- [ ] **Step 4: Start Metro and verify bundle compiles**

Run: `npx expo start --clear --port 8081`
Expected: Metro starts without errors, bundle compiles

- [ ] **Step 5: Build the app**

Run: `npx expo run:ios --device "iPhone 17 Pro"`
Expected: App builds and launches in simulator

- [ ] **Step 6: Visual verification — take simulator screenshot**

Run: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png`
Expected: App renders correctly, reading screen accessible

- [ ] **Step 7: Test audio playback (requires Smallest.ai API key)**

Navigate to a devotional reading screen in the simulator. Tap the speaker/play icon. Verify:
1. Floating bar appears at bottom with fade-in animation
2. Audio plays (or shows error if API key not yet configured)
3. Play/pause, skip ±10s, speed cycle all respond to taps
4. Time display updates as audio plays
5. No app freeze

Note: If Smallest.ai API key isn't configured yet on Railway, the download will fail with a 502 error — that's expected. The UI should still appear and handle the error gracefully.
