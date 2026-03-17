# Unfold Notebook Feature — UI/UX Design Specification

**Date**: 2026-03-16
**Status**: Ready for Implementation
**Companion doc**: `docs/notebook-feature-plan.md` (architecture/data model)
**Purpose**: Pixel-level design spec for the implementation agent. Every spacing value, color token, font, and animation is specified.

---

## Part 1: Design Language Audit (Existing App Patterns)

### Typography System
| Token | Font | Usage |
|-------|------|-------|
| `FontFamily.display` | InstrumentSerif 400 | Screen titles, card headings, empty state headlines |
| `FontFamily.body` | Inter 400 | Body text, note content, preview text |
| `FontFamily.bodyItalic` | Inter 400 Italic | Scripture quotes, reflection questions, placeholder text |
| `FontFamily.bodyMedium` | Inter 500 | Emphasized body text |
| `FontFamily.bodyBold` | Inter 700 | Strong emphasis (rare) |
| `FontFamily.ui` | Inter 400 | Small labels, timestamps, metadata |
| `FontFamily.uiMedium` | Inter 500 | Card titles, toolbar labels, active states |
| `FontFamily.uiSemiBold` | Inter 600 | Section headers, prominent UI labels |
| `FontFamily.mono` | Inter 400 | Uppercase section labels (e.g., "YOUR JOURNEY", "REFLECT") |

### Font Size Scale
| Token | Size | Usage in notebook |
|-------|------|-------------------|
| `FontSize.xs` (12) | Category labels, timestamps, tag text |
| `FontSize.sm` (14) | Card preview text, toolbar labels, filter pills |
| `FontSize.base` (16) | Note body text in editor, card titles |
| `FontSize.lg` (18) | Note title in editor |
| `FontSize.xl` (20) | Section headings |
| `FontSize['2xl']` (24) | Empty state headline, read-view title |
| `FontSize['3xl']` (30) | Not used in notebook |
| 34 | Screen title "Journal" (matches existing) |

### Color System
The app uses a theme-aware color system with 7 accent themes. All notebook components MUST use `colors.*` tokens from `useTheme()`, never hardcoded colors.

**Key tokens for the notebook**:
| Token | Dark Mode | Light Mode | Usage |
|-------|-----------|------------|-------|
| `colors.background` | #0A0A0A | #FAF7F2 | Screen backgrounds |
| `colors.backgroundElevated` | #141210 | #FFFFFF | Card backgrounds |
| `colors.text` | #F5F0EB | #1C1710 | Primary text |
| `colors.textMuted` | rgba(245,240,235,0.6) | rgba(28,23,16,0.62) | Secondary text, preview |
| `colors.textSubtle` | rgba(245,240,235,0.4) | rgba(28,23,16,0.42) | Tertiary text, timestamps |
| `colors.textHint` | rgba(245,240,235,0.25) | rgba(28,23,16,0.3) | Placeholder text |
| `colors.accent` | Dynamic (default #C8A55C) | Dynamic (default #9A7B3C) | Active states, CTAs, pills |
| `colors.border` | rgba(245,240,235,0.08) | rgba(28,23,16,0.07) | Card borders, dividers |
| `colors.inputBackground` | rgba(245,240,235,0.05) | rgba(28,23,16,0.04) | Input fields, search bar |
| `colors.buttonBackground` | rgba(245,240,235,0.08) | rgba(28,23,16,0.05) | Inactive pill backgrounds |

### Opacity Patterns (from existing code)
- Accent at 5% (`+ '0D'`): Subtle card tint (reflection card background)
- Accent at 7% (`+ '12'`): Card border tint
- Accent at 8% (`+ '15'`): Badge/pill background
- Accent at 20% (`+ '33'`): Active pill border
- Accent at 30% (`+ '50'`): Left-border on question responses

### Established Component Patterns
- **Card radius**: 14px (journal entry cards), 20px (hero/feature cards), 12px (input fields, small cards)
- **Card padding**: 16px (standard cards), 24px (feature cards)
- **Card shadow (dark)**: `shadowColor: '#000', shadowOffset: {0,2}, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2`
- **Card shadow (light)**: Same structure, slightly higher opacity
- **Card border**: `borderWidth: 1, borderColor: colors.border`
- **Screen horizontal padding**: 24px
- **Section spacing**: 28px between major sections
- **Icon style**: phosphor-react-native, `weight="light"` default, `weight="fill"` for active/selected states
- **Icon size**: 16-20px in UI, 22px in tab bar, 14-15px for inline labels
- **Haptic feedback**: `Haptics.ImpactFeedbackStyle.Light` for taps, `Medium` for primary actions, `Success` notification for saves
- **Animation library**: react-native-reanimated v3
- **Entry animations**: `FadeIn.duration(700)` for headers, `FadeInDown.duration(600).delay(N)` for staggered content
- **Section label pattern**: `FontFamily.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.textSubtle`

---

## Part 2: Competitive Research Findings

### Bear App
**What works well:**
- **Inline hashtags**: Type `#tagname` anywhere in text; renders in the accent color inline, tappable to filter. No disruption to writing flow. When not in edit mode, tapping a tag navigates to all notes with that tag.
- **Tag autocomplete**: After typing `#` and one letter, a dropdown appears with matching existing tags. This is critical for discoverability and consistency.
- **Three-column hierarchy**: Sidebar (tags) > Note list > Editor. On mobile, collapses to single-pane with back navigation.
- **First line as title**: If no explicit title, the first line of the note becomes the title in the list view. Reduces friction dramatically.
- **Typography**: Custom Bear Sans font, but the key pattern is generous line height and careful vertical rhythm around headings.
- **Minimal chrome**: The editor is nearly full-screen. Toolbar appears only when keyboard is active.
- **Tag icons (TagCons)**: 250+ icons assignable to tags for visual scanning. Categories in Unfold serve this purpose.

**Applicable to Unfold**: Inline hashtag rendering, first-line-as-title, minimal editor chrome, tag autocomplete popup.

### Apple Notes
**What works well:**
- **Adaptive toolbar (iOS 26)**: Tools appear contextually based on content type. Not all tools shown at once.
- **Smart Folders with tags**: Auto-grouping via rules. In Unfold, category auto-detection serves this purpose.
- **Checklist UI**: Tappable circles that animate to checkmarks with a satisfying spring. Include subtle strikethrough on completed items.
- **Quick Note flow**: One action to start writing. No folder selection required.
- **Liquid Glass design (iOS 26)**: Translucent toolbar, depth effects. Unfold already uses BlurView in tab bar; can extend this pattern.

**Applicable to Unfold**: Quick capture (one tap to cursor), checklist interaction pattern, adaptive toolbar concept.

### Day One Journal
**What works well:**
- **Multiple views**: List, Calendar, Media, Map. For Unfold, list is primary; calendar view is Phase 2+.
- **Rich metadata auto-capture**: Time, date, weather, step count added automatically. Unfold version: devotionalId, dayNumber, bibleBookId, bibleChapter.
- **"On This Day"**: Surfaces entries from same date in previous years. Creates emotional engagement. Phase 2 for Unfold.
- **Entry cards**: Show date header, title, preview text (2 lines), and small metadata row. Clean vertical rhythm.
- **Moods and tags**: Visual indicators on cards. Unfold equivalent: category icon + tag pills.

**Applicable to Unfold**: Auto-metadata capture, card design with date grouping, On This Day concept for Phase 3.

### Notion Mobile
**What works well:**
- **Slash commands**: Type `/` to access block types. Too complex for Unfold, but the concept of a quick-action trigger is useful.
- **Property system**: Pages have typed properties (tags, dates, selects). Unfold categories serve a similar but simpler purpose.
- **Page list**: Clean, minimal cards showing icon + title + preview. Very scannable.

**What to avoid**: Notion's complexity is its weakness on mobile. Unfold must stay simple: flat notes, no nested pages, no databases.

### YouVersion Bible App
**What works well:**
- **Verse-linked notes**: Notes are directly associated with specific verses. When viewing a verse, a small indicator shows a note exists.
- **Privacy options**: Notes can be private, shared with friends, or public. Unfold should default to private (local-only Phase 1).
- **Highlight + note combination**: A verse can have both a color highlight and a text note. Unfold's Bible reader already does this; notebook notes extend it.

**Applicable to Unfold**: Verse indicator dots in Bible reader, pre-populated scripture reference when creating from reader.

### Glorify App
**What works well:**
- **Daily Worship flow**: Structured daily experience with devotionals, reflections, and journaling woven together.
- **Clean, calming UI**: Soft gradients, generous whitespace, clear typography. Very similar aesthetic to Unfold.
- **Scripture highlighting to journal**: Highlight a verse, it flows into your journal. Direct model for Unfold's Bible reader integration.
- **Two fonts**: One serif for scripture/headings, one sans for body. Matches Unfold's InstrumentSerif + Inter pattern.

**Applicable to Unfold**: The Glorify model of scripture-to-journal flow validates Unfold's Bible Reader -> Notebook integration.

### Logos Bible App
**What works well:**
- **Annotation layers**: Multiple types of annotations (notes, highlights, bookmarks) coexist on the same passage.
- **Passage Guide**: Cross-references and related materials pulled together automatically.
- **Margin indicators**: Clickable icons in the Bible margin showing where notes/sermons are tagged to a passage. This is exactly what Unfold should do in Phase 2.

**Applicable to Unfold**: Margin/verse indicators, concept of linking notes to specific passages, passage guide inspiration for smart linking.

### Craft App
**What works well:**
- **Card-based pages**: Documents are visually card-like, with clear hierarchy. Cards within cards for structure.
- **Inline tags with `#`**: Recently added, with nested tag hierarchy. Validates the Bear-style inline tag pattern.
- **Typography focus**: Clean, generous spacing. Text-first design.
- **Speed and polish**: 2026 focus on performance. Important for Unfold: the note list and editor must be instant.

**Applicable to Unfold**: Card-based note list, inline tag system, performance-first editor.

### Google Keep
**What works well:**
- **Grid vs List toggle**: Users can switch between masonry grid and stacked list. For Unfold, list view is better for text-heavy notes.
- **Color coding**: Notes have background colors by category. Could be subtle in Unfold: a thin left-border or small icon in the accent color of the category.
- **Labels as chips**: Small tag-like chips at the bottom of note cards. Clean, scannable.
- **Quick capture**: `note.new` shortcut. FAB in bottom-right for instant creation.

**Applicable to Unfold**: Label/tag chips on cards, quick capture philosophy, FAB placement.

### Evernote
**What works well:**
- **Note cards in list**: Title, preview (2-3 lines), notebook name, date. Very scannable.
- **First note as onboarding**: The very first note in a new account is a tutorial. Clever empty state solution.

**Applicable to Unfold**: Card information hierarchy, onboarding-as-content idea.

---

## Part 3: Design Pattern Analysis & Recommendations

### 1. Note List View (NoteCard Component)

**Recommended: Vertical list layout** (not grid). Reasoning: Text-heavy notes need horizontal space for preview readability. Grid works for visual-first apps (Pinterest, Google Keep photos) but not for Bible study notes.

**Card anatomy** (top to bottom):
```
┌────────────────────────────────────────┐
│ [CategoryIcon] Title Text         [Star]│  <- Row 1: 14px uiMedium
│ Scripture Reference Pill               │  <- Row 2: Tappable pill (optional)
│ Preview text that wraps to two lines   │  <- Row 3: 13px body, 2 lines max
│ max, fading with ellipsis...           │
│ 3 days ago  #sermon  #faith           │  <- Row 4: metadata + tags
└────────────────────────────────────────┘
```

**Card height**: Variable, ~100-120px depending on content. Not fixed height.
- Row 1 (title): 20px line + 6px bottom margin = 26px
- Row 2 (scripture ref, optional): 22px line + 6px bottom margin = 28px (or 0 if none)
- Row 3 (preview): 2 * 19px (lineHeight) = 38px + 8px bottom margin = 46px
- Row 4 (metadata): 16px line = 16px
- Padding: 16px top + 16px bottom = 32px
- Total: ~120px with scripture ref, ~92px without

**Card styling** (matches existing journal entry cards):
```typescript
{
  backgroundColor: colors.backgroundElevated,
  borderRadius: 14,
  padding: 16,
  marginBottom: 10,
  borderWidth: 1,
  borderColor: colors.border,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
}
```

**Favorited card differentiation**: If `isFavorite === true`, add a thin left border:
```typescript
borderLeftWidth: isFavorite ? 2.5 : 0,
borderLeftColor: isFavorite ? colors.accent : 'transparent',
```

### 2. Segmented Control ("Reflections" / "Notebook")

**Design**: Custom-built (not native UISegmentedControl) to match Unfold's aesthetic. A pill-shaped container with a sliding indicator.

**Dimensions**:
- Container: Full width minus 48px (24px padding each side), height 36px, borderRadius 18px
- Background: `colors.inputBackground`
- Border: `borderWidth: 1, borderColor: colors.border`
- Each segment: 50% width

**Sliding indicator**:
- Background: `colors.backgroundElevated`
- Border: `borderWidth: 1, borderColor: colors.border`
- BorderRadius: 16px (slightly smaller than container)
- Shadow: `shadowColor: '#000', shadowOffset: {0, 1}, shadowOpacity: 0.08, shadowRadius: 4`
- Margin: 2px inset from container edges

**Text**:
- Active: `FontFamily.uiMedium, fontSize: 14, color: colors.text`
- Inactive: `FontFamily.ui, fontSize: 14, color: colors.textSubtle`

**Animation**: The sliding indicator uses `react-native-reanimated`:
```typescript
// translateX animates between 0 and containerWidth/2
withSpring(activeIndex * segmentWidth, {
  damping: 18,
  stiffness: 200,
  mass: 0.8,
})
```
This gives a fluid, slightly bouncy transition (matching the tab bar SPRING_CONFIG pattern).

**Placement**: Below the "Journal" title and search icon, above the content area. 16px below the header, 16px above the content.

### 3. Note Editor

**Design philosophy**: Distraction-free. The editor should feel like writing in a physical journal. Minimal chrome, maximum writing space.

**Header bar** (fixed, not scrollable):
```
┌──────────────────────────────────────────┐
│ [< Back]                    [Done]  [...] │
│                                          │
│ height: 52px, paddingHorizontal: 16px    │
└──────────────────────────────────────────┘
```
- Back button: `CaretLeftIcon size={24} color={colors.textMuted} weight="light"`, padding: 8px, hitSlop: 10px
- "Done" text button: `FontFamily.uiMedium, fontSize: 16, color: colors.accent`. Only visible when keyboard is open or content has changed.
- More menu ("..."): `DotsThreeIcon size={24} color={colors.textMuted} weight="light"`. Opens bottom sheet with: Category picker, Tag manager, Delete note (with red text), Share note.

**Title field**:
```typescript
{
  fontFamily: FontFamily.display,
  fontSize: 24,
  color: colors.text,
  letterSpacing: -0.3,
  paddingHorizontal: 24,
  paddingTop: 20,
  paddingBottom: 4,
  // No border, no background — looks like body text but bigger
}
```
- Placeholder: "Title" in `colors.textHint`
- If left empty, first line of body content becomes the display title in the list view (Bear pattern)
- Single line, does not scroll. Pressing Return moves focus to body.

**Auto-save indicator**:
- Position: Right-aligned in the header, between "Done" and "..." buttons
- When saving: Small `ActivityIndicator size="small"` in `colors.textHint`
- After save: Fades in a checkmark icon (`CheckIcon size={14} color={colors.textSubtle}`), holds 1.5s, fades out
- Animation: `FadeIn.duration(200)` for check, `FadeOut.duration(300).delay(1500)` for disappearance
- Alternative: Subtle text "Saved" in `FontFamily.ui, fontSize: 11, color: colors.textHint` that fades in/out
- Auto-save triggers: 800ms debounce after last keystroke (matches existing journal pattern)

**Body content area**:
```typescript
{
  fontFamily: FontFamily.body,
  fontSize: 16,
  color: colors.text,
  lineHeight: 26, // 1.625 ratio for comfortable reading
  paddingHorizontal: 24,
  paddingTop: 8,
  paddingBottom: 200, // generous bottom padding for keyboard clearance
  textAlignVertical: 'top',
}
```
- Placeholder: "Start writing..." in `colors.textHint`, italic
- Multiline, auto-growing TextInput
- Wrap in `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` and `keyboardVerticalOffset` calculated from header height + safe area

**Toolbar** (above keyboard, InputAccessoryView style):
```
┌──────────────────────────────────────────┐
│  [Bible]  [B]  [I]  [List]  [Check]  [#]│
│                                          │
│  height: 44px, borderTop, blur bg        │
└──────────────────────────────────────────┘
```

Position: Use `KeyboardAvoidingView` or `inputAccessoryViewID` on iOS for native keyboard tracking. On Android, position above keyboard using `Keyboard.addListener`.

Toolbar buttons:
| Button | Icon | Size | Action |
|--------|------|------|--------|
| Scripture | `BookBookmarkIcon` weight="light" | 20px | Opens scripture reference picker sheet |
| Bold | **B** text (not icon) | `FontFamily.bodyBold, 16px` | Wraps selection in `**` |
| Italic | *I* text (not icon) | `FontFamily.bodyItalic, 16px` | Wraps selection in `*` |
| List | `ListIcon` weight="light" | 20px | Inserts `- ` at line start |
| Checklist | `CheckSquareIcon` weight="light" | 20px | Inserts `[ ] ` at line start |
| Tag | `HashIcon` weight="light" | 20px | Inserts `#` and opens tag autocomplete |

Toolbar styling:
```typescript
{
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-around',
  paddingHorizontal: 20,
  paddingVertical: 8,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: colors.border,
  backgroundColor: isDark ? 'rgba(20, 18, 16, 0.95)' : 'rgba(255, 255, 255, 0.95)',
}
```
Each button: `44x44px touch target, alignItems: 'center', justifyContent: 'center'`

### 4. Category Pills (Filter Bar)

**Layout**: Horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}`, `contentContainerStyle: { paddingHorizontal: 24, gap: 8 }`

**Pill dimensions**:
- Height: 32px
- Padding: `paddingHorizontal: 14, paddingVertical: 6`
- BorderRadius: 16px (fully rounded)

**Pill states**:

Active (selected):
```typescript
{
  backgroundColor: colors.accent + '15', // 8% opacity
  borderWidth: 1,
  borderColor: colors.accent + '33',     // 20% opacity
}
```
Text: `FontFamily.uiMedium, fontSize: 13, color: colors.accent`

Inactive:
```typescript
{
  backgroundColor: colors.buttonBackground,
  borderWidth: 1,
  borderColor: colors.border,
}
```
Text: `FontFamily.ui, fontSize: 13, color: colors.textMuted`

**Content**: Text only (no icons in pills). Icons add visual noise at this size. The category is already communicated by the text label. Keep it clean.

**Order**: `All | Sermon | Quiet Time | Study | Prayer | General`

"All" pill is always first and uses a slightly different active state:
```typescript
// "All" when active
{
  backgroundColor: colors.text,  // Inverted — solid text color
}
// Text: color: colors.background (inverted)
```

**Animation on selection**: `withSpring` scale from 0.95 to 1.0 on the newly active pill:
```typescript
withSpring(1, { damping: 15, stiffness: 300 })
```
Plus `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` on tap.

### 5. Scripture Reference Pills

**Inline display** (inside note card in list):
```typescript
{
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 6,
  backgroundColor: colors.accent + '0D', // 5% accent tint
}
```
- Icon: `BookOpenIcon size={11} color={colors.accent} weight="light"` (with 4px right margin due to phosphor viewBox padding)
- Text: `FontFamily.uiMedium, fontSize: 11, color: colors.accent, letterSpacing: 0.3`
- Example: `[BookIcon] John 3:16-17`

**In editor** (rendered inline when user adds a scripture reference):
- Same pill styling but slightly larger: `paddingHorizontal: 10, paddingVertical: 4, fontSize: 13`
- Tappable: navigates to `/(tabs)/(bible)/reader?bookId=X&chapter=Y&verse=Z`
- On tap: `Haptics.impactAsync(Light)`

**In note detail (read view)**:
- Full-width card style for each scripture reference:
```typescript
{
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 10,
  backgroundColor: colors.accent + '08', // ~3% tint
  borderLeftWidth: 2.5,
  borderLeftColor: colors.accent,
  marginBottom: 8,
}
```
This matches the existing `scriptureBlock` pattern from DevotionalContent.tsx.

### 6. Tag System

**Inline rendering** (in editor):
- When user types `#` followed by characters, the text renders in accent color: `color: colors.accent`
- A tag autocomplete dropdown appears below the cursor position:
  ```typescript
  {
    position: 'absolute',
    backgroundColor: colors.backgroundElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    maxHeight: 160,
    padding: 4,
  }
  ```
- Each suggestion: `paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, FontFamily.ui`
- Active/highlighted suggestion: `backgroundColor: colors.accent + '0D'`

**Tag display on note cards** (list view):
- Small inline text after the timestamp: `FontFamily.ui, fontSize: 11, color: colors.accent, opacity: 0.7`
- Prefix with `#`: e.g., `3 days ago  #sermon  #faith`
- Max 2 tags shown, then `+N more`

**Tag picker** (from toolbar or more menu):
- Bottom sheet with existing tags as a wrap-layout of tappable pills
- Each tag pill: same styling as category pills but slightly smaller (height: 28px, fontSize: 12)
- Active (selected) tags use accent fill; inactive use button background
- "New tag" text input at top of the sheet

### 7. Empty State (Notebook has no notes)

**Design**: Warm, encouraging, brand-consistent. No generic illustration. Use the existing pattern from the journal empty state but adapted.

```
┌────────────────────────────────────────┐
│                                        │
│                                        │
│       [NotepadIcon, 40px,              │
│        color: colors.accent,           │
│        weight: "light",                │
│        opacity: 0.5]                   │
│                                        │
│    "Your notebook awaits."             │  <- FontFamily.display, 24px
│                                        │
│    Sermon notes, study reflections,    │  <- FontFamily.body, 15px
│    quiet time thoughts — capture       │     color: colors.textMuted
│    it all in one place.                │     lineHeight: 22, textAlign: center
│                                        │
│    ┌──────────────────────────────┐    │
│    │ [ghost skeleton card]        │    │  <- opacity: 0.4, same as journal
│    │ [mimics a real note card]    │    │     empty state ghost card
│    └──────────────────────────────┘    │
│                                        │
│       [ Write your first note ]        │  <- TouchableOpacity, accent bg
│                                        │     borderRadius: 12, py: 14, px: 24
│                                        │     FontFamily.uiMedium, 15px, white
│                                        │
└────────────────────────────────────────┘
```

**CTA button styling**:
```typescript
{
  backgroundColor: colors.accent,
  borderRadius: 12,
  paddingVertical: 14,
  paddingHorizontal: 24,
  alignSelf: 'center',
  marginTop: 24,
  // Shadow
  shadowColor: colors.accent,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.2,
  shadowRadius: 12,
}
```
Text: `FontFamily.uiMedium, fontSize: 15, color: '#FFFFFF'`

On tap: navigates to the note editor screen. `Haptics.impactAsync(Medium)`.

### 8. FAB (Floating Action Button)

**Placement**: Bottom-right corner, 24px from right edge, 24px above the tab bar top edge.

**Size**: 52x52px (touchable area 56x56 with hitSlop)

**Shape**: Circle, borderRadius: 26

**Styling**:
```typescript
{
  position: 'absolute',
  bottom: tabBarHeight + 24, // tabBarHeight = 56 + insets.bottom
  right: 24,
  width: 52,
  height: 52,
  borderRadius: 26,
  backgroundColor: colors.accent,
  alignItems: 'center',
  justifyContent: 'center',
  // Elevated shadow
  shadowColor: colors.accent,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 12,
  elevation: 8,
  zIndex: 100,
}
```

**Icon**: `PlusIcon size={24} color="#FFFFFF" weight="bold"`

**Animation on press**:
```typescript
// Scale down on press start, spring back on release
onPressIn: scale.value = withSpring(0.9, { damping: 15, stiffness: 300 })
onPressOut: scale.value = withSpring(1.0, { damping: 12, stiffness: 250 })
```

**Visibility**:
- Visible ONLY when "Notebook" segment is active
- Fades in when switching to Notebook: `FadeIn.duration(200).delay(100)`
- Fades out when switching to Reflections: `FadeOut.duration(150)`
- Hides when scrolling down (same pattern as tab bar hide): slide down 80px over 200ms
- Shows when scrolling up: slide up over 200ms

**Haptic**: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` on tap.

### 9. Search

**Behavior**: The existing search bar in the Journal header already searches reflections. Extend it to also search notebook notes when the search is active.

**Search results (mixed)**:
When search is active, BOTH reflections and notes are searched regardless of which segment is active. Results display in a unified list sorted by relevance/recency.

**Type indicator on results**:
- Reflection entries: Small label `FontFamily.mono, fontSize: 10, letterSpacing: 1, color: colors.textSubtle` reading "REFLECTION" with a `PencilLineIcon size={10}` prefix
- Notebook notes: Same label style reading "NOTE" with a `NoteIcon size={10}` prefix
- Placed in the metadata row of each card

**Search bar**: Same design as existing (reuse the same component):
```typescript
{
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: colors.inputBackground,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 10,
  gap: 10,
  borderWidth: 1,
  borderColor: colors.border,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 1,
}
```

### 10. Transitions & Animations

**List -> Editor transition**:
- Use `router.push('/(tabs)/(journal)/note')` with standard stack push
- The note editor enters from the right (default React Navigation push)
- Content fades in: `FadeIn.duration(400)` on the editor content area
- Title field auto-focuses after 300ms delay (gives animation time to settle)
- If creating from Bible reader or devotional, the pre-populated scripture reference fades in separately: `FadeInDown.duration(300).delay(200)`

**Editor -> List transition (back gesture)**:
- Standard iOS swipe-back gesture (handled by React Navigation native stack)
- Auto-save fires before navigation completes
- No explicit "save confirmation" needed since auto-save is continuous

**Delete confirmation**:
- Not a full modal. Use an inline confirmation within the "..." bottom sheet menu:
- Tap "Delete" -> text changes to "Tap again to delete" in `colors.error`, with a 3-second timeout to revert
- On second tap: note is deleted, `Haptics.notificationAsync(Warning)`, navigate back
- Animation: the card in the list view uses `FadeOut.duration(200)` and `Layout.springify()` so surrounding cards animate up smoothly

**Segment switch animation**:
- The sliding indicator springs to the new position (see Section 2 above)
- Content crossfades: outgoing content `FadeOut.duration(150)`, incoming content `FadeIn.duration(250).delay(50)`
- Category pills (Notebook) slide in from bottom: `FadeInDown.duration(300).delay(100)`

**FAB entrance**:
- On first render of Notebook: `FadeIn.duration(200).delay(300)` + scale from 0.8 to 1.0 via `withSpring`

---

## Part 4: Screen-by-Screen Design Specification

---

### Screen 1: Journal Hub (updated `index.tsx`)

**Component hierarchy**:
```
JournalHubScreen
├── SafeAreaView (edges=['top'])
│   ├── Header Row (title + search + FAB context)
│   │   ├── Text "Journal" (display, 34px)
│   │   └── Search toggle (MagnifyingGlassIcon / XIcon)
│   │
│   ├── Search Bar (conditional, FadeInDown)
│   │
│   ├── Segmented Control
│   │   ├── Sliding indicator (Animated.View)
│   │   ├── "Reflections" segment
│   │   └── "Notebook" segment
│   │
│   ├── ScrollView (content changes based on active segment)
│   │   │
│   │   ├── [When Reflections active] — EXISTING CODE (unchanged)
│   │   │   ├── Today's Reflection Card
│   │   │   ├── Go Deeper prompt
│   │   │   └── Past Entries list
│   │   │
│   │   └── [When Notebook active] — NEW CODE
│   │       ├── Category Pills (horizontal ScrollView)
│   │       ├── Notes List (NoteCard components)
│   │       └── Empty State (if no notes)
│   │
│   └── FAB (absolute positioned, Notebook only)
```

**Exact spacing layout (Notebook view, top to bottom)**:
```
paddingTop: 16           // above "Journal" title
"Journal" title          // 34px display font
paddingBottom: 8         // below title

marginTop: 4             // search bar (if visible)
marginBottom: 12

marginTop: 16            // segmented control
height: 36               // segmented control
marginBottom: 16

                         // Category pills
height: 32               // pill height
marginBottom: 20

                         // Notes list
paddingHorizontal: 24
gap: 10                  // between cards (marginBottom on each card)

paddingBottom: 100       // scroll bottom padding (tab bar clearance)
```

**State management**:
```typescript
const [activeSegment, setActiveSegment] = useState<'reflections' | 'notebook'>('reflections');
const [activeCategory, setActiveCategory] = useState<NoteCategory | 'all'>('all');
```

The segment state persists during the session but resets to 'reflections' on app restart (default behavior, no persistence needed).

---

### Screen 2: Note Editor (`note.tsx`)

**Route params**:
```typescript
type NoteEditorParams = {
  noteId?: string;           // If editing existing note
  devotionalId?: string;     // If created from devotional context
  dayNumber?: string;        // If created from devotional context
  bookId?: string;           // If created from Bible reader
  chapter?: string;          // If created from Bible reader
  verse?: string;            // If created from Bible reader
  verseEnd?: string;         // If created from Bible reader
  verseText?: string;        // Pre-populated verse text
  reference?: string;        // Pre-populated reference string
};
```

**Component hierarchy**:
```
NoteEditorScreen
├── KeyboardAvoidingView (flex: 1)
│   ├── SafeAreaView (edges=['top'])
│   │   ├── Header Bar (52px)
│   │   │   ├── Back button (CaretLeftIcon)
│   │   │   ├── Auto-save indicator (center-right)
│   │   │   ├── "Done" button (accent, right)
│   │   │   └── More menu (DotsThreeIcon, far right)
│   │   │
│   │   ├── ScrollView (flex: 1)
│   │   │   ├── Pre-populated Scripture Card (if from Bible/devotional context)
│   │   │   │   └── ScriptureRefPill (tappable, removable)
│   │   │   │
│   │   │   ├── Title TextInput
│   │   │   │   placeholder: "Title"
│   │   │   │   style: display, 24px
│   │   │   │
│   │   │   └── Body TextInput
│   │   │       placeholder: "Start writing..."
│   │   │       style: body, 16px, lineHeight: 26
│   │   │       multiline, auto-grow
│   │   │
│   │   └── Toolbar (above keyboard)
│   │       ├── Scripture button
│   │       ├── Bold button
│   │       ├── Italic button
│   │       ├── List button
│   │       ├── Checklist button
│   │       └── Tag button
│   │
│   └── Tag Autocomplete Dropdown (absolute, conditional)
│
├── Scripture Picker Sheet (modal bottom sheet)
├── Category Picker Sheet (from more menu)
└── Tag Picker Sheet (from more menu or toolbar)
```

**Exact spacing**:
```
SafeArea top inset
paddingTop: 4              // header breathing room
Header height: 52px
  paddingHorizontal: 16
  Back button: 40x44px
  "Done" text: right-aligned, paddingRight: 8
  More button: 40x44px

Scripture card (if present):
  marginTop: 16
  marginHorizontal: 24
  padding: 12
  marginBottom: 8

Title input:
  paddingHorizontal: 24
  paddingTop: 20 (if no scripture card) or 12 (if scripture card present)
  paddingBottom: 4

Body input:
  paddingHorizontal: 24
  paddingTop: 8
  paddingBottom: 200         // keyboard clearance

Toolbar:
  height: 44
  paddingHorizontal: 20
  paddingVertical: 8
  borderTopWidth: StyleSheet.hairlineWidth
```

**Auto-save logic**:
```typescript
const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

const debouncedSave = useCallback((title: string, content: string) => {
  if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  saveTimeoutRef.current = setTimeout(() => {
    setSaveState('saving');
    // Save to store
    if (noteId) {
      updateNote(noteId, { title, content });
    } else {
      const id = addNote({ title, content, category, tags, scriptureRefs, ... });
      setNoteId(id); // Track the created note
    }
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2000);
  }, 800);
}, [noteId, category, tags, scriptureRefs]);
```

---

### Screen 3: Note Detail — Read View (`note-detail.tsx`)

**When used**: Tapping a note card in the list opens this read-only view. User taps "Edit" to switch to the editor.

**Component hierarchy**:
```
NoteDetailScreen
├── SafeAreaView (edges=['top'])
│   ├── Header (52px)
│   │   ├── Back button (CaretLeftIcon)
│   │   ├── "Edit" button (accent color, right)
│   │   └── More menu (DotsThreeIcon)
│   │
│   └── ScrollView
│       ├── Metadata Row
│       │   ├── Category icon + label (uppercase)
│       │   ├── Dot separator
│       │   └── Date string
│       │
│       ├── Title (display, 24px)
│       │
│       ├── Accent divider line (40px width, 1.5px height)
│       │
│       ├── Scripture Reference Cards (if any)
│       │   └── [ScriptureRefPill] for each reference
│       │
│       ├── Body Content (rendered with formatting)
│       │   ├── Bold text → bodyBold
│       │   ├── Italic text → bodyItalic
│       │   ├── Bullet lists → indented with dot
│       │   ├── Checklists → circle/check icons
│       │   └── Inline #tags → accent color, tappable
│       │
│       ├── Tags Section (if any tags)
│       │   ├── Section label "TAGS" (mono, 10px, uppercase)
│       │   └── Horizontal wrap of tag pills
│       │
│       └── Linked Content (if from devotional/Bible)
│           ├── Section label "LINKED TO" (mono, 10px, uppercase)
│           └── Devotional card / Bible chapter card
```

**Exact spacing**:
```
SafeArea top inset
Header: 52px (same as editor)

ScrollView content:
  paddingHorizontal: 24
  paddingTop: 24
  paddingBottom: 40

Metadata row:
  marginBottom: 12
  Text: FontFamily.mono, 11px, letterSpacing: 1, uppercase, colors.textHint

Title:
  FontFamily.display, 24px, colors.text
  letterSpacing: -0.3
  marginBottom: 16

Accent divider:
  width: 40, height: 1.5, borderRadius: 1
  backgroundColor: colors.accent
  marginBottom: 24

Scripture refs:
  marginBottom: 16 (section)
  gap: 8 (between multiple refs)

Body content:
  FontFamily.body, 17px, colors.text
  lineHeight: 28

Tags section:
  marginTop: 32
  Label marginBottom: 12
  Pills: gap: 8, flexWrap: 'wrap'

Linked content:
  marginTop: 24
  Card: same styling as journal entry cards
```

**Category icons** (used in metadata row and cards):
```typescript
const CATEGORY_ICONS: Record<NoteCategory, { icon: ComponentType; label: string }> = {
  sermon:      { icon: MicrophoneStageIcon, label: 'Sermon' },
  'quiet-time': { icon: SunHorizonIcon,    label: 'Quiet Time' },
  study:       { icon: BookOpenIcon,        label: 'Study' },
  prayer:      { icon: HandsPrayingIcon,    label: 'Prayer' },
  general:     { icon: NoteIcon,            label: 'General' },
};
```
All icons: `size={14}, color={colors.accent}, weight="light"` in metadata contexts.

---

## Part 5: Accessibility Specification

### Keyboard Navigation
- All interactive elements (cards, pills, buttons, toolbar items) must be focusable and activatable via VoiceOver
- FAB: `accessibilityRole="button"`, `accessibilityLabel="Create new note"`
- Segmented control: `accessibilityRole="tab"`, `accessibilityState={{ selected: isActive }}`
- Category pills: `accessibilityRole="button"`, `accessibilityLabel="Filter by [category]"`, `accessibilityState={{ selected: isActive }}`
- Note cards: `accessibilityRole="button"`, `accessibilityLabel="[title], [category], [relative date], [tag list]"`
- Scripture ref pills: `accessibilityRole="link"`, `accessibilityLabel="Open [reference] in Bible reader"`
- Toolbar buttons: `accessibilityRole="button"`, `accessibilityLabel="[action name]"`, `accessibilityHint="[what it does]"`

### Color Contrast
- All text meets WCAG AA contrast ratios against its background
- The accent color used for pills/tags has been verified across all 7 accent themes to meet 4.5:1 contrast on both dark and light backgrounds
- Never use color alone to convey information (e.g., category icons PLUS labels, not just color)

### Screen Reader
- Note cards announce: title, category, preview text, date, tag count
- Empty state announces: headline, description, and CTA button
- Segmented control announces: "Reflections tab, 1 of 2" / "Notebook tab, 2 of 2"
- Auto-save indicator announces: "Note saved" when save completes (use `AccessibilityInfo.announceForAccessibility`)

### Motion
- Respect `AccessibilityInfo.isReduceMotionEnabled`:
  - Replace spring animations with `withTiming(value, { duration: 0 })`
  - Disable the FAB hide-on-scroll behavior
  - Disable the staggered FadeInDown delays (use simultaneous FadeIn instead)

---

## Part 6: Component File Map

### New files to create:
```
src/components/notebook/
├── SegmentedControl.tsx      — Animated pill-style segment toggle
├── NoteCard.tsx              — List item card for a note
├── CategoryPills.tsx         — Horizontal scroll filter pills
├── ScriptureRefPill.tsx      — Tappable verse reference pill
├── NoteEditor.tsx            — Reusable editor (title + body + toolbar)
├── EditorToolbar.tsx         — Formatting toolbar above keyboard
├── TagAutocomplete.tsx       — Dropdown for inline tag suggestions
├── TagPicker.tsx             — Bottom sheet for tag management
├── CategoryPicker.tsx        — Bottom sheet for category selection
├── NotebookEmptyState.tsx    — Empty state for notebook tab
└── ScripturePicker.tsx       — Bottom sheet for adding scripture refs

src/app/(tabs)/(journal)/
├── note.tsx                  — Note editor screen (new + edit)
└── note-detail.tsx           — Note read-only detail view
```

### Modified files:
```
src/app/(tabs)/(journal)/index.tsx   — Add segmented control, notebook view, FAB
src/lib/store.ts                     — Add Note type, notes[], actions, migration v20
src/app/(tabs)/(bible)/reader.tsx    — Update "Note" action to create notebook note
```

---

## Part 7: Animation Storyboard Summary

| Element | Trigger | Animation | Duration | Easing |
|---------|---------|-----------|----------|--------|
| Segmented indicator | Segment tap | translateX spring | ~300ms | spring(damping:18, stiff:200) |
| Content crossfade | Segment switch | FadeOut -> FadeIn | 150ms + 250ms | linear |
| Category pills | Notebook enters | FadeInDown | 300ms, delay 100ms | ease-out |
| Note cards | List render | FadeInDown staggered | 600ms, delay 50ms*i | ease-out |
| FAB | Notebook enters | FadeIn + scale spring | 200ms + spring | spring |
| FAB | Scroll down | translateY slide | 200ms | ease-in |
| FAB | Tap | Scale 0.9 -> 1.0 | spring | spring(damping:15) |
| Note card delete | Delete confirmed | FadeOut | 200ms | linear |
| Auto-save check | Save complete | FadeIn -> hold -> FadeOut | 200ms, 1.5s hold, 300ms | linear |
| Editor content | Screen enter | FadeIn | 400ms | linear |
| Tag autocomplete | # typed | FadeIn + scaleY from 0.95 | 150ms | ease-out |
| Scripture picker | Toolbar tap | Bottom sheet spring | ~350ms | spring |
| Search bar | Toggle | FadeInDown | 300ms | ease-out |

---

## Part 8: Implementation Priority (Phase 1 Build Order)

Build in this order to get a working feature as fast as possible:

1. **Store changes** (`store.ts`): Add `Note` interface, `notes: []`, `addNote`, `updateNote`, `deleteNote`, migration to v20
2. **SegmentedControl** component: The toggle that gates the feature
3. **Journal Hub update** (`index.tsx`): Wire up segmented control, keep Reflections content, add Notebook placeholder
4. **NotebookEmptyState**: First thing users see, validates the segment works
5. **NoteEditor + EditorToolbar**: The core writing experience
6. **Note route** (`note.tsx`): Wire editor to route with params
7. **NoteCard**: List item component
8. **CategoryPills**: Filter bar
9. **Notebook list view**: Wire NoteCard + CategoryPills into the hub
10. **FAB**: Floating action button
11. **NoteDetail** (`note-detail.tsx`): Read view
12. **ScriptureRefPill**: Tappable verse links
13. **Bible reader integration**: Update "Note" button in reader.tsx
