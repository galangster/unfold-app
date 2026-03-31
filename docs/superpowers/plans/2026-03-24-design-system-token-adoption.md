# Design System Token Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate hardcoded style values across 40+ files to use the existing design system tokens (alpha, Radius, Duration, Spring), bringing token adoption from 2-12% to 80%+.

**Architecture:** Pure mechanical replacements — no behavior changes. Each task targets one token type and batch-replaces all hardcoded values across the codebase. TypeScript compilation is the verification gate (no rendering changes expected). Tasks are ordered from lowest-risk to highest-risk.

**Tech Stack:** React Native, TypeScript, Reanimated (animations), Expo

**Key constraint:** This is a cosmetic refactoring. Values must map exactly — e.g., `borderRadius: 12` → `Radius.md` (which equals 12). No visual changes should result.

---

## Hex Opacity → alpha() Conversion Reference

The codebase uses `colors.accent + '1A'` (hex suffix) to create transparent colors. The `alpha()` utility at `src/components/ui/utils/alpha.ts` is the replacement. Mapping:

| Hex Suffix | Decimal | Opacity | alpha() call |
|------------|---------|---------|-------------|
| `'08'` | 8/255 | 0.03 | `alpha(color, 0.03)` |
| `'0A'` | 10/255 | 0.04 | `alpha(color, 0.04)` |
| `'0D'` | 13/255 | 0.05 | `alpha(color, 0.05)` |
| `'10'` | 16/255 | 0.06 | `alpha(color, 0.06)` |
| `'12'` | 18/255 | 0.07 | `alpha(color, 0.07)` |
| `'14'` | 20/255 | 0.08 | `alpha(color, 0.08)` |
| `'15'` | 21/255 | 0.08 | `alpha(color, 0.08)` |
| `'18'` | 24/255 | 0.09 | `alpha(color, 0.09)` |
| `'1A'` | 26/255 | 0.10 | `alpha(color, 0.10)` |
| `'25'` | 37/255 | 0.15 | `alpha(color, 0.15)` |
| `'30'` | 48/255 | 0.19 | `alpha(color, 0.19)` |
| `'33'` | 51/255 | 0.20 | `alpha(color, 0.20)` |
| `'40'` | 64/255 | 0.25 | `alpha(color, 0.25)` |

## Radius Token Mapping

| Hardcoded | Token | Value |
|-----------|-------|-------|
| `borderRadius: 0` | `Radius.none` | 0 |
| `borderRadius: 8` | `Radius.sm` | 8 |
| `borderRadius: 12` | `Radius.md` | 12 |
| `borderRadius: 14` | `Radius.card` | 14 |
| `borderRadius: 16` | `Radius.lg` | 16 |
| `borderRadius: 20` | `Radius.xl` | 20 |
| `borderRadius: 24` | `Radius['2xl']` | 24 |
| `borderRadius: 999` or `9999` | `Radius.full` | 999 |

**Exception:** Values like `borderRadius: 2`, `2.5`, `3`, `5`, `6`, `10` are sub-token sizes (pill corners, tiny indicators). Leave these hardcoded — they represent purpose-specific radii that don't belong in the token system.

## Duration Token Mapping

Only replace **exact** matches. Non-matching values stay hardcoded to preserve existing timing behavior.

| Hardcoded | Token | Value |
|-----------|-------|-------|
| `duration: 100` | `Duration.instant` | 100 |
| `duration: 150` | `Duration.fast` | 150 |
| `duration: 250` | `Duration.normal` | 250 |
| `duration: 340` | `Duration.slow` | 340 |

**Leave hardcoded (no exact token match):** `duration: 200`, `300`, `350`, `400` — these are intentional values that don't map to any token. Changing them would alter animation timing, violating the "no visual changes" constraint.

**Also leave hardcoded:** Durations > 400ms (e.g., `500`, `1000`, `2000`) are intentional long animations (celebration sequences, generation progress).

---

## File Map

No new files are created. Modifications only:

**Task 1 — alpha() re-export:**
- Modify: `src/components/ui/index.ts` (add alpha export)

**Task 2 — alpha() adoption (28 files):**
- Modify: `src/app/(tabs)/(today)/index.tsx`
- Modify: `src/app/(tabs)/(today)/reading.tsx`
- Modify: `src/app/(tabs)/(today)/journal.tsx`
- Modify: `src/app/(tabs)/(today)/journal-detail.tsx`
- Modify: `src/app/(tabs)/(journal)/index.tsx`
- Modify: `src/app/(tabs)/(journal)/note-detail.tsx`
- Modify: `src/app/(tabs)/(ask)/index.tsx`
- Modify: `src/app/(tabs)/(you)/index.tsx`
- Modify: `src/app/(tabs)/(you)/component-catalog.tsx`
- Modify: `src/app/(onboarding)/sign-in.tsx`
- Modify: `src/app/onboarding.tsx`
- Modify: `src/components/companion/RichMessageText.tsx`
- Modify: `src/components/companion/CompanionMessageContent.tsx`
- Modify: `src/components/companion/CompanionInput.tsx`
- Modify: `src/components/companion/CompanionEmptyState.tsx`
- Modify: `src/components/companion/UserMessageBubble.tsx`
- Modify: `src/components/companion/TypingIndicator.tsx`
- Modify: `src/components/companion/SuggestionChips.tsx`
- Modify: `src/components/ScriptureTapSheet.tsx`
- Modify: `src/components/StreakBox.tsx`
- Modify: `src/components/ProfileAvatar.tsx`
- Modify: `src/components/reading/InlineReflectionJournal.tsx`
- Modify: `src/components/notebook/ScriptureSearchSheet.tsx`
- Modify: `src/components/notebook/CreateFolderSheet.tsx`
- Modify: `src/components/notebook/FolderChips.tsx`
- Modify: `src/components/notebook/ScriptureRefPill.tsx`
- Modify: `src/components/notebook/MoveFolderSheet.tsx`
- Modify: `src/components/home/RememberThisCard.tsx`

**Task 3 — Radius adoption (top 15 files by count):**
- Modify: `src/app/onboarding.tsx`
- Modify: `src/app/how-it-works.tsx`
- Modify: `src/app/(tabs)/(journal)/index.tsx`
- Modify: `src/app/generating.tsx`
- Modify: `src/app/unfolded.tsx`
- Modify: `src/app/(tabs)/(you)/streak-settings.tsx`
- Modify: `src/app/(tabs)/(you)/my-content.tsx`
- Modify: `src/app/paywall.tsx`
- Modify: `src/app/(tabs)/(today)/reading.tsx`
- Modify: `src/app/(tabs)/(today)/index.tsx`
- Modify: `src/app/(tabs)/(today)/journal.tsx`
- Modify: `src/components/ScriptureTapSheet.tsx`
- Modify: `src/components/DeleteAccountSheet.tsx`
- Modify: `src/components/VoiceInputBar.tsx`
- Modify: `src/components/PremiumNudgeCard.tsx`

**Task 4 — Duration/Spring adoption (all animation files):**
Files with `withTiming` or `withSpring` patterns. Includes files from Tasks 2-3 PLUS these additional animation-heavy files:
- Modify: `src/app/(tabs)/_layout.tsx`
- Modify: `src/app/(tabs)/(bible)/reader.tsx`
- Modify: `src/app/(tabs)/(today)/evening-wind-down.tsx`
- Modify: `src/app/(tabs)/(today)/highlights.tsx`
- Modify: `src/app/(tabs)/(you)/past-devotionals.tsx`
- Modify: `src/app/generating.tsx`
- Modify: `src/app/how-it-works.tsx`
- Modify: `src/app/welcome-celebration.tsx`
- Modify: `src/app/index.tsx`
- Modify: `src/app/unfolded.tsx`
- Modify: `src/components/CompletionCelebration.tsx`
- Modify: `src/components/reading/DevotionalContent.tsx`
- Modify: `src/components/reading/StudyMethodSheet.tsx`
- Modify: `src/components/ui/Sheet.tsx`
- Modify: `src/components/bible/ReadingSettingsSheet.tsx`
- Modify: `src/components/companion/CompanionActions.tsx`
- Modify: `src/components/companion/StreamingCursor.tsx`
- Modify: `src/components/TypewriterText.tsx`
- Modify: `src/components/AudioWaveform.tsx`
- Modify: `src/components/CompanionOrb.tsx`
- Modify: `src/components/EveningCelebration.tsx`
- Modify: `src/components/AudioPlayerBottomSheet.tsx`
- Modify: `src/components/StreakCelebration.tsx`
- Modify: `src/components/VoiceInputBar.tsx`
- Modify: `src/components/CheckInSheet.tsx`
- Modify: `src/components/notebook/SwipeableNoteCard.tsx`
- Modify: `src/components/SparkleBurst.tsx`
- Modify: `src/components/GlowBackground.tsx`
- Modify: `src/components/GoldEmberField.tsx`
- Modify: `src/components/StreakDisplay.tsx`
- Modify: `src/components/AccentGlow.tsx`
(Plus all files from Tasks 2-3 that also contain animation patterns)

**Task 5 — Verification:**
- No file changes. TypeScript check + screenshot comparison.

---

### Task 1: Re-export alpha() from UI barrel

**Files:**
- Modify: `src/components/ui/index.ts`

This makes `alpha` importable as `import { alpha } from '@/components/ui'` alongside Button, Card, etc.

- [ ] **Step 1: Add alpha export to UI barrel**

```typescript
// src/components/ui/index.ts — add this line:
export { alpha } from './utils/alpha';
```

The full file becomes:
```typescript
export { Button } from './Button';
export { Card } from './Card';
export { Chip } from './Chip';
export { Input } from './Input';
export { Sheet } from './Sheet';
export { alpha } from './utils/alpha';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output (zero errors in src/)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/index.ts
git commit -m "refactor: re-export alpha() from UI barrel for easier imports"
```

---

### Task 2: Replace hex opacity concatenation with alpha()

**Files:** 28 files listed above (all files matching `colors.\w+ + '[0-9A-Fa-f]{2}'`)

**Pattern:** For each file:
1. Add `import { alpha } from '@/components/ui';` (or append to existing UI import)
2. Replace every `colors.X + 'YY'` with `alpha(colors.X, N)` using the conversion table
3. Also replace `someColor + 'YY'` where `someColor` is a destructured theme color variable

**Important edge case:** Some files destructure colors to local variables like `const accentColor = colors.accent`. The pattern `accentColor + '33'` also needs to become `alpha(accentColor, 0.20)`.

- [ ] **Step 1: Process all 28 files**

For each file, the transformation is mechanical:

```typescript
// BEFORE:
backgroundColor: colors.accent + '1A',
borderColor: colors.accent + '40',

// AFTER:
backgroundColor: alpha(colors.accent, 0.10),
borderColor: alpha(colors.accent, 0.25),
```

Process files in this order (grouped by directory for efficient batch commits):

**Batch A — App screens (11 files):**
- `src/app/(tabs)/(today)/index.tsx`
- `src/app/(tabs)/(today)/reading.tsx`
- `src/app/(tabs)/(today)/journal.tsx`
- `src/app/(tabs)/(today)/journal-detail.tsx`
- `src/app/(tabs)/(journal)/index.tsx`
- `src/app/(tabs)/(journal)/note-detail.tsx`
- `src/app/(tabs)/(ask)/index.tsx`
- `src/app/(tabs)/(you)/index.tsx`
- `src/app/(tabs)/(you)/component-catalog.tsx`
- `src/app/(onboarding)/sign-in.tsx`
- `src/app/onboarding.tsx`

**Batch B — Companion components (7 files):**
- `src/components/companion/RichMessageText.tsx`
- `src/components/companion/CompanionMessageContent.tsx`
- `src/components/companion/CompanionInput.tsx`
- `src/components/companion/CompanionEmptyState.tsx`
- `src/components/companion/UserMessageBubble.tsx`
- `src/components/companion/TypingIndicator.tsx`
- `src/components/companion/SuggestionChips.tsx`

**Batch C — Other components (10 files):**
- `src/components/ScriptureTapSheet.tsx`
- `src/components/StreakBox.tsx`
- `src/components/ProfileAvatar.tsx`
- `src/components/reading/InlineReflectionJournal.tsx`
- `src/components/notebook/ScriptureSearchSheet.tsx`
- `src/components/notebook/CreateFolderSheet.tsx`
- `src/components/notebook/FolderChips.tsx`
- `src/components/notebook/ScriptureRefPill.tsx`
- `src/components/notebook/MoveFolderSheet.tsx`
- `src/components/home/RememberThisCard.tsx`

- [ ] **Step 2: Verify TypeScript compiles after Batch A**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 3: Commit Batch A**

```bash
git add src/app/
git commit -m "refactor: replace hex opacity strings with alpha() in app screens"
```

- [ ] **Step 4: Verify TypeScript compiles after Batch B**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 5: Commit Batch B**

```bash
git add src/components/companion/
git commit -m "refactor: replace hex opacity strings with alpha() in companion components"
```

- [ ] **Step 6: Verify TypeScript compiles after Batch C**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 7: Commit Batch C**

```bash
git add src/components/
git commit -m "refactor: replace hex opacity strings with alpha() in remaining components"
```

- [ ] **Step 8: Verify zero hex concatenation patterns remain**

Run: `grep -rn "colors\.\w\+ + '[0-9A-Fa-f]\{2\}'" src/ --include="*.tsx" | grep -v component-catalog | wc -l`
Expected: 0 (component-catalog excluded as it's a dev-only showcase)

---

### Task 3: Replace hardcoded borderRadius with Radius tokens

**Files:** 15 highest-count files listed above

**Pattern:** For each file:
1. Add `import { Radius } from '@/constants/radius';`
2. Replace `borderRadius: 8` → `borderRadius: Radius.sm`
3. Replace `borderRadius: 12` → `borderRadius: Radius.md`
4. Replace `borderRadius: 14` → `borderRadius: Radius.card`
5. Replace `borderRadius: 16` → `borderRadius: Radius.lg`
6. Replace `borderRadius: 20` → `borderRadius: Radius.xl`
7. Replace `borderRadius: 24` → `borderRadius: Radius['2xl']`
8. Leave values < 8 or not in the token set (e.g., 2, 2.5, 3, 5, 6, 10, 28) as-is

**Also apply to `borderTopLeftRadius`, `borderTopRightRadius`, `borderBottomLeftRadius`, `borderBottomRightRadius` when they use token-matching values.**

- [ ] **Step 1: Process app screen files**

```typescript
// BEFORE:
borderRadius: 12,

// AFTER:
borderRadius: Radius.md,
```

Process these files:
- `src/app/onboarding.tsx` (48 instances)
- `src/app/how-it-works.tsx` (32 instances)
- `src/app/(tabs)/(journal)/index.tsx` (20 instances)
- `src/app/generating.tsx` (16 instances)
- `src/app/unfolded.tsx` (11 instances)
- `src/app/(tabs)/(you)/streak-settings.tsx` (9 instances)
- `src/app/(tabs)/(you)/my-content.tsx` (9 instances)
- `src/app/paywall.tsx` (9 instances)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 3: Commit app screens**

```bash
git add src/app/
git commit -m "refactor: replace hardcoded borderRadius with Radius tokens in app screens"
```

- [ ] **Step 4: Process component files**

- `src/app/(tabs)/(today)/reading.tsx`
- `src/app/(tabs)/(today)/index.tsx`
- `src/app/(tabs)/(today)/journal.tsx`
- `src/components/ScriptureTapSheet.tsx`
- `src/components/DeleteAccountSheet.tsx`
- `src/components/VoiceInputBar.tsx`
- `src/components/PremiumNudgeCard.tsx`

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 6: Commit component files**

```bash
git add src/app/(tabs)/(today)/ src/components/
git commit -m "refactor: replace hardcoded borderRadius with Radius tokens in components"
```

---

### Task 4: Replace hardcoded animation values with Duration/Spring tokens

**Files:** All files using `withTiming` or `withSpring` with hardcoded values

**Pattern:** For each file:
1. Add `import { Duration, Ease } from '@/constants/animations';` (and/or `Spring`)
2. Replace `withTiming(value, { duration: 100 })` → `withTiming(value, { duration: Duration.instant })`
3. Replace `withTiming(value, { duration: 150 })` → `withTiming(value, { duration: Duration.fast })`
4. Replace `withTiming(value, { duration: 250 })` → `withTiming(value, { duration: Duration.normal })`
5. Replace `withTiming(value, { duration: 340 })` → `withTiming(value, { duration: Duration.slow })`
6. Replace `withSpring(value, { damping: 22, stiffness: 200, mass: 0.6 })` → `withSpring(value, Spring.snappy)`
7. Replace `Easing.out(Easing.cubic)` → `Ease.out` (where imported individually)

**Important — exact matches only:** Only replace durations that exactly match a token value (100, 150, 250, 340). Leave `duration: 200`, `300`, `350`, `400` hardcoded — they don't map to any token, and changing them would alter animation timing. Also leave durations > 400ms (500ms+) as-is — they're intentional for celebrations, progress animations, and marketing screens.

**Important:** Do NOT replace `FadeIn.duration(NNN)` or `FadeInDown.duration(NNN)` patterns from Reanimated's entering/exiting animations — these use a different API that doesn't accept Duration constants the same way. Only replace `withTiming` duration parameters.

- [ ] **Step 1: Find all files with replaceable animation patterns**

Run: `grep -rn "duration: \(100\|150\|250\|340\)" src/ --include="*.tsx" | grep -v "node_modules" | head -30`

This finds only exact-match token durations: 100, 150, 250, 340.

- [ ] **Step 2: Process files with Duration replacements**

```typescript
// BEFORE:
translateY.value = withTiming(0, { duration: 250 });

// AFTER:
translateY.value = withTiming(0, { duration: Duration.normal });
```

- [ ] **Step 3: Process files with Spring replacements**

```typescript
// BEFORE:
scale.value = withSpring(1, { damping: 22, stiffness: 200, mass: 0.6 });

// AFTER:
scale.value = withSpring(1, Spring.snappy);
```

Only replace spring configs that exactly match one of the three defined presets:
- `{ damping: 35, stiffness: 300, mass: 0.8 }` → `Spring.press`
- `{ damping: 20, stiffness: 100, mass: 1 }` → `Spring.gentle`
- `{ damping: 22, stiffness: 200, mass: 0.6 }` → `Spring.snappy`

Leave non-matching spring configs as-is.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor: replace hardcoded animation values with Duration/Spring tokens"
```

---

### Task 5: Final verification

**Files:** None modified. Verification only.

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -10`
Expected: No output (zero errors in src/)

- [ ] **Step 2: Verify alpha() adoption**

Run: `grep -rn "colors\.\w\+ + '[0-9A-Fa-f]\{2\}'" src/ --include="*.tsx" | grep -v component-catalog | wc -l`
Expected: 0 remaining hex concatenation patterns (excluding component-catalog showcase)

- [ ] **Step 3: Verify Radius adoption**

Run: `grep -rn "borderRadius: \(8\|12\|14\|16\|20\|24\)," src/ --include="*.tsx" | wc -l`
Expected: Significantly reduced from original 225+ (some will remain in files not targeted)

- [ ] **Step 4: Build the app**

Run: `npx expo start --clear --port 8081` (verify Metro bundler starts without errors)
Expected: Bundle compiles successfully, no red screen errors

- [ ] **Step 5: Take simulator screenshot for visual regression check**

Run: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png`
Expected: App renders correctly, no visual regressions

- [ ] **Step 6: Commit verification results**

No code changes. If issues were found in Steps 1-5, fix them before this step.
