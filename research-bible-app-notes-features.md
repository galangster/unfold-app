# Bible & Devotional App Note-Taking Research

**Date**: 2026-03-16
**Purpose**: Competitive analysis of note-taking, journaling, and notebook features across Bible and devotional apps to inform Unfold's journal/notebook feature design.

---

## 1. Bible Apps with Note-Taking

### YouVersion Bible App (850M+ downloads)

**How notes work:**
- Select a verse → tap "Note" → write free-form text
- Notes can be private (default), shared with friends, or public
- Notes sync across devices with a free account
- Blue background indicator appears on verse numbers that have attached notes
- Tapping the indicator shows the note

**Organization:**
- All notes listed in a single chronological feed (newest first) under Profile → Notes
- Android has a toggle between compact and detailed list views
- No folders, no tags, no categories, no search within notes
- Highlights listed chronologically too — no color sorting or meaningful filters

**Known problems (from UX case studies):**
- Notes tab is "buried within the interface" — hard to find
- Users frequently toggle to iOS Notes or other apps to copy/paste scriptures
- "Cumbersome" note-taking process
- No good way to browse 100+ notes — just an endless scroll
- A 2025 UX redesign case study proposed: full-screen note editor (not pop-up), date-based organization, verse linking, and search

**Key takeaway:** YouVersion proves that even the #1 Bible app can get notes wrong. The feature exists but is barely usable at scale. Massive opportunity for anyone who does notes well.

---

### Logos Bible Software (Pro/Academic)

**How notes work:**
- Full rich-text note editor (bold, italic, lists, headings)
- Notes can be anchored to multiple references simultaneously
- Anchors can target verses, words, topics (e.g., "creation," "God"), or specific resources
- Photos can be inserted into notes
- Notes integrate with Sermon Builder — add study notes directly to sermon prep

**Organization:**
- **Notebooks**: Folder-like system — create notebooks for sermon series, study topics, classes
- **Tags**: Cross-notebook tagging — find related notes across different notebooks
- **Filtering**: Toggle highlights/notes on/off, filter by notebook, drill down by book of the Bible
- **Search**: Faceted search across all notes with cross-platform access (Windows, macOS, iOS, Android, web)
- **Sharing**: Share notebooks with study groups, church teams

**Visual pattern:**
- Sidebar panel with filter tree (notebooks → tags → resources)
- Notes appear in a list within the sidebar
- Anchored notes show small icons in the Bible text margin
- Desktop-first design — mobile is a companion

**Key takeaway:** Logos is the gold standard for power users. Anchoring to multiple references and cross-notebook tagging are features no one else matches. But it's complex — built for pastors and seminary students, not casual readers.

---

### Olive Tree Bible App

**How notes work:**
- **Verse-Based Notes**: Tap a verse number → note is tied to that verse across ALL translations
- **Word-Based Notes**: Select specific text → note is tied to that exact resource/translation
- Enhanced Notes: Rich formatting (bold, italic, underline, bullets, lists, headings)
- Verse references typed in notes auto-hyperlink when reopened

**Organization:**
- **Categories**: Each note assigned to one category (e.g., sermon series, study topic, date)
- **Tags**: Chain-reference system — any bookmark, highlight, or note can belong to a tag
- **Drag-and-drop**: Long-press notes on iPhone to drag into folders
- Study Center provides a unified view of all annotations

**Visual pattern:**
- Notes section in main menu provides streamlined access
- Categories displayed as colored labels
- Tags function as cross-reference chains

**Key takeaway:** Olive Tree's distinction between verse-based (universal) and word-based (resource-specific) notes is clever. The category + tag dual system offers good flexibility without overwhelming complexity.

---

### Blue Letter Bible

**How notes work:**
- Personal notes can be added to any verse or passage
- Notes organized into notebooks (e.g., weekly study notebooks)

**Organization:**
- Notebook-based system — create notebooks for each week/topic
- Primarily a study tool — notes are secondary to commentaries and lexicons

**Key takeaway:** Basic but functional. Notebook-per-week is a pattern some users love for sermon series.

---

### ESV Bible App

**How notes work:**
- Free-form notes alongside scripture
- Highlight and bookmark key verses
- Sync across devices with free account

**Organization:**
- Basic — notes, highlights, bookmarks accessible from profile
- Reading plans can be shared

**Key takeaway:** Minimal notes implementation. ESV focuses on the reading experience, not note management.

---

### Faithlife Study Bible / Verbum (Catholic)

**How notes work:**
- Built on Logos engine — shares the same note system
- Tap word or passage → highlight, leave note, open Bible Word Study
- Enhanced text selection menu for quick actions
- Notes attach to any verse or book

**Organization:**
- Same as Logos: notebooks, tags, filters
- Group sharing for study groups and reading plans

**Key takeaway:** Faithlife apps are essentially Logos-lite. Good note system inherited from the desktop platform.

---

## 2. Devotional Apps with Journals

### Glorify (20M+ users)

**Journal features:**
- Bible Journal for daily study reflections
- Gratitude Space for documenting answered prayers and God's work
- Mood tracking tied to spiritual well-being
- Highlight scripture and write notes inline
- Can pull up verses in church and open journal for sermon notes

**Organization:**
- Daily task-based structure (unlock content by completing daily list)
- Bite-sized content (1-4 minutes per item)
- Journal is part of the daily flow, not a separate standalone feature

**Visual pattern:**
- Clean, modern UI with custom icons
- Two fonts (tradition + modernity)
- Colorful custom icons for interactive elements
- Today screen is the hub — everything radiates from daily content

**Key takeaway:** Glorify integrates journaling INTO the devotional flow rather than offering a separate journal app. The mood tracking + gratitude space combination is unique in the faith app space. But it's not a general-purpose notebook.

---

### Abide

**Journal features:**
- Journaling is secondary to audio meditation content
- Available but not the primary use case
- Focus is on guided Christian meditation (3, 5, 10, 15 min sessions)

**Key takeaway:** Audio-first app. Journaling exists but is an afterthought. Not a model to follow for notes.

---

### Pray.com

**Journal features:**
- Prayer groups and community focus
- Shared prayer experiences
- Notes/journal is not a highlighted feature

**Key takeaway:** Community prayer platform, not a journaling tool.

---

### First5 (Proverbs 31 Ministries)

**Journal features:**
- Highlight any portion of daily teachings → bookmark, share, or add personal note
- Review notes and activity through profile
- Export feature to save notes to device
- Companion print journals available for purchase

**Organization:**
- Notes accessible via profile
- Export capability (download your data)

**Key takeaway:** First5 has a solid highlight-and-note pattern within devotional content, plus the smart export feature. The print journal tie-in shows the physical/digital bridge some users want.

---

### She Reads Truth

**Journal features:**
- Highlight, bookmark, share, and take notes while reading
- Real-time commenting synced with web site
- In-app camera with photo overlays for shareable scripture images
- Downloadable scripture lock screens for memorization

**Organization:**
- User accounts keep notes and highlights safe
- Community-focused — commenting is prominent
- Beautiful design is a key differentiator

**Key takeaway:** She Reads Truth emphasizes aesthetics and community sharing over deep note organization. The shareable scripture images are a retention/virality feature worth noting.

---

### Dwell (Audio Bible)

**Journal features:**
- No traditional note-taking
- Read Along feature syncs text with narration
- Focus is purely on audio Bible listening
- Meditate & Memorize feature (Repeat and Reflect)

**Key takeaway:** Audio-only. No journal/notebook feature. Proves that not every faith app needs notes — some succeed by going deep on one modality.

---

## 3. How Notes Connect to Scripture

### Connection Patterns Across Apps

| Pattern | Apps Using It | How It Works |
|---------|--------------|--------------|
| **Verse-tap anchor** | YouVersion, Olive Tree, Logos, Faithlife | Select verse → note is anchored to that verse reference |
| **Multi-anchor** | Logos only | One note can be anchored to multiple verses, words, topics |
| **Auto-verse card** | Bible Notes, Church Notes, Spirit Notes | Type "John 3:16" → full verse text auto-populates as a card |
| **Inline indicator** | YouVersion, Olive Tree | Small icon/color on verse number shows a note exists |
| **Margin annotation** | Logos, Pencil Bible | Note icons appear in the margin next to the text |
| **Separate section** | Most apps | All notes viewable in a dedicated notes list/tab |
| **Hyperlink back** | Olive Tree | Verse references in notes become tappable links back to scripture |

### Key Finding: Two Architectures

1. **Scripture-first** (note lives ON the verse): YouVersion, Olive Tree, Logos
   - Pro: Notes always appear in context when reading
   - Con: Hard to browse notes independent of reading

2. **Journal-first** (note lives in a journal, references scripture): Glorify, Spirit Notes, Church Notes
   - Pro: Better for free-form reflection, sermon notes, longer writing
   - Con: Notes feel disconnected from the Bible text

**Best-in-class approach**: Olive Tree and Logos do BOTH — notes are anchored to verses AND browsable in a separate section. This dual-access pattern is the winner.

---

## 4. Visual Patterns & Organization Systems

### List Views

| App | List Style | Details |
|-----|-----------|---------|
| YouVersion | Chronological scroll | Newest first, no sorting/filtering, compact or detailed toggle (Android) |
| Logos | Filtered list with sidebar | Faceted search, filter by notebook/tag/book, toggle highlights on/off |
| Olive Tree | Category-grouped list | Notes grouped by category with colored labels |
| Spirit Notes | Notebook-grouped list | Notes within notebook folders, tag-based secondary grouping |

### Card Views

| App | Card Style | Details |
|-----|-----------|---------|
| Spirit Notes | Note cards | Personal revelations, Bible studies, quotes as distinct card types |
| Bible Notes | Scripture cards | Auto-populated verse text displayed as a rich card within notes |
| YouVersion redesign (proposed) | Full-screen note cards | Expanded from pop-up to full-screen for deeper reflection |

### Organization Hierarchy

**Tier 1 — Folders/Notebooks** (primary grouping)
- Logos: Notebooks
- Spirit Notes: Notebooks (by ministry, conference, small group)
- Blue Letter Bible: Notebooks (by week)
- Church Notes: Notebooks (by preacher, topic)
- Olive Tree: Categories

**Tier 2 — Tags** (cross-cutting labels)
- Logos: Full tag system with tag browser
- Olive Tree: Tags as chain-references
- Spirit Notes: Topic tags with search
- Bible Notes: Labeling system (themes, subjects, sermon series)

**Tier 3 — Metadata** (automatic organization)
- Date created/edited (all apps)
- Preacher name (Church Notes, Spirit Notes, Bible Notes)
- Scripture reference (all apps)
- Sermon title (Church Notes)
- Audio timestamp (Spirit Notes, Church Notes, Bible Notes)

### Search Capabilities

| App | Search Type |
|-----|------------|
| Logos | Faceted search with filters (most powerful) |
| Spirit Notes | Tag search + full-text |
| Church Notes | Full-text search across all notes |
| YouVersion | None (major gap) |
| Olive Tree | Search within categories/tags |

---

## 5. Specialized Note-Taking Apps (Niche Players)

### Pencil Bible
- Apple Pencil-first annotation app
- Direct handwriting/drawing ON scripture pages
- Pressure sensitivity, tilt support
- Margin space for art, calligraphy, detailed study notes
- Strips away everything except text + your pen
- Free with 10-chapter limit, paid for unlimited

### Church Notes (churchnotes.com)
- Sermon recording with automatic timestamp sync
- Sort by preacher, topic, date, scripture, or custom notebook
- Auto-insert Bible verses while typing (ESV, NIV, KJV)
- Shareable links with full content + recordings + images
- Formatting: bullet points, headings, highlighters

### Spirit Notes
- Recording + timestamp sync (tap timestamp to re-listen)
- 70+ custom icons
- Notebooks for logical grouping
- Tags for topic-based organization
- Redesigned for iOS 26 with Liquid Glass toolbar
- Rounded corner highlights and images

### Bible Note (biblenote.ai)
- AI-powered Q&A on your own notes
- Auto-verse card generation (type reference → rich card)
- Recording with transcription
- Folders for organization
- Scripture flash cards from your notes
- Daily Devotion feature built into the notes app

### FaithNotes (Interactive Sermon Notes)
- Church-focused: replaces paper bulletins
- Auto-converts Word docs to fill-in-the-blank interactive notes
- Web-based (no app download)
- Embedded audio/video/livestream
- Event registrations, prayer requests, connect cards
- Pastor creates template → congregation fills in blanks

### Psalmlog
- AI-powered spiritual journaling
- Voice journaling (speak → app guides reflection)
- Emotion and theme analysis → connected to relevant Bible verses
- Prayer groups and community features
- $19.99/mo (Faith Builder plan)

---

## 6. Patterns & Opportunities for Unfold

### What Everyone Does (Table Stakes)
- Free-form text notes
- Verse anchoring (note linked to a scripture reference)
- Highlight verses with colors
- Sync across devices
- Basic chronological list of all notes

### What Only Power Apps Do (Differentiators)
- **Notebooks/Folders**: Logos, Spirit Notes, Olive Tree
- **Tags**: Logos, Olive Tree, Spirit Notes, Bible Notes
- **Search within notes**: Logos, Spirit Notes, Church Notes
- **Audio recording + timestamp sync**: Spirit Notes, Church Notes, Bible Notes
- **Auto-verse insertion**: Bible Notes, Church Notes (type reference → verse appears)
- **Rich text formatting**: Logos, Olive Tree (Enhanced Notes), Church Notes
- **AI-powered insights on notes**: Bible Note, Psalmlog, My Smart Bible
- **Shareable note links**: Spirit Notes, Church Notes, Logos
- **Export**: First5 (export to device)

### What Nobody Does Well (Gaps = Opportunities)
1. **AI-generated reflection prompts based on your reading**: Apps either have generic prompts OR AI that's disconnected from what you just read. Unfold could generate personalized journal prompts based on today's devotional content.

2. **Journal entries that evolve over a series**: No app connects Day 1's journal to Day 5's journal to show spiritual growth over a devotional series. Unfold's progressive generation system could track themes across journal entries.

3. **Visual timeline of spiritual growth**: Mood tracking (Glorify) exists but no one visualizes "here's how your reflections changed from the start of this series to the end."

4. **Devotional-native journaling**: Most apps bolt on a generic notes feature. None deeply integrate journaling INTO the devotional reading experience with contextual prompts, scripture auto-linking, and series-aware organization.

5. **Beautiful note cards with scripture**: Bible Notes has auto-verse cards but the UI is utilitarian. There's room for aesthetically beautiful scripture-note cards (think She Reads Truth's visual design + Spirit Notes' organization).

6. **Smart organization without user effort**: Most apps require manual folders/tags. No one auto-organizes notes by devotional series, theme, book of the Bible, and date simultaneously.

### Recommended Design Patterns for Unfold

**Primary organization**: By devotional series (automatic — each series gets its own section)
**Secondary organization**: By date within each series
**Cross-cutting**: Auto-tagged by scripture reference, theme, and mood
**Display**: Card-based list with scripture preview, date, and first line of note
**Entry point**: Journal prompt appears at the bottom of each day's reading
**Full journal view**: Dedicated tab showing all entries, filterable by series/date/scripture
**Rich features**: Auto-verse insertion, AI-generated prompts, series growth summary

---

## Sources

- [YouVersion Bible App Notes Redesign Case Study (Medium)](https://medium.com/@lrd30037/youversion-bible-app-journal-addition-notes-redesign-case-study-aa3e58548690)
- [YouVersion Bible App Review 2026 (BibleMate)](https://bibleinyear.com/blog/youversion-bible-app)
- [Logos Help Center: Using Notebooks](https://support.logos.com/hc/en-us/articles/360018492791-Using-Notebooks)
- [Logos Notes: 5 Unique Features (Bible Study Tips)](https://biblestudy.tips/unique-logos-notes-features/)
- [Logos Help Center: Record Insights Using Notes](https://support.logos.com/hc/en-us/articles/360017978372-Notes-Tool)
- [How to Take Sermon Notes in Logos (John M. Wiley)](https://johnmichaelwiley.wordpress.com/2022/10/11/how-to-take-sermon-notes-in-logos-bible-software/)
- [Notes in Olive Tree Bible App (Olive Tree Blog)](https://www.olivetree.com/blog/notes-olive-tree-bible-app/)
- [Olive Tree Enhanced Notes (Help Center)](https://help.olivetree.com/hc/en-us/articles/19892543400077-Enhanced-Notes)
- [Best Spiritual Journaling Apps 2026 (Psalmlog)](https://psalmlog.com/blog/best-spiritual-journaling-apps-2026)
- [What Makes a Great Christian Journaling App (Psalmlog)](https://psalmlog.com/blog/what-makes-a-great-christian-journaling-app-features-every-believer-should-know/)
- [Prayer Journal App Guide (Psalmlog)](https://psalmlog.com/blog/prayer-journal-app)
- [Top 5 Bible Study Apps 2025 (Psalmlog)](https://psalmlog.com/blog/top-bible-study-apps-personalized-guidance-2026/)
- [17 Best Bible Apps 2026 (The Lead Pastor)](https://theleadpastor.com/tools/best-bible-apps/)
- [14 Bible Study Apps 2026 (The Lead Pastor)](https://theleadpastor.com/tools/best-bible-study-apps/)
- [Best Bible Apps 2026 (The First Verse)](https://thefirstverse.app/blog/best-bible-apps-2026/)
- [Best Bible Apps 2026 (BibleMate)](https://bibleinyear.com/blog/best-bible-apps)
- [Glorify App Review (FaithGPT)](https://www.faithgpt.io/reviews/glorify)
- [Glorify Case Study (Tapptitude)](https://tapptitude.com/case-studies/glorify)
- [Church Notes App](https://churchnotes.com/)
- [Spirit Notes App](https://www.spiritnotes.com/)
- [Church Notes App (churchnotesapp.com)](https://www.churchnotesapp.com/)
- [Bible Notes App](https://biblenotesapp.com/)
- [Bible Note AI](https://biblenote.ai/)
- [Pencil Bible](https://pencilbible.com/)
- [She Reads Truth App (App Store)](https://apps.apple.com/us/app/she-reads-truth/id892128363)
- [First 5 App](https://first5.org/)
- [Dwell Audio Bible](https://dwellapp.io/)
- [FaithNotes Interactive Sermon Notes](https://interactivesermonnotes.com/)
- [My Smart Bible Notes](https://www.mysmartbible.com/notes)
- [8 Best Christian AI Apps 2026 (FaithGPT)](https://www.faithgpt.io/best/best-christian-ai-apps)
- [YouVersion iOS Notes (Help Center)](https://help.youversion.com/l/en/article/gmie9cmpei-notes-on-i-os)
- [YouVersion Android Notes (Help Center)](https://help.youversion.com/l/en/article/wb7u0jdlgn-notes-android)
- [Logos Notebooks Feature Page](https://www.logos.com/features/notebooks)
