# Audio Player Behavior — Design Spec

## Goal

Replace the current destructive-close audio player with a three-tier, gesture-driven player that supports background audio, cross-tab persistence, and a half-sheet expanded view for long-form devotionals.

## Context

The current AudioPlayerBar has a single state: visible or not. Tapping the X button destroys the audio URI and ends the session — no way to restore without re-triggering TTS. There are no swipe gestures, no background audio, and no way to listen while navigating away from the reading screen. With devotionals potentially reaching 30 minutes, this model breaks down.

## Design

### Three-Tier Player

The player has three visual tiers connected by swipe gestures. No buttons for tier navigation — only swipes.

#### Tier 1: Pill (minimal indicator)

- Small floating pill above the tab bar, visible on all tabs
- Shows: pulsing accent dot + truncated title + play/pause icon
- Appears when user swipes down from the mini bar (audio continues playing)
- **Tap** → expands to mini bar (Tier 2)
- **Swipe left/right** → fully stops playback and dismisses

#### Tier 2: Mini Bar (current player, minus X button)

- Floating bar above tab bar with blur backdrop (the current redesigned AudioPlayerBar)
- Shows: progress bar + title/time + play/pause button + speed pill
- **No X button** — dismiss and stop are gesture-driven
- **Swipe up** → expands to half-sheet (Tier 3)
- **Swipe down** → collapses to pill (Tier 1), audio continues
- **Visible on any tab** — appears on reading screen when audio starts; on other tabs, tapping the pill expands to mini bar in-place (mini bar is not reading-screen-only)

#### Tier 3: Half-Sheet (expanded controls)

- Bottom sheet at ~48% screen height, reading content visible above
- Shows: drag handle, title + series name, draggable scrubber with time labels, skip -10s/+10s buttons, play/pause button (larger), speed picker
- **Swipe down** → collapses back to mini bar (Tier 2)
- **Drag scrubber** → seek to position

### Gesture Map

```
STOP ← swipe away ← [PILL] → tap → [MINI BAR] ↕ swipe ↕ [HALF-SHEET]
```

All tiers: tap play/pause toggles playback. Lock screen & Control Center always available.

### Background Audio

- Audio plays through tab switches, app backgrounding, and lock screen
- Requires `UIBackgroundModes: ["audio"]` in app.json
- Configure audio session on app start:
  ```typescript
  import { setAudioModeAsync } from 'expo-audio';
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
  ```
- Lock screen / Control Center integration via expo-audio's lock screen API:
  - `player.setActiveForLockScreen(true, { title, artist, artworkUrl }, { showSeekForward: true, showSeekBackward: true })` — register as Now Playing source with skip buttons
  - `player.updateLockScreenMetadata({ title, artist, artworkUrl })` — update metadata (field mapping: `title` = devotional day title, `artist` = series title, `artworkUrl` = Unfold app icon URL)
  - `player.clearLockScreenControls()` — unregister on stopAudio
- Lock screen / Control Center shows: play/pause, skip -10s/+10s, scrubber, Now Playing metadata (title, series name, Unfold artwork)

### Audio Lifecycle

| Event | Behavior |
|-------|----------|
| User taps "Listen" | Mini bar appears, audio starts (or resumes from cached position) |
| Swipe mini bar down | Mini bar → pill, audio continues |
| Tap pill | Pill → mini bar |
| Swipe pill left/right | Audio stops, pill dismissed, state cleared |
| Switch tabs | Mini bar → pill (auto-collapse), audio continues |
| Background app | Audio continues, lock screen controls active |
| Foreground app | Pill visible, tap to restore mini bar |
| Audio finishes (pill visible) | Pill shows "Completed" briefly (3s), then auto-dismisses |
| Audio finishes (mini bar visible) | Mini bar collapses to pill → pill shows "Completed" (3s) → auto-dismisses |
| Audio finishes (half-sheet open) | Half-sheet collapses to mini bar → mini bar collapses to pill → pill shows "Completed" (3s) → auto-dismisses |
| Navigate to different devotional | Current audio stops, new devotional's audio is available |

### State Management

Audio state moves from local `reading.tsx` useState to a **global Zustand store slice**.

```typescript
type PlayerTier = 'hidden' | 'pill' | 'minibar' | 'halfsheet';

// Named to avoid collision with expo-audio's AudioMetadata type
interface DevotionalAudioMetadata {
  title: string;
  seriesTitle: string;
  devotionalId: string;
  dayNumber: number;
}

interface AudioPlayerState {
  // Playback state
  audioUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;    // true while audio source is loading/buffering initially
  isBuffering: boolean;  // true during mid-playback rebuffering
  currentTime: number;
  duration: number;
  playbackSpeed: number;

  // Metadata
  title: string | null;
  seriesTitle: string | null;
  devotionalId: string | null;
  dayNumber: number | null;

  // UI state
  playerTier: PlayerTier;

  // Actions
  startAudio: (uri: string, metadata: DevotionalAudioMetadata) => void;
  stopAudio: () => void;
  setTier: (tier: PlayerTier) => void;
  seekTo: (time: number) => void;
  setSpeed: (speed: number) => void;
  togglePlayPause: () => void;
}
```

**Persistence:** `currentTime` is persisted to Zustand (with persist middleware) only on pause, stop, background, or every 5 seconds during playback — not on every tick. This avoids excessive writes to AsyncStorage.

### Component Architecture

| Component | Location | Responsibility |
|-----------|----------|---------------|
| `AudioPlayerPill` | Root layout (above tab bar) | Tier 1 — minimal indicator, visible on all tabs |
| `AudioPlayerBar` | Root layout (above tab bar) | Tier 2 — mini player with progress, play/pause, speed |
| `AudioPlayerSheet` | Root layout (sheet) | Tier 3 — half-sheet with scrubber, skip, speed picker |
| `useGlobalAudioPlayer` | Hook | Wraps expo-audio `createAudioPlayer` (imperative, not `useAudioPlayer` hook) + Zustand state sync. Uses `player.replace(source)` to swap audio sources. Subscribes to `player.addListener('playbackStatusUpdate', ...)` for state sync (not polling). Detects completion via `status.didJustFinish`. Calls `player.remove()` on full stop to free native resources. |
| `audioPlayerSlice` | Zustand store | Global playback state |

All three visual components mount in the **root layout** (`_layout.tsx`), not inside individual tab screens. They read from the global Zustand store and render based on `playerTier`.

### Now Playing (Lock Screen)

Uses `expo-audio`'s lock screen API (`setActiveForLockScreen`, `updateLockScreenMetadata`):
- **Title**: Devotional day title (e.g., "When Honest Is All You Have")
- **Artist**: Series title (e.g., "Psalm Path from Loss to Presence")
- **Artwork**: Unfold app icon or devotional theme artwork
- **Controls**: Play/pause, skip backward 10s, skip forward 10s

### Animations

All transitions use the existing design system tokens:
- Pill ↔ Mini bar: `FadeInDown` / `FadeOutDown` with `Duration.normal` (250ms)
- Mini bar ↔ Half-sheet: Spring-driven bottom sheet animation (`Spring.snappy`, no bounce)
- Pill dismiss (swipe away): `FadeOut` with `Duration.fast` (150ms)
- Pill pulsing dot: Continuous opacity animation (0.4 → 1.0, 2s cycle)

### Edge Cases

- **Multiple audio sources**: Only one audio can play at a time. Starting a new devotional's audio stops the current one.
- **Expired TTS cache**: If the cached audio file is gone when restoring, show the loading state and re-generate.
- **App killed and restarted**: Playback position is persisted in Zustand (with persist middleware). On relaunch, pill appears with cached position. Tap to resume.
- **Phone call interrupts**: Audio pauses (iOS handles this), resumes after call ends.
- **Study method sheet**: No longer kills audio. Audio continues behind the sheet.
- **Bluetooth disconnect**: If Bluetooth headphones disconnect mid-playback, audio pauses (iOS default behavior). User taps play to resume on speaker.
- **Audio route change (headphones → speaker)**: iOS pauses on disconnect. No custom handling needed — expo-audio respects system audio route changes.
- **AirPlay / CarPlay**: Audio routes to AirPlay/CarPlay if selected by user. Lock screen metadata and controls work the same.
- **Accessibility (VoiceOver)**: Pill has accessibility action for "Stop" (equivalent to swipe-away). Mini bar has accessibility action for "Expand" (equivalent to swipe-up). All play/pause and speed controls have proper accessibility labels.

## Out of Scope

- **TTS provider migration** (Smallest.ai → ElevenLabs): Separate spec. The player behavior is independent of the TTS backend. ElevenLabs migration would eliminate chunking and enable long-form devotionals, but the player design works regardless of provider.
- **Karaoke/highlighted text sync**: Future feature, not part of this spec.
- **Offline audio downloads**: Future feature — pre-download devotional audio for offline use.

## Tech Stack

- expo-audio (existing)
- react-native-reanimated (existing, for gestures and animations)
- react-native-gesture-handler (existing, for swipe detection)
- Zustand (existing, for global state)
- expo-blur (existing, for mini bar backdrop)

## Success Criteria

1. Audio continues playing when mini bar is dismissed (swipe down to pill)
2. Audio plays across all tabs with pill visible
3. Audio plays in background with lock screen controls
4. Half-sheet provides scrubber and skip controls for long devotionals
5. Swipe pill left/right fully stops playback
6. No X buttons — all navigation is gesture-driven
7. Playback position survives app restart
