# Bible Reader Implementation Research — React Native / Expo

**Date:** 2026-03-14
**Context:** Technical research for Unfold app (Expo SDK 55, React Native 0.83, Expo Router v7)

---

## 1. Existing React Native Bible Reader Libraries & Components

### Production-Ready SDKs

**@youversion/platform-react-native** (YouVersion Official SDK)
- Provides `BibleTextView` — displays a passage with customizable font, supports entire chapters or verse ranges, and has an `onPress` handler for verse taps
- Provides `BibleReaderView` — opinionated view with book/chapter/version header, copyright footer, and YouVersion branding
- **Limitation: iOS only** (Android support "under active development")
- Requires iOS 17+ and Expo SDK 54+
- Source: https://www.npmjs.com/package/@youversion/platform-react-native

### Open-Source Bible Apps on GitHub (Reference Implementations)

| Repo | Stack | Notable Features |
|------|-------|-----------------|
| [PauloLuan/react-native-bible](https://github.com/PauloLuan/react-native-bible) | React Native | Basic Bible reader |
| [sonnylazuardi/bibleify-mobile](https://github.com/sonnylazuardi/bibleify-mobile) | RN + Rematch + Realm | Dramatized audio, offline |
| [educational-resources-and-services/bibletags-react-native-app](https://github.com/educational-resources-and-services/bibletags-react-native-app) | React Native | Tagging/annotation system |
| [brandonqueen/LevelUpBible](https://github.com/brandonqueen/LevelUpBible) | RN + RN Paper | Reading plans |
| [JH108/react-native-esvbible-app](https://github.com/JH108/react-native-esvbible-app) | React Native | ESV API integration |
| [FSPinho/bible](https://github.com/FSPinho/bible) | React Native | Daily motivational + reading |

### Key Takeaway
There is **no dominant, production-quality React Native Bible reader component library** on npm. Most implementations are custom-built. The YouVersion SDK is the closest to production-ready but is iOS-only and comes with YouVersion branding requirements. **Building a custom reader is the recommended approach** for a branded app like Unfold.

---

## 2. Offline Bible Storage Strategies

### Storage Format Comparison

| Format | Pros | Cons | Best For |
|--------|------|------|----------|
| **SQLite** | Fast queries, FTS5 search, relational, industry standard | Slightly more setup | Primary Bible text + search |
| **Bundled JSON** | Simple, no native deps for reading | Slow search, large in memory | Small datasets, config |
| **AsyncStorage** | Simplest API | 6MB Android limit, no queries, not for relational data | User preferences only |

### Recommended: SQLite (expo-sqlite)

**expo-sqlite** is the right choice for Unfold. Key facts:
- Ships with Expo SDK 55 — no extra native dependencies
- **FTS5 is enabled by default** (fixed in PR #27738 after SDK 50 regression). Can disable via `expo.sqlite.enableFTS=false`
- New in SDK 55: SQLite Inspector DevTools Plugin for real-time DB browsing
- New in SDK 55: Tagged template literals for type-safe parameterized queries
- Supports pre-populated databases via `SQLiteProvider` with `assetSource`

### SQLite Alternatives (If Performance Is Insufficient)

| Library | Notes |
|---------|-------|
| **op-sqlite** | JSI-based, fastest option (pure C++). Install via `npx expo install @op-engineering/op-sqlite`. Requires prebuild (no Expo Go). Best for performance-critical apps. |
| **react-native-nitro-sqlite** | Successor to react-native-quick-sqlite (which is deprecated from v9+). Nitro module implementation. |
| **expo-sqlite** | Good enough for most use cases. Similar perf to op-sqlite on iOS; varies on Android. |

**Recommendation:** Start with expo-sqlite. It is well-integrated, officially supported, and performant enough for a single-translation Bible reader. Only consider op-sqlite if benchmarking reveals issues with search or chapter loading.

### Bible Text Storage Size

| Format | Size (KJV) |
|--------|-----------|
| Plain UTF-8 text | ~4.3-5.2 MB |
| Gzip compressed | ~1.5 MB |
| SQLite database (single translation) | ~5-8 MB |
| SQLite with FTS5 index | ~10-15 MB (estimated) |
| Per translation in mobile apps (with formatting) | ~20-30 MB |

**For Unfold:** A single public-domain translation (KJV, WEB, or ASV) in SQLite with FTS5 will be approximately **10-15 MB** — very reasonable to bundle with the app.

### Shipping a Pre-Populated Database

**expo-sqlite supports this natively.** Steps:

1. **Add `.db` to Metro asset extensions** in `metro.config.js`:
   ```js
   const { getDefaultConfig } = require('expo/metro-config');
   const defaultConfig = getDefaultConfig(__dirname);
   defaultConfig.resolver.assetExts.push('db');
   module.exports = defaultConfig;
   ```
   *(Note: Unfold's CLAUDE.md forbids editing metro.config.js — this would need special handling, possibly via an Expo config plugin or copying the DB at runtime instead.)*

2. **Use SQLiteProvider with assetSource:**
   ```jsx
   <SQLiteProvider
     databaseName="bible.db"
     assetSource={{ assetId: require('./assets/bible.db') }}
   >
     {children}
   </SQLiteProvider>
   ```

3. **Alternative approach (avoids metro.config.js changes):** Download the DB on first launch using `expo-file-system` and copy it to the document directory. This keeps the initial binary smaller and avoids the metro config constraint.

---

## 3. Bible Text Data Sources (For Offline Bundling)

### Best Free/Public Domain Sources

| Source | Format | Translations | License |
|--------|--------|-------------|---------|
| [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | SQLite, SQL | 140+ translations, cross-references | Free |
| [godlytalias/Bible-Database](https://github.com/godlytalias/Bible-Database) | SQLite, JSON, XML, SQL | Multiple languages | Free ("Freely received, freely give") |
| [wldeh/bible-api](https://github.com/wldeh/bible-api) | JSON (CDN) | 200+ versions | MIT License |
| [getbible/v2](https://github.com/getbible/v2) | JSON (API + GitHub) | 100+ translations | Free, no API key |
| [seven1m/open-bibles](https://github.com/seven1m/open-bibles) | USFX, OSIS, Zefania XML | KJV, BBE, OEB, WEB | Public domain |
| [Bible SuperSearch](https://sourceforge.net/projects/biblesuper/files/All%20Bibles%20-%20SQLite%203/) | SQLite 3 | Multiple | Free |
| [hackathon.bible](https://hackathon.bible/data/) | Various | Various | Free for development |
| [bible-api.com](https://bible-api.com/) | JSON API | Limited | Free (15 req/30s rate limit) |
| [API.Bible](https://scripture.api.bible/) | JSON API | ~1500 versions | Free for non-commercial; $10/mo per commercial translation |

### Recommended Data Source for Unfold

**scrollmapper/bible_databases** — provides ready-to-use SQLite databases with a clean schema. The 2025 branch has an updated schema. Download the KJV or WEB (World English Bible, fully public domain) SQLite file and bundle it.

### Database Schema (scrollmapper)

**Verses table:**
- `id` (INT, primary key)
- `book_id` (INT, FK to books table)
- `chapter` (INT)
- `verse` (INT)
- `text` (TEXT)

**Books table:**
- `id` (INT, primary key)
- `name` (TEXT — e.g., "Genesis", "John")

**Cross-references table:**
- `id`, `from_book`, `from_chapter`, `from_verse`, `to_book`, `to_chapter`, `to_verse_start`, `to_verse_end`, `votes`

### Alternative Schema (godlytalias — simpler)

Single `bible` table:
- `Book` (INT — starts from 0)
- `Chapter` (INT — starts from 1)
- `Versecount` (INT — starts from 1)
- `Verse` (VARCHAR — the text)

### Bible Data Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| **OSIS** (Open Scripture Information Standard) | XML-based standard | Interchange, reference |
| **USFM** (Unified Standard Format Markers) | Markup for Bible text | Translation workflows |
| **USX** | XML version of USFM | Digital publishing |
| **JSON** | Key-value structured | Web/mobile apps |
| **SQLite** | Relational database | Mobile offline storage |

---

## 4. Verse Selection and Highlighting Implementation

### Approach A: Individual Verse TouchableOpacity (Recommended for Unfold)

Render each verse as a separate `TouchableOpacity` component. This is the simplest and most reliable approach for Bible apps:

```
<TouchableOpacity onPress={() => selectVerse(verseNum)}>
  <Text>
    <Text style={styles.verseNumber}>{verseNum} </Text>
    <Text style={isHighlighted ? highlightStyle : null}>{verseText}</Text>
  </Text>
</TouchableOpacity>
```

**Pros:** Simple, reliable, works with Unfold's existing TouchableOpacity pattern
**Cons:** No drag-to-select, no partial verse selection

### Approach B: rn-text-touch-highlight (Tap-and-Drag)

- **Library:** [rn-text-touch-highlight](https://github.com/benjamineruvieru/rn-text-touch-highlight)
- Enables tap-and-drag to highlight text ranges
- Requires `react-native-reanimated` and `react-native-gesture-handler` (both already in Unfold)
- Supports: highlight colors, initial highlights array, callbacks for start/end/tap
- Best for: note-taking apps, document annotation, partial verse selection

### Approach C: react-native-selectable-text (Custom Context Menus)

- **Library:** [@rob117/react-native-selectable-text](https://www.npmjs.com/package/@rob117/react-native-selectable-text) (maintained fork)
- Drop-in replacement for `<Text>` that captures selection
- Supports custom menu items (Highlight, Copy, Share, Note)
- `onSelection` callback returns: selected text, positions, menu item tapped
- Supports `highlights` prop with array of ranges + colors for persisting highlights

### Multi-Verse Selection Pattern

For Bible reading, the most intuitive pattern (used by YouVersion, Logos, etc.):
1. **Tap a verse** → verse is selected (highlighted in accent color)
2. **Tap another verse** → range from first to second is selected
3. **Action bar appears** at bottom with: Highlight, Bookmark, Copy, Share, Note
4. **Tap outside** or dismiss → deselect

This is best implemented with Approach A (individual verse touchables) + state management for selection range.

### Persisting Highlights

**Schema for highlights table (SQLite):**
```sql
CREATE TABLE highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#FFEB3B',  -- hex color
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_highlights_location ON highlights(book_id, chapter);
```

**Schema for bookmarks table:**
```sql
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Schema for notes table:**
```sql
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Context Menu for Verses

**Recommended: zeego** ([github.com/nandorojo/zeego](https://github.com/nandorojo/zeego))
- Native iOS context menus (UIMenu) + Android support
- Clean API inspired by Radix UI
- Supports submenus, checkable items, icons
- **Requires prebuild** (no Expo Go) — not an issue since Unfold uses dev builds
- Alternative: `@expo/react-native-action-sheet` for a bottom sheet approach (may feel more natural on mobile)

---

## 5. Text Rendering for Readability

### Verse Number Styling (Superscript)

React Native doesn't have native superscript support. Best approach:

```jsx
<Text style={styles.verseText}>
  <Text style={styles.verseNumber}>{verse.number} </Text>
  {verse.text}
</Text>
```

Where `styles.verseNumber`:
```js
verseNumber: {
  fontSize: baseFontSize * 0.6,
  lineHeight: baseFontSize * 0.8,
  color: '#999',  // muted
  fontWeight: '600',
}
```

For true superscript alignment, wrap in a flex row with `alignItems: 'flex-start'`.

### Paragraph Mode vs. Verse-Per-Line

**Verse-per-line:** Each verse is a separate row. Easier to tap/select. Better for study.
**Paragraph mode:** Verses flow as continuous text with inline superscript numbers. Better for reading.

Implementation: Toggle between two rendering modes via a state variable. In paragraph mode, concatenate all verses in a chapter into a single `<Text>` component with nested `<Text>` elements for verse numbers. In verse-per-line mode, use a `FlashList` or `ScrollView` with each verse as a separate item.

### Dynamic Font Sizing

- Use `maxFontSizeMultiplier` on Text components to respect system accessibility settings
- Provide in-app font size slider (store value in Zustand)
- **Body text:** allow up to 2x scaling
- **Headings:** cap at 1.3-1.5x scaling
- Use `react-native-size-matters` for responsive scaling across devices
- Always wrap reading content in `ScrollView` (not `View`) to handle overflow from large fonts

### Line Height and Spacing Best Practices

- **Line height:** 1.6-1.8x font size for comfortable reading
- **Letter spacing:** 0.3-0.5 for body text
- **Paragraph spacing:** 12-16px between verse groups
- **Horizontal padding:** 20-24px on each side
- **Max content width:** ~600px (readable on tablets)

### Chapter Rendering: ScrollView vs. FlatList vs. FlashList

| Component | Best For | Why |
|-----------|----------|-----|
| **ScrollView** | Single chapter (<200 verses) | Renders all at once — fine for a single chapter. Simplest implementation. |
| **FlatList** | Not recommended for this | Virtualization causes text to "pop in" as you scroll — bad for reading |
| **FlashList** | Very long content, multiple translations side-by-side | Cell recycling = smooth scrolling, 5-10x faster than FlatList |

**Recommendation:** Use `ScrollView` for single chapter rendering (max chapter in Bible is Psalm 119 with 176 verses — not enough to warrant virtualization). Use `FlashList` for search results, book lists, or any list of many items.

---

## 6. Search Implementation

### SQLite FTS5 Full-Text Search

FTS5 is the gold standard for offline Bible search. It is **enabled by default in expo-sqlite** since SDK 50.1+.

**Setup:**
```sql
-- Create FTS5 virtual table
CREATE VIRTUAL TABLE bible_fts USING fts5(
  text,
  content='verses',
  content_rowid='id'
);

-- Populate FTS index
INSERT INTO bible_fts(rowid, text)
  SELECT id, text FROM verses;

-- Keep FTS in sync with triggers
CREATE TRIGGER verses_ai AFTER INSERT ON verses BEGIN
  INSERT INTO bible_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER verses_ad AFTER DELETE ON verses BEGIN
  INSERT INTO bible_fts(bible_fts, rowid, text) VALUES('delete', old.id, old.text);
END;

CREATE TRIGGER verses_au AFTER UPDATE ON verses BEGIN
  INSERT INTO bible_fts(bible_fts, rowid, text) VALUES('delete', old.id, old.text);
  INSERT INTO bible_fts(rowid, text) VALUES (new.id, new.text);
END;
```

**Search query:**
```sql
SELECT v.book_id, b.name, v.chapter, v.verse, v.text,
       highlight(bible_fts, 0, '<b>', '</b>') as highlighted_text
FROM bible_fts
JOIN verses v ON bible_fts.rowid = v.id
JOIN books b ON v.book_id = b.id
WHERE bible_fts MATCH ?
ORDER BY rank
LIMIT 50;
```

**FTS5 features useful for Bible search:**
- Boolean queries: `love AND faith`, `grace NOT works`
- Phrase queries: `"the lord is my shepherd"`
- Prefix queries: `right*` (matches "righteous", "righteousness", etc.)
- `highlight()` function for marking matches in results
- `rank` column for relevance ordering
- `bm25()` function for custom ranking

### Search UX Patterns

**Recommended: Debounced search-as-you-type**
- Debounce input by 300ms
- Show results in a FlashList below the search bar
- Each result shows: Book Chapter:Verse — matched text with highlights
- Tapping a result navigates to that verse in context (full chapter, scrolled to verse)

**Performance:** FTS5 queries on a single Bible translation (~31,000 verses) return in <10ms on modern devices. No need for pagination beyond a reasonable limit (50-100 results).

---

## 7. Gestures and Navigation

### Swipe Between Chapters

**Recommended: react-native-pager-view** (included in Expo SDK)
- Wraps native `UIPageViewController` (iOS) and `ViewPager` (Android)
- Smooth, native-feel swiping between pages
- `usePagerView` hook for programmatic navigation
- Expo docs: https://docs.expo.dev/versions/latest/sdk/view-pager/

**Implementation strategy:**
```
PagerView (3 pages loaded at a time)
  ├── Page 0: Previous chapter (pre-loaded)
  ├── Page 1: Current chapter (visible)
  └── Page 2: Next chapter (pre-loaded)
```

When user swipes to Page 2 (next chapter), shift the window: drop Page 0, move everything left, load new next chapter into Page 2. This gives the illusion of infinite chapters while only keeping 3 in memory.

### Pre-Loading Adjacent Chapters

- Load current + previous + next chapters from SQLite on navigation
- SQLite queries for a single chapter return in <5ms — pre-loading is nearly instant
- Store pre-loaded chapters in a ref or state to avoid re-fetching

### Book/Chapter Picker

**Recommended UX (used by YouVersion, Logos, Bible.com):**

1. **Book grid:** 2-column grid of all 66 books, grouped by Old/New Testament
   - Use `FlashList` with `numColumns={2}`
   - Color-code by category (Pentateuch, History, Poetry, Prophets, Gospels, Epistles, etc.)

2. **Chapter grid:** After selecting a book, show a grid of chapter numbers
   - Simple `FlashList` with `numColumns={5}` or `numColumns={6}`
   - Highlight current chapter

3. **Navigation flow:** Bottom sheet or modal with two steps (book → chapter)
   - Use `@gorhom/bottom-sheet` (already in Unfold)

**Alternative:** Wheel picker (`@quidone/react-native-wheel-picker`) for a more compact picker — but grid is more standard and faster for quick navigation.

---

## 8. Deep Linking for Bible Verses

### URL Scheme Design for Unfold

**Internal routing (Expo Router):**
```
File structure:
app/(tabs)/(bible)/[book]/[chapter].tsx
```

**Deep link format:**
```
unfold://bible/john/3?verse=16
unfold://bible/genesis/1
unfold://bible/psalm/119?verse=105&highlight=true
```

**Expo Router configuration (app.json):**
```json
{
  "expo": {
    "scheme": "unfold"
  }
}
```

**Universal links (for sharing):**
```
https://unfold.app/bible/john/3/16
https://unfold.app/bible/psalm/119/105
```

### How Other Bible Apps Structure Deep Links

| App | URL Scheme |
|-----|-----------|
| YouVersion | `youversion://bible?reference=JHN.1.1` (OSIS abbreviations) |
| Equipd Bible | `equipd://...` |
| Common Bible Share Sheet | `bible-appname://` (proposed standard) |

### Common Bible Share Sheet Standard

The [Common_Bible_Share_Sheet](https://github.com/Verses/Common_Bible_Share_Sheet) project proposes a standard URL scheme for inter-app Bible sharing with four intentions: **Read, Study, Memorize, Listen**. Uses OSIS reference standard. Worth implementing for interoperability.

### OSIS Book Abbreviations (Standard)

| Book | OSIS | Book | OSIS |
|------|------|------|------|
| Genesis | Gen | Matthew | Matt |
| Exodus | Exod | Mark | Mark |
| Psalms | Ps | Luke | Luke |
| Proverbs | Prov | John | John |
| Isaiah | Isa | Acts | Acts |
| Jeremiah | Jer | Romans | Rom |
| ... | ... | Revelation | Rev |

Use these for deep link `reference` parameters for maximum interoperability.

---

## 9. Performance Considerations

### Rendering Long Chapters

- Longest chapter: Psalm 119 (176 verses) — `ScrollView` handles this fine
- Average chapter: 20-30 verses — trivial for any approach
- **Do NOT use FlatList for chapter text** — virtualization causes visible pop-in during reading

### Pre-Loading Strategy

```
On mount: Load chapters N-1, N, N+1 from SQLite
On swipe to N+1: Load N+2, update pager
On swipe to N-1: Load N-2, update pager
```

SQLite read for a single chapter: <5ms. Pre-loading is effectively instant.

### Memory Management

- One Bible translation in SQLite: ~5-8 MB on disk
- One chapter in memory (as JS objects): ~10-50 KB
- Three chapters (for pager): ~30-150 KB
- FTS5 index: ~5-10 MB additional
- **Total memory impact: negligible**

For multiple translations:
- Each additional translation: ~5-8 MB disk
- Download translations on-demand (don't bundle all)
- Only load one translation into FTS5 at a time (or create separate FTS tables)

### Optimization Tips

1. **Use `useMemo`** for verse rendering arrays to avoid re-computation
2. **Use `useCallback`** for verse press handlers
3. **Batch SQLite operations** in transactions when writing highlights/bookmarks
4. **Use WAL mode** for better write performance: `PRAGMA journal_mode=WAL;`
5. **Index** the verses table on `(book_id, chapter)` for fast chapter loads

---

## 10. Recommended Architecture for Unfold

### Data Layer

```
assets/
  bible.db              ← Pre-built SQLite with KJV/WEB + FTS5 index

src/
  db/
    bible-db.ts         ← Database initialization, migration, queries
    bible-queries.ts    ← getChapter(), searchVerses(), getBook(), etc.
    user-data-db.ts     ← Highlights, bookmarks, notes, reading progress

  types/
    bible.ts            ← Book, Chapter, Verse, Highlight, Bookmark types
```

### UI Layer

```
app/
  (tabs)/
    (bible)/
      _layout.tsx           ← Bible tab layout
      index.tsx             ← Book picker (grid of 66 books)
      [book]/
        index.tsx           ← Chapter picker (grid of chapter numbers)
        [chapter].tsx       ← Chapter reader (PagerView with verse rendering)

components/
  bible/
    VerseText.tsx           ← Single verse with superscript number + highlight support
    ChapterView.tsx         ← Full chapter renderer (paragraph or verse-per-line mode)
    BookPicker.tsx          ← Grid of Bible books
    ChapterPicker.tsx       ← Grid of chapter numbers
    VerseActionBar.tsx      ← Bottom bar with Highlight/Bookmark/Copy/Share/Note
    SearchResults.tsx       ← FlashList of search results with highlighted matches
    BibleSearchBar.tsx      ← Search input with debounced FTS5 queries
    ReadingModeToggle.tsx   ← Paragraph vs verse-per-line toggle
    FontSizeSlider.tsx      ← Accessibility font size control
```

### State Management

```
Zustand store additions:
  - currentBook: number
  - currentChapter: number
  - selectedVerses: number[]
  - readingMode: 'paragraph' | 'verse-per-line'
  - bibleFontSize: number
  - currentTranslation: string
```

### Key Dependencies (Already in Unfold or Expo)

| Package | Purpose | Status |
|---------|---------|--------|
| expo-sqlite | Bible text storage + FTS5 search | In Expo SDK 55 |
| react-native-pager-view | Swipe between chapters | In Expo SDK 55 |
| react-native-gesture-handler | Swipe gestures | Already installed |
| react-native-reanimated | Animations | Already installed |
| @gorhom/bottom-sheet | Book/chapter picker | Already installed |
| @shopify/flash-list | Search results, book lists | Add if not present |
| expo-haptics | Verse selection feedback | Already installed |

### New Dependencies to Evaluate

| Package | Purpose | Notes |
|---------|---------|-------|
| zeego | Native context menus for verse actions | Requires prebuild (fine for Unfold) |
| rn-text-touch-highlight | Tap-to-highlight text ranges | If partial verse selection needed |
| @rob117/react-native-selectable-text | Text selection with custom menus | Alternative to zeego |

---

## 11. Implementation Phases

### Phase 1: Core Reader (MVP)
- Bundle SQLite Bible database (KJV or WEB)
- Chapter display in ScrollView (verse-per-line mode)
- Book/chapter picker (bottom sheet with grids)
- Swipe between chapters (react-native-pager-view)
- Basic verse tap selection
- Deep link routing: `unfold://bible/john/3`

### Phase 2: Annotations
- Verse highlighting with color picker
- Bookmarks
- Notes on verses
- Persist all to SQLite user data table

### Phase 3: Search
- FTS5 full-text search setup
- Search UI with debounced input
- Results with highlighted matches
- Tap-to-navigate to verse in context

### Phase 4: Polish
- Paragraph mode toggle
- Font size slider
- Reading progress tracking
- Share verse as image / text
- Cross-references (using scrollmapper data)

### Phase 5: Multiple Translations
- On-demand translation downloads
- Side-by-side comparison view
- Translation switcher in reader header

---

## Sources

### Libraries & Tools
- [expo-sqlite documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [react-native-pager-view](https://github.com/callstack/react-native-pager-view)
- [@youversion/platform-react-native](https://www.npmjs.com/package/@youversion/platform-react-native)
- [rn-text-touch-highlight](https://github.com/benjamineruvieru/rn-text-touch-highlight)
- [@rob117/react-native-selectable-text](https://www.npmjs.com/package/@rob117/react-native-selectable-text)
- [zeego](https://github.com/nandorojo/zeego)
- [FlashList](https://shopify.github.io/flash-list/)
- [op-sqlite](https://github.com/OP-Engineering/op-sqlite)
- [expo-sqlite FTS5 fix PR #27738](https://github.com/expo/expo/pull/27738)

### Bible Data Sources
- [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) — 140+ translations, SQLite ready
- [godlytalias/Bible-Database](https://github.com/godlytalias/Bible-Database) — SQLite, JSON, XML, SQL
- [wldeh/bible-api](https://github.com/wldeh/bible-api) — 200+ versions, MIT licensed JSON
- [getbible/v2](https://github.com/getbible/v2) — 100+ translations, no API key
- [seven1m/open-bibles](https://github.com/seven1m/open-bibles) — Public domain OSIS/USFX
- [Bible SuperSearch SQLite files](https://sourceforge.net/projects/biblesuper/files/All%20Bibles%20-%20SQLite%203/)
- [hackathon.bible data](https://hackathon.bible/data/)
- [API.Bible](https://scripture.api.bible/)
- [bible-api.com](https://bible-api.com/)
- [Free Use Bible API](https://bible.helloao.org/)
- [biblenerd/awesome-bible-developer-resources](https://github.com/biblenerd/awesome-bible-developer-resources)

### Open Source Bible Apps
- [PauloLuan/react-native-bible](https://github.com/PauloLuan/react-native-bible)
- [sonnylazuardi/bibleify-mobile](https://github.com/sonnylazuardi/bibleify-mobile)
- [bibletags-react-native-app](https://github.com/educational-resources-and-services/bibletags-react-native-app)
- [brandonqueen/LevelUpBible](https://github.com/brandonqueen/LevelUpBible)

### Deep Linking & Interop
- [Common_Bible_Share_Sheet](https://github.com/Verses/Common_Bible_Share_Sheet)
- [YouVersion URL scheme](https://bentsai.org/posts/youversion-bible-url-scheme)
- [iOS Bible App deeplinks](https://nickperkins.dev/2022/08/02/find-every-ios-bible-app-deeplink-url-scheme/)
- [Expo Router deep linking](https://docs.expo.dev/linking/into-your-app/)

### Performance & Architecture
- [React Native database performance comparison](https://www.powersync.com/blog/react-native-database-performance-comparison)
- [Best SQLite solutions for RN 2026](https://vibe.forem.com/eira-wexford/best-sqlite-solutions-for-react-native-app-development-in-2026-3b5l)
- [Modern SQLite for React Native](https://expo.dev/blog/modern-sqlite-for-react-native-apps)
- [FlashList v2 (2025)](https://shopify.engineering/flashlist-v2)
- [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html)

### Text Rendering & Accessibility
- [Superscript in React Native](https://aaronmgdr.medium.com/a-better-superscript-in-react-native-591b83db6caa)
- [Dynamic font scaling in RN](https://oneuptime.com/blog/post/2026-01-15-react-native-dynamic-font-scaling/view)
- [Accessible font sizes in RN](https://ignitecookbook.com/docs/recipes/AccessibilityFontSizes/)
