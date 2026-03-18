# Mobile Reading App UX Best Practices
## Research for Unfold Bible Reader Implementation

**Date:** 2026-03-14
**Scope:** Kindle, Apple Books, Instapaper, Pocket, Medium, Substack, YouVersion, Blue Letter Bible
**Goal:** Actionable patterns for a React Native (Expo SDK 55) Bible reader

---

## 1. Typography for Mobile Reading

### Serif vs. Sans-Serif: The Research

The old rule "sans-serif for screens" is outdated on modern high-DPI displays. Current research shows:

- **Serif fonts work well for long-form reading** on Retina/OLED screens. Google chose **Literata** specifically for Google Play Books because it was designed from scratch for digital screen rendering.
- **Sans-serif fonts still win for UI chrome** (buttons, labels, navigation). Their clean lines render well at small sizes.
- **Individuated research** (ACM TOCHI, 2022) found participants' reading speeds increased by **35% between fastest and slowest fonts** without affecting comprehension -- meaning font choice is highly personal.
- **Lexend** (by Dr. Bonnie Shaver-Troup) shows **10-20% reading speed improvements** through mathematically optimized letter spacing and proportions.

### Optimal Metrics

| Property | Recommended Value | Notes |
|---|---|---|
| **Body font size** | 17-20px (default 18px) | Kindle defaults to ~18px equivalent |
| **Min font size** | 14px | Below this, readability drops sharply |
| **Max font size** | 28-32px | For accessibility / low vision |
| **Line height** | 1.5-1.6x font size | 18px font = 27-29px line height |
| **Paragraph spacing** | 2x font size | Clear visual separation between paragraphs |
| **Line length** | 45-75 characters | Optimal for tracking line-to-line |
| **Letter spacing** | 0.12x font size minimum | Improves readability for dyslexic users |
| **Contrast ratio** | 4.5:1 minimum | WCAG AA standard |

### Font Recommendations for Unfold Bible Reader

**Already installed in project (package.json):**
- `@expo-google-fonts/crimson-text` -- Beautiful transitional serif, great for scripture
- `@expo-google-fonts/eb-garamond` -- Classic old-style serif, scholarly feel
- `@expo-google-fonts/lora` -- Well-balanced serif for extended screen reading
- `@expo-google-fonts/merriweather` -- Specifically designed for screens, tall x-height
- `@expo-google-fonts/source-serif-pro` -- Adobe's screen-optimized serif
- `@expo-google-fonts/instrument-serif` -- Display serif (better for headings)
- `@expo-google-fonts/inter` -- Clean sans-serif for UI elements

**Recommended additions:**
- `@expo-google-fonts/literata` -- Google Play Books' font, purpose-built for digital reading
- `@expo-google-fonts/lexend` -- Backed by academic research, optimized for reading fluency
- `OpenDyslexic` (self-hosted OTF) -- Weighted bottoms prevent letter flipping, free SIL-OFL license

### How Kindle and Apple Books Handle Font Customization

**Kindle** offers:
- Font family picker (Bookerly default, plus Amazon Ember, Baskerville, etc.)
- Custom font upload support (OTF/TTF)
- Font size slider (14 steps)
- Boldness/weight slider (independent of size)
- Line spacing (3 options: compact, normal, wide)
- Margin width (3 options)
- Enhanced Typesetting: automatic kerning, refined layout for large fonts, auto line-spacing optimization

**Apple Books** offers:
- Font family picker (6-8 options)
- Page themes: Original, Quiet, Paper, Bold, Calm, Focus
- Font size buttons (A- / A+)
- Bold text toggle
- Line spacing and word spacing sliders
- Text justification toggle
- Multi-column toggle

### Implementation Plan for Unfold

```
ReaderSettings = {
  fontFamily: 'merriweather' | 'lora' | 'crimsonText' | 'ebGaramond' | 'sourceSerifPro' | 'lexend' | 'openDyslexic',
  fontSize: 14-32 (step 2, default 18),
  lineHeightMultiplier: 1.3 | 1.5 | 1.6 | 1.8 (default 1.5),
  fontWeight: 'normal' | 'medium' (not full boldness slider -- keep simple),
  textAlign: 'left' | 'justify',
  marginHorizontal: 16 | 24 | 32 (default 24),
}
```

Store in Zustand with MMKV persistence. Respect these in a `useReaderStyles()` hook that returns computed `StyleSheet` values.

---

## 2. Touch Interactions for Text

### How iOS Handles Text Selection (Native UIKit)

- **Tap**: Place cursor at tap point
- **Long press (~500ms)**: Select word under finger, show grab handles + context menu
- **Double tap**: Select word
- **Triple tap**: Select paragraph (iOS 12+)
- **Drag handles**: Extend/contract selection
- **3D Touch / long press on keyboard area**: Trackpad mode for precision cursor placement
- **iOS 17+ UITextSelectionDisplayInteraction**: Provides selection UI (cursor, range highlight, handles) without requiring full gesture implementation

### How Kindle Handles Highlighting

1. **Long press** on first word until it underlines
2. **Drag** to extend selection (text inverts: white on black)
3. **Release** -> floating toolbar appears above selection with:
   - 4 highlight color dots (yellow, blue, pink, orange)
   - Note icon
   - Share icon
   - Copy icon
   - Search/Dictionary icon
4. **Tap highlighted text** later to edit: resize handles appear + option to change color or delete
5. Smart behaviors: single-word selection shows dictionary first; paragraph selection shows summary/gist

### Bible App Verse Selection Patterns

**YouVersion:**
- Tap anywhere in a verse -> entire verse selects (verse-level granularity, not word-level)
- Panel slides up with: Highlight (color picker), Bookmark, Share, Compare (translations), Copy
- Simple, fast, low-friction

**Blue Letter Bible:**
- Tap verse number -> verse highlights
- Cross-reference panel with TSK (Treasury of Scripture Knowledge) -- far richer than YouVersion
- Interlinear view: tap any word -> original Hebrew/Greek, Strong's number, morphology
- Trade-off: powerful but cluttered UI

### Context Menu Design Pattern

Best practice from reading apps (ordered by frequency of use):

```
Primary actions (always visible):
  [Highlight]  [Note]  [Copy]  [Share]

Secondary actions (overflow or second row):
  [Define]  [Cross-Reference]  [Compare Translations]  [Listen]

Bible-specific:
  [View in Context]  [Add to Collection]  [Pray This]
```

### Implementation Notes for React Native

**Option A: Native Text Selection (Recommended for Unfold)**

Use `react-native-webview` (already installed at v13.16.0) to render scripture in HTML. This gives:
- Native text selection via WebKit/Blink
- Custom context menus via `menuItems` prop + `onCustomMenuSelection`
- CSS-based highlighting with JavaScript bridge for color persistence
- Full control over typography via CSS

**Option B: React Native Selectable Text**

`@rob117/react-native-selectable-text` supports:
- `menuItems` (custom context menu actions)
- `highlights` (array of text ranges)
- `highlightColor`
- `onSelection` callbacks
- Caveat: Does NOT work in Expo Go. Requires dev-client build (which Unfold already uses).

**Recommendation:** Go WebView for the Bible reader. Rendering scripture as HTML gives maximum typography control, native text selection, CSS highlighting, and the ability to handle verse-level tap targets via injected JavaScript. Communicate between WebView and React Native via `postMessage` / `onMessage`.

---

## 3. Reading Mode / Focus Mode

### Distraction Minimization Patterns

**Pocket's approach (gold standard):**
- Status bar, navigation bar, and all in-app chrome fade away as user scrolls
- Single tap on content area brings controls back
- No ads, no popups, nothing but text
- Toolbar appears at top with: font settings, listen, share

**Kindle's approach:**
- Tap center of screen: show/hide top bar (book title, progress) and bottom bar (page slider, settings)
- Tap left edge: previous page
- Tap right edge: next page
- All chrome disappears while reading

**Apple Books:**
- Similar tap-to-reveal pattern
- Progress shown as subtle page number at bottom center
- "X minutes left in chapter" text appears at chapter boundaries

### Progress Indicators

**Types used in reading apps:**

1. **Percentage bar** (thin line at top of screen) -- Kindle, Medium
2. **"X min read"** at article start -- Medium, Substack, Pocket
3. **"X minutes left in chapter"** -- Apple Books, Kindle
4. **Page X of Y** -- Apple Books
5. **Chapter dots/progress** -- visual chapter map showing current position
6. **Scroll-linked progress bar** -- Instapaper, web readers

**Calculation:**
- Average reading speed: 200-250 WPM (use 230 as default)
- Count words in chapter/section
- `timeRemaining = wordsRemaining / 230`
- Can personalize: track actual reading speed over sessions, adjust

### Scroll vs. Paginated

| Factor | Scroll | Paginated |
|---|---|---|
| **Feels natural on mobile** | Yes (phone default) | Yes (book default) |
| **Place-keeping** | Harder -- no fixed reference points | Easier -- page numbers |
| **Long sessions** | Better for short content (<5 min) | Better for long content (books, chapters) |
| **Highlighting** | Easier (text is always in DOM) | Harder (need to handle cross-page selections) |
| **Performance** | Risk of memory issues with very long content | Fixed content per page |
| **Bible-specific** | Good for devotional-length content | Good for extended reading/study |
| **Bookmarking** | Need to track scroll position (fragile) | Track page number (robust) |

**Recommendation for Unfold:** Use **scroll** for devotional readings (short, 3-5 min) and offer an optional **paginated mode** for the full Bible reader (longer reading sessions). Implement scroll as the default since most of Unfold's content is devotional-length.

### Implementation Pattern

```
// Immersive reading mode
- On scroll down: fade out header + bottom tab bar (Animated.timing, 200ms)
- On scroll up: fade them back in
- On tap (no scroll): toggle chrome visibility
- Progress bar: thin 2px line at very top of screen, persists even in immersive mode
- "X min remaining" label: fade in at chapter start, fade out after 3 seconds
```

---

## 4. Color Themes for Reading

### Standard Theme Set

Every major reading app offers at minimum these four:

| Theme | Background | Text | Use Case |
|---|---|---|---|
| **Light** | #FFFFFF | #1A1A1A | Bright environments |
| **Sepia** | #F5E6CA | #5B4636 | Warm, reduced eye strain (25% lower radiance than white) |
| **Dark** | #1C1C1E | #E5E5E7 | Low light, evening reading |
| **OLED Black** | #000000 | #C8C8C8 | True black for AMOLED battery savings |

**Extended themes (Kindle also offers):**
- **Green**: #D4E8D0 background, dark green text -- reportedly comfortable for long reading sessions

### Critical: OLED Black Mode Considerations

Research shows true black (#000000) has trade-offs:
- **Pro**: Real power savings on OLED (pixels fully off)
- **Con**: "Black smearing" -- pixels struggle to activate from fully off during scrolling
- **Con**: "Halation effect" -- white text bleeds into black, especially for people with astigmatism
- **Recommendation**: Offer OLED Black as a separate option from regular Dark. Use dark gray (#1C1C1E or #121212) as the default dark mode.

**Dark mode text color should be slightly dimmed** -- not pure #FFFFFF. Use #E5E5E7 or #D1D1D6 to reduce contrast harshness.

### Highlight Colors Per Theme

This is a commonly overlooked problem. Highlights that work in light mode become unreadable in dark mode.

| Highlight Color | Light Mode BG | Dark Mode BG |
|---|---|---|
| **Yellow** | #FFF3B0 | #665C00 |
| **Blue** | #B3D9FF | #003366 |
| **Pink** | #FFB3C6 | #660033 |
| **Green** | #B3FFB3 | #006600 |
| **Orange** | #FFD9B3 | #664400 |

**Rule**: In dark mode, use deeper/darker versions of highlight colors with higher saturation. The highlight should be a subtle background tint, not a bright overlay.

### Implementation

```typescript
// Theme type
type ReaderTheme = 'light' | 'sepia' | 'dark' | 'oledBlack';

const READER_THEMES = {
  light: {
    background: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#6B6B6B',
    highlights: { yellow: '#FFF3B0', blue: '#B3D9FF', pink: '#FFB3C6', green: '#B3FFB3' },
  },
  sepia: {
    background: '#F5E6CA',
    text: '#5B4636',
    textSecondary: '#8B7355',
    highlights: { yellow: '#E8D78B', blue: '#A3C4D9', pink: '#D9A3B3', green: '#A3D9A3' },
  },
  dark: {
    background: '#1C1C1E',
    text: '#E5E5E7',
    textSecondary: '#8E8E93',
    highlights: { yellow: '#665C00', blue: '#003366', pink: '#660033', green: '#006600' },
  },
  oledBlack: {
    background: '#000000',
    text: '#C8C8C8', // slightly dimmed to reduce halation
    textSecondary: '#6B6B6B',
    highlights: { yellow: '#4D4500', blue: '#002244', pink: '#4D0026', green: '#004D00' },
  },
};
```

---

## 5. Gesture Patterns

### Standard Reading App Gestures

| Gesture | Action | Used By |
|---|---|---|
| **Tap right edge** | Next page | Apple Books, Kindle |
| **Tap left edge** | Previous page | Apple Books, Kindle |
| **Tap center** | Toggle controls/chrome | Apple Books, Kindle, Pocket |
| **Swipe left** | Next page | Apple Books, Kindle |
| **Swipe right** | Previous page / go back | Apple Books, Kindle |
| **Swipe up/down** | Scroll content | Pocket, Medium, Instapaper |
| **Long press text** | Select text / highlight | All |
| **Pinch out** | Increase font size | Apple Books |
| **Pinch in** | Decrease font size | Apple Books |
| **Pull down** | Show settings/controls | Instapaper |
| **Double tap** | Bookmark (some apps) | Kindle |

### Edge Tap Zones (Apple Books Model)

```
|  <-20%->  |  <---60%--->  |  <-20%->  |
|  PREV     |   TOGGLE UI   |   NEXT    |
|  PAGE     |   CONTROLS    |   PAGE    |
```

### Implementation for Unfold (Scroll-Based Reader)

Since the primary reader will be scroll-based for devotionals:

```
Gestures to implement:
1. Scroll: natural content scrolling (default)
2. Tap on text: verse selection (for Bible reader mode)
3. Long press on text: text selection + context menu
4. Swipe right from left edge: navigate back (React Navigation default)
5. Tap top/bottom areas: toggle chrome visibility
6. Pinch: font size adjustment (nice-to-have, lower priority)

For paginated Bible reader mode (future):
7. Swipe left/right: chapter navigation
8. Edge taps: page navigation (left 20% = back, right 20% = forward)
```

Use `react-native-gesture-handler` (already installed) for custom gesture recognizers. The `PanGestureHandler` and `TapGestureHandler` can be composed for the edge-tap and swipe patterns.

---

## 6. Animation and Transitions

### Page Turn Animations

**Status in the industry:**
- Apple Books: Brought back "curl" page turn animation in iOS 16.4 as default. Users are split -- some love the tactile feel, others find it gimmicky.
- Kindle: Simple slide transition (no curl). Focus on speed over delight.
- Most modern readers: Slide or crossfade transitions.

**Recommendation**: Skip curl animation. Use a simple **slide or crossfade** for chapter transitions. The curl animation is technically complex in React Native and adds little value for a Bible reader.

### Smooth Scrolling

Critical finding from research: **Low framerate and inconsistent stuttering causes reading nausea.** Prioritize:
- 60fps scrolling at all times
- Use `FlatList` or `FlashList` for long content (not a giant ScrollView)
- Avoid heavy re-renders during scroll (use `React.memo`, extract scroll handlers)
- Test on lower-end devices

### Recommended Animations

```
1. Chapter transition: Animated.timing crossfade (300ms, easeInOut)
2. Chrome show/hide: Animated.timing opacity (200ms)
3. Progress bar: Animated width transition (smooth, spring-based)
4. Highlight creation: backgroundColor fade-in (200ms)
5. Context menu: Scale from 0.95 + opacity (150ms, spring)
6. Theme change: Animated.timing on all colors (400ms, smooth crossfade)
7. Font size change: Layout animation (LayoutAnimation.configureNext)
```

### Loading States

- **Skeleton screens** for chapter loading (not spinners)
- **Progressive rendering**: Show first paragraph immediately, load rest
- **Prefetch**: When user is 80% through a chapter, prefetch the next one
- **Offline-first**: Cache Bible text locally (SQLite via expo-sqlite, already installed)

---

## 7. Accessibility

### VoiceOver / TalkBack Support

**React Native accessibility props to use:**

```typescript
// Every interactive element needs:
accessibilityLabel="Verse 16: For God so loved the world..."
accessibilityRole="text" // or "button" for tappable verses
accessibilityHint="Double tap to select this verse"

// For the reader container:
accessibilityRole="article"
accessibilityLabel="Chapter 3 of the Gospel of John"

// For controls:
accessibilityLabel="Next chapter"
accessibilityRole="button"

// For progress:
accessibilityRole="progressbar"
accessibilityValue={{ min: 0, max: 100, now: 45 }}
```

### Dynamic Type / System Font Size

React Native respects system font size by default via `PixelRatio.getFontScale()`:
- iOS range: 0.823x to 3.0x+ (with Larger Accessibility Sizes)
- Android range: 0.85x to 1.3x

**Implementation rules:**
1. **DO respect system font scaling** for body text in the reader
2. **Cap scaling for UI elements**: Use `maxFontSizeMultiplier={1.5}` on navigation labels, buttons
3. **Test at 200% font scale** -- ensure layouts don't break
4. The reader's own font size setting should **multiply with** system scale, not override it
5. Use `allowFontScaling={true}` (default) for all reader text
6. Use `PixelRatio.getFontScale()` to detect if user has large text enabled, and adjust layouts accordingly

### Reduced Motion

React Native Reanimated (already installed at v4.2.1) provides:

```typescript
import { useReducedMotion } from 'react-native-reanimated';

function ReaderTransition() {
  const reducedMotion = useReducedMotion();

  // If reduced motion: use instant transitions or simple opacity fades
  // If not: use spring animations, slide transitions
  const duration = reducedMotion ? 0 : 300;
}
```

**Rules:**
- `useReducedMotion()` returns boolean from system accessibility settings
- When true: replace all transform animations (slide, scale, rotate) with opacity fades
- Keep subtle opacity transitions even with reduced motion -- they're still comfortable
- `ReducedMotionConfig` component can globally disable animations when setting is active

### High Contrast Mode

- Ensure all text meets WCAG AA (4.5:1 ratio for normal text, 3:1 for large text)
- Test each theme's highlight colors against the background
- Provide a "High Contrast" toggle that bumps contrast ratios:
  - Light theme: #000000 text on #FFFFFF (from #1A1A1A)
  - Dark theme: #FFFFFF text on #000000 (from #E5E5E7 on #1C1C1E)
  - Sepia theme: #3B2616 text (from #5B4636)

---

## 8. Bible-Reader-Specific Patterns

### Verse-Level Interaction Model

Based on YouVersion's successful pattern (simple, fast) enhanced with Blue Letter Bible's depth:

```
Tap verse -> verse highlights with accent color
  -> Bottom sheet slides up with:
     Row 1: [Highlight colors: yellow, blue, pink, green]
     Row 2: [Copy] [Share] [Note] [Bookmark]
     Row 3: [Cross-References] [Original Language] [Compare]

Long press verse -> native text selection within verse
  -> Custom context menu: [Highlight] [Copy] [Note] [Share]
```

### Chapter Navigation

```
Top header (fade on scroll):
  [< Back]  "John 3"  [Chapters] [Settings]

Bottom bar (fade on scroll):
  [< Chapter 2]  "Verse 16 of 36"  [Chapter 4 >]

  Thin progress bar showing position in chapter
```

### Reading Plans Integration

For Unfold's devotional context:
- Show the devotional reflection/commentary ABOVE or BELOW the scripture passage
- Clear visual separation between AI-generated content and scripture text
- Scripture text should look distinctly different (e.g., serif font, slightly indented, with verse numbers)
- "Read in context" link that opens the full chapter with the passage pre-highlighted

---

## 9. Implementation Priority

### Phase 1: Core Reader (MVP)
- [ ] WebView-based scripture renderer with CSS typography
- [ ] Font family picker (6 options from installed fonts)
- [ ] Font size slider (14-32px)
- [ ] 4 color themes (light, sepia, dark, OLED black)
- [ ] Verse tap -> highlight + bottom sheet actions
- [ ] Progress indicator (% through chapter)
- [ ] Immersive mode (chrome fades on scroll)
- [ ] Zustand + MMKV for reader preferences

### Phase 2: Enhanced Reading
- [ ] Line height and margin customization
- [ ] "X minutes remaining" calculation
- [ ] Text selection with custom context menu
- [ ] Highlight persistence (save to user's highlights collection)
- [ ] Cross-reference lookup
- [ ] Offline caching (expo-sqlite)

### Phase 3: Accessibility & Polish
- [ ] Full VoiceOver/TalkBack annotations
- [ ] Dynamic type respect
- [ ] Reduced motion support
- [ ] High contrast toggle
- [ ] Pinch-to-zoom font size
- [ ] Chapter prefetching
- [ ] OpenDyslexic font option

---

## Sources

### Typography
- [Best Fonts for Reading - Fontfabric](https://www.fontfabric.com/blog/best-fonts-for-reading/)
- [Best Fonts for Website Readability 2026](https://onewebcare.com/blog/best-fonts-for-website-readability/)
- [Best Reading Fonts Nobody Talks About - Nook](https://getnook.net/blog/best-reading-fonts-nobody-talks-about)
- [Serifs and Font Legibility - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4612630/)
- [Mobile Font Size Guide - Best Practice](https://www.islamneddar.com/blog/mobile-development/mobile-font-size-guide-best-practice)
- [Typography in Mobile Web Design - Smashing Magazine](https://www.smashingmagazine.com/2018/06/reference-guide-typography-mobile-web-design/)
- [Optimal Line Length for Readability - UXPin](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/)
- [Typography Best Practices for Mobile - Toptal](https://www.toptal.com/designers/typography/typography-for-mobile-apps)

### Font Customization
- [Kindle Reading Customization and Enhanced Typesetting](https://www.amazon.com/b/?node=11516960011)
- [How to Change Font Size on Kindle](https://www.amazon.com/gp/help/customer/display.html?nodeId=GFXBHXY4YXFNFPUE)
- [Change Book Appearance in Apple Books](https://support.apple.com/guide/books/change-a-books-appearance-ibks8923126d/mac)
- [Custom Fonts on Kindle - Designgineering](https://v3.chriskrycho.com/web/custom-fonts-on-kindle/index.html)

### Dyslexia-Friendly Fonts
- [OpenDyslexic](https://opendyslexic.org/)
- [Dyslexie Font](https://dyslexiefont.com/en/)
- [10 Best Dyslexia Friendly Fonts - Recite Me](https://reciteme.com/us/news/dyslexia-friendly-fonts/)
- [Dyslexia Fonts - OpenDyslexic & Lexend - Helperbird](https://www.helperbird.com/features/specialised-dyslexic-fonts/)

### Reading Comprehension Research
- [Different Fonts Increase Reading Speed for Different Individuals - ACM TOCHI](https://dl.acm.org/doi/10.1145/3502222)
- [Font Matters: Impact on Attention and Working Memory - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11156575/)
- [Font Matters: Investigating Typographical Components of Legibility](https://rsisinternational.org/journals/ijriss/articles/font-matters-investigating-the-typographical-components-of-legibility/)

### Touch Interactions
- [Improving Kindle Annotation Experience - Medium](https://medium.com/@gauri.chakravarti/improving-the-annotation-experience-for-kindles-app-readers-04cff7177b9b)
- [How to Highlight and Make Notes on Kindle - Tom's Guide](https://www.tomsguide.com/how-to/how-to-highlight-text-and-make-notes-on-your-kindle)
- [WWDC23: What's New with Text and Text Interactions](https://developer.apple.com/videos/play/wwdc2023/10058/)

### React Native Text Selection
- [React Native PSA: Select and Highlight Text with Custom Context Menus](https://dev.to/rob117/react-native-psa-select-and-highlight-text-with-custom-context-menus-lml)
- [Building Custom Text Selection Menu for Markdown in RN - Medium](https://medium.com/@reego7789/building-a-custom-text-selection-menu-for-markdown-content-in-react-native-944037af1ba6)
- [react-native-highlight-webview - GitHub](https://github.com/BoardVitals/react-native-highlight-webview)
- [@rob117/react-native-selectable-text - npm](https://www.npmjs.com/package/@rob117/react-native-selectable-text)

### Scroll vs. Paginated
- [Infinite Scrolling vs. Pagination - UX Planet](https://uxplanet.org/ux-infinite-scrolling-vs-pagination-1030d29376f1)
- [Pagination vs. Infinite Scroll - LogRocket](https://blog.logrocket.com/ux-design/pagination-vs-infinite-scroll-ux/)
- [Progress Indicator as Scroll Bar - UX Collective](https://uxdesign.cc/pros-and-cons-of-progress-indicator-as-a-scroll-bar-345f19967cb6)

### Color Themes
- [Which is Best for Eyes: Black on White, White on Black, or Sepia?](https://techcrawlr.com/which-is-best-for-eyes-while-reading/)
- [Dark Mode vs Light Mode: Complete UX Guide 2025](https://altersquare.io/dark-mode-vs-light-mode-the-complete-ux-guide-for-2025/)
- [Is Sepia Mode the Default Feature? - A11y Blog](https://a11y-blog.dev/en/articles/is-sepia-mode-essential/)
- [Designing a Dark Theme for OLED iPhones - Medium](https://medium.com/lookup-design/designing-a-dark-theme-for-oled-iphones-e13cdfea7ffe)
- [Best Practices for Dark Mode Colour Schemes](https://thisisglance.com/learning-centre/what-are-the-best-practices-for-dark-mode-colour-schemes)

### Gestures
- [Gesture Navigation in Mobile Apps: Best Practices](https://www.sidekickinteractive.com/designing-your-app/gesture-navigation-in-mobile-apps-best-practices/)
- [Impact of Gestures on Mobile UX - Codebridge](https://www.codebridge.tech/articles/the-impact-of-gestures-on-mobile-user-experience)
- [Tap or Swipe Mobile Gestures - Justinmind](https://www.justinmind.com/blog/tap-or-swipe-mobile-gestures-which-one-should-you-design-with/)

### Animation
- [iOS 16.4 Apple Books Page Turning Animation](https://www.idownloadblog.com/2023/03/02/ios-16-4-apple-books-page-turning-animation/)
- [Apple Page Turn Design Patent](https://www.idownloadblog.com/2012/11/17/page-turn-patent/)
- [MobileRead Forums: Page Turning Animation](https://www.mobileread.com/forums/showthread.php?t=294788)

### Accessibility
- [React Native Accessibility Docs](https://reactnative.dev/docs/accessibility)
- [React Native Accessibility Best Practices 2025](https://www.accessibilitychecker.org/blog/react-native-accessibility/)
- [React Native Reanimated Accessibility Guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/)
- [useReducedMotion - Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/)
- [Dynamic Font Scaling in React Native](https://oneuptime.com/blog/post/2026-01-15-react-native-dynamic-font-scaling/view)
- [Accessible Font Sizes - Ignite Cookbook](https://ignitecookbook.com/docs/recipes/AccessibilityFontSizes/)

### Reading Apps Design
- [Pocket Design: Reading Types Deserve the Best Type for Reading](https://medium.com/pocket-design/reading-types-deserve-the-best-type-for-reading-c348753b070b)
- [Pocket 5.4 Reader View - Pocket Blog](https://blog.getpocket.com/2014/04/our-new-reader-view-in-pocket-5-4-for-android/)
- [Instapaper vs. Pocket - Zapier](https://zapier.com/blog/instapaper-vs-pocket/)
- [Distraction-Free Reading for Android Apps - Medium](https://medium.com/@kiwiandroiddev/distraction-free-reading-for-your-android-app-part-i-242f77466175)

### Bible Apps
- [Blue Letter Bible App Review - ChristianBytes](https://www.christianbytes.com/apps-desktop-software/blue-letter-bible-app-review/)
- [YouVersion Bible App Review - ChristianBytes](https://www.christianbytes.com/apps-desktop-software/youversion-bible-app-review/)
- [14 Bible Study Apps for 2026 - The Lead Pastor](https://theleadpastor.com/tools/best-bible-study-apps/)

### Expo Fonts
- [Expo Font Documentation](https://docs.expo.dev/versions/latest/sdk/font/)
- [Expo Fonts Guide](https://docs.expo.dev/develop/user-interface/fonts/)
- [Expo Google Fonts - GitHub](https://github.com/expo/google-fonts)
