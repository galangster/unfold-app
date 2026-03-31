# Audio Player Bar Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AudioPlayerBar from a cramped toolbar into a contemplative mini-player that matches the devotional reading experience — fewer controls, stronger visual presence, blur backdrop.

**Architecture:** Replace the current 7-element single-row layout with a 2-row design: a full-width progress bar on top, then a row with title label (left), play/pause (center), and close (right). Skip and speed controls move behind a long-press or are removed from the mini bar entirely. The bar uses BlurView for depth instead of a flat semi-transparent background.

**Tech Stack:** React Native, expo-blur (BlurView), react-native-reanimated, phosphor-react-native, expo-audio, expo-haptics

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/AudioPlayerBar.tsx` | **Rewrite** | Mini player bar — 2-row layout, blur backdrop, reduced controls |
| `src/app/(tabs)/(today)/reading.tsx` | **Modify (lines 1990-1998)** | Pass `title` prop to AudioPlayerBar |

No new files needed. This is a single-component visual redesign with a minor prop addition to the consumer.

---

### Task 1: Add `title` prop and update AudioPlayerBar interface

**Files:**
- Modify: `src/components/AudioPlayerBar.tsx:25-30`
- Modify: `src/app/(tabs)/(today)/reading.tsx:1990-1998`

- [ ] **Step 1: Add `title` to AudioPlayerBarProps**

In `src/components/AudioPlayerBar.tsx`, update the interface:

```typescript
interface AudioPlayerBarProps {
  audioUri: string | null;
  onClose?: () => void;
  /** Auto-play when audioUri becomes available */
  autoPlay?: boolean;
  /** Title shown in the player bar (e.g. devotional title) */
  title?: string;
}
```

- [ ] **Step 2: Pass `title` from reading.tsx**

In `src/app/(tabs)/(today)/reading.tsx`, update the AudioPlayerBar render (around line 1991):

```tsx
<AudioPlayerBar
  audioUri={audioUri}
  title={currentDayData?.title}
  onClose={() => {
    setIsAudioPlayerVisible(false);
    setAudioUri(null);
    endReadingSession();
  }}
/>
```

- [ ] **Step 3: Thread `title` through to subcomponents**

Update the `AudioPlayerBar` wrapper function to accept and pass `title`:

```typescript
export function AudioPlayerBar({ audioUri, onClose, autoPlay = true, title }: AudioPlayerBarProps) {
  const { colors, isDark } = useTheme();
```

Pass `title` and `isDark` to both `AudioPlayerLoading` and `AudioPlayerActive` (add to their prop types and function signatures).

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to AudioPlayerBar

- [ ] **Step 5: Commit**

```bash
git add src/components/AudioPlayerBar.tsx src/app/\(tabs\)/\(today\)/reading.tsx
git commit -m "feat(audio): add title prop to AudioPlayerBar"
```

---

### Task 2: Replace flat background with BlurView + shadow

**Files:**
- Modify: `src/components/AudioPlayerBar.tsx`

This task replaces the semi-transparent `backgroundColor` with `expo-blur`'s `BlurView` for a glass effect, and adds `Shadow.lg` for depth separation from the tab bar.

- [ ] **Step 1: Add imports**

Add to the import section of `AudioPlayerBar.tsx`:

```typescript
import { BlurView } from 'expo-blur';
import { Shadow } from '@/constants/shadows';
```

`useTheme()` already returns `isDark`. Destructure it in the wrapper: `const { colors, isDark } = useTheme()` and pass `isDark` to both subcomponents. The blur `tint` must be `isDark ? 'dark' : 'light'` to work across all 7 themes.

- [ ] **Step 2: Wrap container content in BlurView**

Replace the `Animated.View` container's inline `backgroundColor` with a `BlurView` child. The structure becomes:

```tsx
<Animated.View
  entering={FadeInDown.duration(Duration.slow)}
  exiting={FadeOutDown.duration(Duration.normal)}
  style={[
    styles.container,
    Shadow.lg,
    {
      bottom: bottomOffset,
      borderColor: alpha(colors.border, 0.3),
    },
  ]}
>
  <BlurView
    intensity={80}
    tint={isDark ? 'dark' : 'light'}
    style={StyleSheet.absoluteFill}
  />
  {/* Progress bar */}
  {/* Controls row */}
</Animated.View>
```

Key changes:
- Remove `backgroundColor: alpha(colors.background, 0.95)` from inline style
- Add `Shadow.lg` to the style array
- Reduce border opacity from 0.5 to 0.3 (the blur provides enough separation)
- Add `BlurView` with `StyleSheet.absoluteFill` as the first child
- Set `tint` based on dark/light mode

Apply this pattern to BOTH `AudioPlayerLoading` and `AudioPlayerActive`.

- [ ] **Step 3: Verify build**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx expo run:ios --device "iPhone 17 Pro" 2>&1 | tail -5`
Expected: Build Succeeded

- [ ] **Step 4: Screenshot verification**

Navigate to reading screen, tap Listen, wait for audio to load, take screenshot:
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-blur.png && sips -Z 1000 /tmp/sim-blur.png
```
Expected: Player bar has glass/blur effect, clearly separated from tab bar with shadow

- [ ] **Step 5: Commit**

```bash
git add src/components/AudioPlayerBar.tsx
git commit -m "feat(audio): add blur backdrop and shadow to player bar"
```

---

### Task 3: Redesign layout — 2-row with title, centered play, simplified controls

**Files:**
- Modify: `src/components/AudioPlayerBar.tsx`

This is the main visual redesign. The layout changes from a single cramped row to:

**Row 1:** Full-width progress bar (accent color, 4px height)
**Row 2:** `[Title text]` ... `[Play/Pause 48px]` ... `[Speed pill] [Close X]`

Skip forward/back buttons are removed from the mini bar. The devotional is ~2 minutes — skip buttons are unnecessary and add clutter. Speed and close move to the right as secondary controls.

- [ ] **Step 1: Update AudioPlayerActive render**

Replace the entire return JSX in `AudioPlayerActive` with:

```tsx
return (
  <Animated.View
    entering={FadeInDown.duration(Duration.slow)}
    exiting={FadeOutDown.duration(Duration.normal)}
    style={[
      styles.container,
      Shadow.lg,
      {
        bottom: bottomOffset,
        borderColor: alpha(colors.border, 0.3),
      },
    ]}
  >
    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

    {/* Progress bar — full width, prominent */}
    <View style={[styles.progressTrack, { backgroundColor: alpha(colors.text, 0.1) }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${progress * 100}%` as any, backgroundColor: colors.accent },
        ]}
      />
    </View>

    {/* Controls row */}
    <View style={styles.controls}>
      {/* Title + time (left side) */}
      <View style={styles.titleSection}>
        <Text
          numberOfLines={1}
          style={[styles.titleText, { color: colors.text }]}
        >
          {title || 'Listening...'}
        </Text>
        <Text style={[styles.timeText, { color: colors.textMuted }]}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>
      </View>

      {/* Play/Pause — center anchor */}
      <TouchableOpacity
        onPress={handlePlayPause}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        style={[styles.playButton, { backgroundColor: colors.accent }]}
      >
        {isPlaying ? (
          <PauseIcon size={22} color={colors.background} weight="fill" />
        ) : (
          <PlayIcon size={22} color={colors.background} weight="fill" />
        )}
      </TouchableOpacity>

      {/* Secondary controls (right side) */}
      <View style={styles.secondaryControls}>
        <TouchableOpacity
          onPress={handleSpeedCycle}
          accessibilityLabel={`Playback speed ${speed}x`}
          style={[styles.speedPill, { backgroundColor: alpha(colors.text, 0.08) }]}
        >
          <Text style={[styles.speedText, { color: colors.textMuted }]}>{speed}x</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleClose}
          accessibilityLabel="Close audio player"
          style={styles.closeButton}
        >
          <XIcon size={18} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      </View>
    </View>
  </Animated.View>
);
```

- [ ] **Step 2: Update styles**

Replace the `styles` StyleSheet with:

```typescript
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing['3'],
    right: Spacing['3'],
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 4,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    gap: Spacing['3'],
  },
  titleSection: {
    flex: 1,
    gap: Spacing['0.5'],
  },
  titleText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  timeText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
  },
  speedPill: {
    paddingHorizontal: Spacing['2.5'],
    paddingVertical: Spacing['1.5'],
    borderRadius: Radius.sm,
  },
  speedText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
  closeButton: {
    padding: Spacing['2'],
  },
});
```

Key changes from the old styles:
- `borderRadius`: `Radius.card` (14) → `Radius.lg` (16) for more generous rounding
- `borderWidth`: 1 → `StyleSheet.hairlineWidth` — subtler border with blur doing the work
- `progressTrack.height`: 3 → 4 — more visible progress
- `controls.paddingVertical`: `Spacing['3.5']` (14) → `Spacing['4']` (16) — more breathing room
- `playButton`: 44×44 → 48×48 with 22px icon — larger primary action
- Added `titleSection`, `titleText`, `secondaryControls`, `closeButton` styles
- Removed `skipButton` style (skip buttons removed from mini bar)

- [ ] **Step 3: Remove unused skip imports and handlers**

Remove `SkipBackIcon` and `SkipForwardIcon` from the phosphor imports. The `handleSkip` callback and `SKIP_SECONDS` constant can stay (they'll be used later if an expanded player is added) but won't cause issues if left in.

Update the import line:
```typescript
import { PlayIcon, PauseIcon, XIcon } from 'phosphor-react-native';
```

- [ ] **Step 4: Update AudioPlayerLoading to match**

Update the loading state to match the new visual design:

```tsx
function AudioPlayerLoading({ onClose, colors, bottomOffset, title }: {
  onClose?: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  bottomOffset: number;
  title?: string;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.slow)}
      exiting={FadeOutDown.duration(Duration.normal)}
      style={[
        styles.container,
        Shadow.lg,
        {
          bottom: bottomOffset,
          borderColor: alpha(colors.border, 0.3),
        },
      ]}
    >
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.controls}>
        <View style={styles.titleSection}>
          <Text numberOfLines={1} style={[styles.titleText, { color: colors.text }]}>
            {title || 'Loading audio...'}
          </Text>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>
            Preparing...
          </Text>
        </View>
        <ActivityIndicator size="small" color={colors.accent} />
        <TouchableOpacity onPress={() => onClose?.()} accessibilityLabel="Close audio player" style={styles.closeButton}>
          <XIcon size={18} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/AudioPlayerBar.tsx
git commit -m "feat(audio): redesign player bar — title, centered play, blur, simplified controls"
```

---

### Task 4: Build, test, and screenshot verification

**Files:**
- No code changes — verification only

- [ ] **Step 1: Build the app**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile && npx expo run:ios --device "iPhone 17 Pro" 2>&1 | tail -5
```
Expected: `Build Succeeded`

- [ ] **Step 2: Navigate to reading screen and trigger audio**

1. Wait 8 seconds for app to load
2. Tap the devotional card to enter reading screen
3. Tap "Listen to devotional" button in the header
4. Wait 10 seconds for audio to download and player to appear

```bash
sleep 8
axe tap --udid 38CDF1B0-50AB-49C3-A079-5FAB16918FA2 --label "Continue Psalm Path from Loss to Presence, day 1 of 3"
sleep 3
axe tap --udid 38CDF1B0-50AB-49C3-A079-5FAB16918FA2 --label "Listen to devotional"
sleep 10
```

- [ ] **Step 3: Take screenshot and verify visually**

```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-player-redesign.png && sips -Z 1000 /tmp/sim-player-redesign.png
```

Verify:
- [ ] Player bar floats above tab bar with clear gap
- [ ] Blur/glass effect is visible (text behind bar is blurred)
- [ ] Shadow separates player from content
- [ ] Title text shows on the left (e.g. "When Honest Is All You Have")
- [ ] Time display shows below title
- [ ] Play/pause button is centered, 48px, accent-colored
- [ ] Speed pill and close button are on the right
- [ ] No skip forward/back buttons visible
- [ ] Progress bar is 4px, accent-colored, tracking position
- [ ] All touch targets meet 44pt minimum

- [ ] **Step 4: Save screenshot to Desktop**

```bash
cp /tmp/sim-player-redesign.png ~/Desktop/unfold-audio-player-redesign.png
```

- [ ] **Step 5: Commit (if any hotfixes were needed)**

```bash
git add -A
git commit -m "fix(audio): hotfix player bar layout after visual verification"
```
