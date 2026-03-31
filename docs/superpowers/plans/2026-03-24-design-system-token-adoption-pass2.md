# Design System Token Adoption Pass 2 — Radius + Shadow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Radius token adoption across the remaining 48 files (~125 instances including directional radius properties) and adopt Shadow tokens across 22 files with hardcoded shadow blocks.

**Architecture:** Pure mechanical replacements — no behavior changes. Radius replacements use exact value-to-token mapping (same as pass 1). Shadow replacements use nearest-tier mapping where the visual difference is imperceptible (opacity ±0.02, radius ±2px). TypeScript compilation is the verification gate.

**Tech Stack:** React Native, TypeScript, Expo

**Key constraint:** No visual changes. Radius values map exactly. Shadow values map to the nearest token tier — where the difference would be invisible to users (sub-pixel opacity and blur differences).

---

## Radius Token Mapping (same as pass 1)

| Hardcoded | Token | Value |
|-----------|-------|-------|
| `borderRadius: 8` | `Radius.sm` | 8 |
| `borderRadius: 12` | `Radius.md` | 12 |
| `borderRadius: 14` | `Radius.card` | 14 |
| `borderRadius: 16` | `Radius.lg` | 16 |
| `borderRadius: 20` | `Radius.xl` | 20 |
| `borderRadius: 24` | `Radius['2xl']` | 24 |
| `borderRadius: 999` or `9999` | `Radius.full` | 999 |

**Leave hardcoded:** Values like 0, 2, 2.5, 3, 4, 5, 6, 10, 28, 30, 32, etc.

Also apply to `borderTopLeftRadius`, `borderTopRightRadius`, `borderBottomLeftRadius`, `borderBottomRightRadius`.

## Shadow Token Mapping

| Token | iOS: opacity | iOS: offset | iOS: radius | Android: elevation |
|-------|-------------|-------------|-------------|-------------------|
| `Shadow.sm` | 0.06 | {0, 2} | 10 | 2 |
| `Shadow.md` | 0.08 | {0, 2} | 10 | 3 |
| `Shadow.lg` | 0.12 | {0, 4} | 16 | 6 |
| `Shadow.sheet` | 0.12 | {0, -4} | 20 | 24 |

**Mapping rules for inline shadow blocks:**
- Blocks with `shadowOpacity: 0.04–0.06`, `shadowRadius: 3–10`, `elevation: 1–2` → `Shadow.sm`
- Blocks with `shadowOpacity: 0.05–0.10`, `shadowRadius: 6–12`, `elevation: 2–3` → `Shadow.md`
- Blocks with `shadowOpacity: 0.10–0.15`, `shadowRadius: 12–20`, `elevation: 4–8` → `Shadow.lg`
- Blocks with negative `shadowOffset.height` (upward shadow) → `Shadow.sheet`
- **Leave hardcoded:** Blocks with `shadowOpacity > 0.20`, dynamic opacity (`isDark ? X : Y`), colored shadowColor (not `#000`), or AccentGlow-style decorative shadows

**Important:** When replacing a shadow block, the entire block (shadowColor + shadowOffset + shadowOpacity + shadowRadius + elevation) gets replaced with a single spread: `...Shadow.sm`. Remove all 5 individual properties and add the spread.

---

## File Map

No new files created. Modifications only.

**Task 1 — Radius pass 2, Batch A (16 app screen files):**
- Modify: `src/app/(tabs)/(you)/settings.tsx` (15 instances)
- Modify: `src/app/(tabs)/(you)/stats.tsx` (4 + 1 full)
- Modify: `src/app/(tabs)/(you)/saved.tsx` (4)
- Modify: `src/app/(tabs)/(today)/wallpaper.tsx` (4)
- Modify: `src/app/(tabs)/(bible)/reader.tsx` (4)
- Modify: `src/app/(onboarding)/sign-in.tsx` (4)
- Modify: `src/app/sample-devotional.tsx` (3)
- Modify: `src/app/welcome-celebration.tsx` (2)
- Modify: `src/app/share-card.tsx` (2)
- Modify: `src/app/(tabs)/(you)/past-devotionals.tsx` (2)
- Modify: `src/app/(tabs)/(you)/index.tsx` (2)
- Modify: `src/app/(tabs)/(today)/evening-wind-down.tsx` (2)
- Modify: `src/app/(tabs)/(today)/day-menu.tsx` (2)
- Modify: `src/app/(tabs)/(journal)/note-detail.tsx` (2)
- Modify: `src/app/(tabs)/(bible)/index.tsx` (2)
- Modify: `src/app/(tabs)/(today)/journal-detail.tsx` (1)

**Task 2 — Radius pass 2, Batch B (6 app screen files):**
- Modify: `src/app/(tabs)/(today)/highlights.tsx` (1)
- Modify: `src/app/(tabs)/(journal)/my-responses.tsx` (1)
- Modify: `src/app/(tabs)/(bible)/search.tsx` (1)
- Modify: `src/app/(tabs)/(bible)/saved.tsx` (1)
- Modify: `src/app/(tabs)/(ask)/index.tsx` (1)
- Modify: `src/app/(tabs)/(you)/saved-passages.tsx` (1)

**Task 3 — Radius pass 2, Batch C (26 component files):**
- Modify: `src/components/CheckInSheet.tsx` (6)
- Modify: `src/components/notebook/ScriptureSearchSheet.tsx` (4)
- Modify: `src/components/StreakDisplay.tsx` (3)
- Modify: `src/components/companion/CompanionInput.tsx` (3)
- Modify: `src/components/AudioPlayerBottomSheet.tsx` (3)
- Modify: `src/components/StreakBox.tsx` (2)
- Modify: `src/components/reading/StudyMethodSheet.tsx` (2)
- Modify: `src/components/reading/InlineReflectionJournal.tsx` (2)
- Modify: `src/components/PremiumFeatureSheet.tsx` (2)
- Modify: `src/components/notebook/CreateFolderSheet.tsx` (2)
- Modify: `src/components/HomeOnboardingTooltips.tsx` (2)
- Modify: `src/components/companion/CompanionEmptyState.tsx` (2)
- Modify: `src/components/bible/BookChapterNavigator.tsx` (2)
- Modify: `src/components/UndoToast.tsx` (1)
- Modify: `src/components/reading/DevotionalContent.tsx` (1)
- Modify: `src/components/notebook/NoteCard.tsx` (1)
- Modify: `src/components/notebook/FolderChips.tsx` (1)
- Modify: `src/components/home/YourSeriesSection.tsx` (1)
- Modify: `src/components/home/RememberThisCard.tsx` (1)
- Modify: `src/components/ErrorBoundary.tsx` (1)
- Modify: `src/components/companion/TypingIndicator.tsx` (1)
- Modify: `src/components/companion/SuggestionChips.tsx` (1)
- Modify: `src/components/companion/CompanionMessageContent.tsx` (1)
- Modify: `src/components/bible/ReadingSettingsSheet.tsx` (1)
- Modify: `src/components/bible/DownloadBibleSheet.tsx` (1)
- Modify: `src/components/AdaptiveQuestionFlow.tsx` (1)

**Task 4 — Shadow adoption (21 files):**
- Modify: `src/app/(tabs)/(journal)/index.tsx`
- Modify: `src/app/(tabs)/(today)/index.tsx`
- Modify: `src/components/AudioPlayerBottomSheet.tsx`
- Modify: `src/app/(tabs)/(today)/reading.tsx`
- Modify: `src/app/(tabs)/(you)/index.tsx`
- Modify: `src/components/notebook/MoveFolderSheet.tsx`
- Modify: `src/app/onboarding.tsx`
- Modify: `src/app/unfolded.tsx`
- Modify: `src/app/(tabs)/(bible)/reader.tsx`
- Modify: `src/components/StreakBox.tsx`
- Modify: `src/components/notebook/ScriptureSearchSheet.tsx`
- Modify: `src/components/notebook/NoteCard.tsx`
- Modify: `src/components/notebook/CreateFolderSheet.tsx`
- Modify: `src/components/HomeOnboardingTooltips.tsx`
- Modify: `src/components/home/RememberThisCard.tsx`
- Modify: `src/components/bible/ReadingSettingsSheet.tsx`
- Modify: `src/app/(tabs)/(you)/past-devotionals.tsx`
- Modify: `src/app/(tabs)/(journal)/note-detail.tsx`
- Modify: `src/app/(tabs)/(bible)/index.tsx`
- Modify: `src/app/(tabs)/(ask)/index.tsx`
- Modify: `src/app/(tabs)/(today)/wallpaper.tsx`
- Skip: `src/components/UndoToast.tsx` (shadowOpacity 0.25 > 0.20 threshold — leave hardcoded)
- Skip: `src/components/AudioWaveform.tsx` (dynamic opacity + colored shadowColor — leave hardcoded)
- Skip: `src/components/AccentGlow.tsx` (decorative glow shadows — leave hardcoded)

**Task 5 — Final verification:**
- No file changes. TypeScript check + visual regression.

---

### Task 1: Radius pass 2 — App screens batch A (16 files)

**Files:** 16 app screen files listed above

**Pattern:** Same as pass 1:
1. Add `import { Radius } from '@/constants/radius';` (or add to existing import)
2. Replace `borderRadius: 8` → `borderRadius: Radius.sm`
3. Replace `borderRadius: 12` → `borderRadius: Radius.md`
4. Replace `borderRadius: 14` → `borderRadius: Radius.card`
5. Replace `borderRadius: 16` → `borderRadius: Radius.lg`
6. Replace `borderRadius: 20` → `borderRadius: Radius.xl`
7. Replace `borderRadius: 24` → `borderRadius: Radius['2xl']`
8. Replace `borderRadius: 999` or `9999` → `borderRadius: Radius.full`
9. Also apply to directional radius properties
10. Leave non-token values hardcoded

- [ ] **Step 1: Process all 16 files**

Process each file: read, find token-matching borderRadius values, replace with tokens, add import.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add src/app/
git commit -m "refactor: replace hardcoded borderRadius with Radius tokens in remaining app screens (batch A)"
```

---

### Task 2: Radius pass 2 — App screens batch B (6 files)

**Files:** 6 app screen files with 1 instance each

**Pattern:** Same as Task 1.

- [ ] **Step 1: Process all 6 files**

These files each have only 1 replaceable instance. Read, replace, add import.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/app/
git commit -m "refactor: replace hardcoded borderRadius with Radius tokens in remaining app screens (batch B)"
```

---

### Task 3: Radius pass 2 — Components (26 files)

**Files:** 26 component files listed above

**Pattern:** Same as Tasks 1-2. Many of these files already import Radius from pass 1 — check before adding duplicate imports.

- [ ] **Step 1: Process all 26 component files**

For files that already have `import { Radius } from '@/constants/radius'`, skip adding the import. Just replace values.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/components/
git commit -m "refactor: replace hardcoded borderRadius with Radius tokens in remaining components"
```

- [ ] **Step 4: Verify zero token-value borderRadius remain**

Run: `grep -rn "borderRadius: \(8\|12\|14\|16\|20\|24\)," src/ --include="*.tsx" | grep -v component-catalog | grep -v showcase | wc -l`
Expected: 0

---

### Task 4: Shadow token adoption (21 files)

**Files:** 24 files listed above with hardcoded shadow blocks

**Pattern:** For each file:
1. Add `import { Shadow } from '@/constants/shadows';`
2. Find each inline shadow block (group of shadowColor + shadowOffset + shadowOpacity + shadowRadius + elevation)
3. Map to nearest Shadow token tier:
   - `shadowOpacity: 0.04–0.06` + `shadowRadius: 3–10` + `elevation: 1–2` → `...Shadow.sm`
   - `shadowOpacity: 0.05–0.10` + `shadowRadius: 6–12` + `elevation: 2–3` → `...Shadow.md`
   - `shadowOpacity: 0.10–0.15` + `shadowRadius: 12–20` + `elevation: 4–8` → `...Shadow.lg`
   - Negative `shadowOffset.height` → `...Shadow.sheet`
4. Replace the entire block (all 5 properties) with the spread operator: `...Shadow.sm`
5. **Leave hardcoded:** Dynamic shadows (`isDark ? X : Y`), colored shadows (not `#000`), decorative glows (`AccentGlow.tsx`), or shadows with `shadowOpacity > 0.20`

**Example transformation:**

```typescript
// BEFORE (in StyleSheet.create or inline):
card: {
  borderRadius: Radius.md,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
  padding: 16,
},

// AFTER:
card: {
  borderRadius: Radius.md,
  ...Shadow.sm,
  padding: 16,
},
```

**Tie-breaker:** When a shadow block falls in the overlap zone between two tiers (e.g., opacity=0.05, radius=8), prefer the lower tier (sm over md, md over lg).

**Important:** Some files have shadow properties scattered (e.g., `shadowColor` on one line but other shadow props missing or in a different style object). Only replace complete shadow blocks where all properties are together.

- [ ] **Step 1: Process app screen files with shadow blocks**

Files: `(journal)/index.tsx`, `(today)/index.tsx`, `(today)/reading.tsx`, `(you)/index.tsx`, `(bible)/reader.tsx`, `onboarding.tsx`, `unfolded.tsx`, `(you)/past-devotionals.tsx`, `(journal)/note-detail.tsx`, `(bible)/index.tsx`, `(ask)/index.tsx`, `(today)/wallpaper.tsx`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 3: Commit app screens**

```bash
git add src/app/
git commit -m "refactor: replace hardcoded shadow blocks with Shadow tokens in app screens"
```

- [ ] **Step 4: Process component files with shadow blocks**

Files: `AudioPlayerBottomSheet.tsx`, `MoveFolderSheet.tsx`, `StreakBox.tsx`, `ScriptureSearchSheet.tsx`, `NoteCard.tsx`, `CreateFolderSheet.tsx`, `HomeOnboardingTooltips.tsx`, `RememberThisCard.tsx`, `ReadingSettingsSheet.tsx`

Skip `UndoToast.tsx` (opacity > 0.20), `AudioWaveform.tsx` (dynamic + colored), `AccentGlow.tsx` (decorative glow).

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: No output

- [ ] **Step 6: Commit components**

```bash
git add src/components/
git commit -m "refactor: replace hardcoded shadow blocks with Shadow tokens in components"
```

---

### Task 5: Final verification

**Files:** None modified. Verification only.

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -10`
Expected: No output (zero errors in src/)

- [ ] **Step 2: Verify zero token-value borderRadius remain**

Run: `grep -rn "borderRadius: \(8\|12\|14\|16\|20\|24\|999\|9999\)," src/ --include="*.tsx" | grep -v component-catalog | grep -v showcase | wc -l`
Expected: 0 (or very close — only truly purpose-specific exceptions)

- [ ] **Step 3: Count Shadow adoption**

Run: `grep -rn "\.\.\.Shadow\." src/ --include="*.tsx" | wc -l`
Expected: 20+ Shadow token usages

Run: `grep -rn "shadowOffset\|shadowOpacity\|shadowRadius" src/ --include="*.tsx" | grep -v "node_modules" | grep -v "constants/shadows" | grep -v component-catalog | wc -l`
Expected: Significantly reduced from original ~100+

- [ ] **Step 4: Build the app**

Run: `npx expo start --clear --port 8081` (verify Metro bundler starts without errors)
Expected: Bundle compiles successfully

- [ ] **Step 5: Take simulator screenshot for visual regression check**

Run: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png`
Expected: App renders correctly, no visual regressions
