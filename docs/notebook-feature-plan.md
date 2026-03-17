# Unfold Notebook Feature — Architecture Plan

**Date**: 2026-03-16
**Status**: Planning
**Based on**: Research across 20+ Bible apps, note-taking apps, and current Unfold codebase audit

---

## Executive Summary

Add a general-purpose notebook to Unfold that lets users take any kind of note — sermon notes, quiet time reflections, free-form thoughts — while deeply integrating with the existing devotional and Bible reader features. The Journal tab evolves from a devotional-only reflection tool into a unified writing hub.

**Design philosophy**: Capture-first, organize-later. One tap to a blinking cursor. Smart auto-organization so users never have to manually file anything.

---

## 1. The Mental Model

### What users see: One "Journal" tab with two sections

```
┌─────────────────────────────────────┐
│  Journal Tab                        │
│                                     │
│  ┌───────────┐  ┌────────────────┐  │
│  │ Reflections│  │   Notebook     │  │
│  │ (existing) │  │   (new)        │  │
│  └───────────┘  └────────────────┘  │
│                                     │
│  Segmented control at top           │
│  "Reflections" = devotional journals│
│  "Notebook" = free-form notes       │
└─────────────────────────────────────┘
```

**Why not a new tab?** Three tabs is the sweet spot for thumb navigation. Adding a 4th visible tab crowds the bar. Instead, use a **segmented control** at the top of the Journal tab — two modes in one tab. This is exactly how Apple Notes handles Folders vs Tags, and how Day One handles Journals vs Calendar.

**Why "Reflections" and "Notebook"?**
- "Reflections" keeps the devotional journal identity (users already know this)
- "Notebook" signals general-purpose writing (familiar from school, church, life)
- Both live under "Journal" tab — unified writing hub

---

## 2. Data Model

### New: `Note` interface

```typescript
interface Note {
  id: string;                    // UUID
  title: string;                 // User-set or auto-generated from first line
  content: string;               // Rich-ish text (markdown or plain)
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp

  // Organization (all optional, auto-populated where possible)
  category: NoteCategory;        // 'sermon' | 'quiet-time' | 'study' | 'prayer' | 'general'
  tags: string[];                // User-created tags (free-form)
  isFavorite: boolean;           // Star/pin for quick access

  // Scripture linking (the killer integration)
  scriptureRefs: ScriptureRef[]; // Linked verses (auto-detected + manual)

  // Context metadata (auto-captured, Day One style)
  devotionalId?: string;         // If created from a devotional context
  dayNumber?: number;            // If linked to a specific devotional day
  bibleBookId?: number;          // If created from Bible reader
  bibleChapter?: number;         // If created from Bible reader
}

interface ScriptureRef {
  reference: string;             // "John 3:16" (display string)
  bookId: number;                // For navigation
  chapter: number;
  verse?: number;
  verseEnd?: number;
}

type NoteCategory = 'sermon' | 'quiet-time' | 'study' | 'prayer' | 'general';
```

### Category system

Instead of user-created folders (which add friction), use **5 pre-set categories** with icons:

| Category | Icon | Auto-detected when... |
|----------|------|-----------------------|
| Sermon | MicrophoneStage | User selects "Sermon Notes" template |
| Quiet Time | SunHorizon | Created during morning hours, or from devotional |
| Study | BookOpen | Created from Bible reader, or has 2+ scripture refs |
| Prayer | Hands | Contains prayer-related keywords |
| General | Note | Default fallback |

Users can always override the auto-category. But the point is: **most notes organize themselves.**

### Tags

Free-form tags, Bear-style. Type `#revival` or `#marriage` anywhere in the note and it becomes a tag. Also a tag picker in the note toolbar. Tags are the cross-cutting organizer — a note can be "Sermon" category AND tagged `#marriage #ephesians`.

---

## 3. Navigation & Screen Architecture

### Updated route structure

```
(tabs)
├── (today)/          — Home + devotional reading
├── (bible)/          — Bible reader
├── (journal)/        — Journal hub (UPDATED)
│   ├── index.tsx     — Hub with segmented control
│   │                   [Reflections] = existing devotional journal list
│   │                   [Notebook] = new notes list
│   ├── note.tsx      — Note editor (new)
│   ├── note-detail.tsx — Note read view (new)
│   ├── entry.tsx     — (existing redirect)
│   └── my-responses.tsx — (existing)
└── (you)/            — Profile/settings
```

### Journal Hub screen (updated index.tsx)

```
┌──────────────────────────────────┐
│ Journal                    🔍  + │  ← Search + New note FAB
│──────────────────────────────────│
│ [ Reflections ]  [ Notebook ]    │  ← Segmented control
│──────────────────────────────────│
│                                  │
│  When "Reflections" selected:    │
│  (existing devotional journal    │
│   list — unchanged)              │
│                                  │
│  When "Notebook" selected:       │
│  ┌──────────────────────────┐    │
│  │ Filter pills:            │    │
│  │ All  Sermon  Study  ...  │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ 📌 Marriage Retreat Notes│    │
│  │ Ephesians 5:25-33        │    │
│  │ "Love is not about..."   │    │
│  │ 2 days ago  #marriage    │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ Sunday Sermon - Ps 23    │    │
│  │ Psalm 23:1-6             │    │
│  │ "The shepherd metaphor..."│    │
│  │ 5 days ago  #sermon      │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ Quiet Time - March 14    │    │
│  │ Romans 8:28              │    │
│  │ "All things work toget..."│    │
│  │ Yesterday  #quiet-time   │    │
│  └──────────────────────────┘    │
│                                  │
└──────────────────────────────────┘
```

### Note Editor screen

```
┌──────────────────────────────────┐
│ ← Back              Done    ⋯   │  ← More menu (category, tags, delete)
│──────────────────────────────────│
│                                  │
│ Title                            │  ← Auto from first line, or explicit
│                                  │
│ Start writing...                 │  ← Full-screen TextInput, auto-save
│                                  │
│                                  │
│                                  │
│                                  │
│                                  │
│──────────────────────────────────│
│ 📖  B  I  ☰  ✓  📎            │  ← Toolbar above keyboard
│ Scripture  Bold Italic List Check│
└──────────────────────────────────┘

Toolbar items:
- 📖 Add scripture reference (opens Bible book/chapter picker)
- B/I  Basic formatting
- ☰   Bullet list
- ✓   Checklist
- 📎  (future: attach image)
```

---

## 4. Integration Points — The Harmonious Ecosystem

### A. Bible Reader → Notebook

**Current**: Bible reader has Copy, Highlight, Note, Share in the context bar.
**Enhancement**: The "Note" button now creates a Notebook note pre-linked to the selected verses.

Flow:
1. User selects verses in Bible reader
2. Taps "Note" in context bar
3. New note opens with scripture reference auto-populated at the top
4. `bibleBookId` and `bibleChapter` auto-set on the note
5. User writes, auto-saved, back to Bible reader

**Verse indicator**: In the Bible reader, verses that have notes show a small dot indicator (like YouVersion's blue indicator, but using the accent color). Tapping it opens the linked note.

### B. Devotional Reading → Notebook

**Current**: Devotionals have inline reflection journal + full journal editor (devotional-scoped).
**Enhancement**: Add a "Take Notes" option in the reading screen that creates a Notebook note linked to the current devotional day.

This is DIFFERENT from the reflection journal:
- **Reflection** = guided, with prompts, SOAP mode, prayer requests (stays as-is)
- **Notebook note** = free-form, for when the user wants to write something that isn't a direct response to a prompt

Flow:
1. While reading devotional, user taps "..." menu or a note icon
2. New notebook note opens with `devotionalId` and `dayNumber` pre-set
3. Scripture reference from the day auto-linked
4. Category auto-set to "Quiet Time" or "Study"

### C. Notebook → Bible Reader (backlinks)

When viewing a note that has scripture references:
- Each reference is a tappable link
- Tapping navigates to `/(tabs)/(bible)/reader?bookId=X&chapter=Y&verse=Z`
- Same scroll-to-verse + flash behavior as existing verse navigation

### D. Notebook → Devotional Reflections (cross-reference)

In the Reflections tab, if a devotional day has BOTH a reflection entry AND a notebook note, show a subtle link:
- "You also have a note from this day →"
- Tapping opens the notebook note

### E. Search unifies everything

The search bar at the top of the Journal tab searches across BOTH reflections and notebook notes. Results show which type each result is (reflection icon vs note icon).

---

## 5. The "New Note" Flow — One Tap to Cursor

**Critical UX principle**: The best note apps get you to a blinking cursor in ONE TAP, under 2 seconds. No folder selection, no template choice, no category picker. All of that is optional, after-the-fact.

### From Journal tab:
- Tap "+" button → blank note editor opens instantly
- Title field is optional (first line becomes title if left blank)
- Category auto-detected, tags added later if desired
- Auto-saves every 800ms (same debounce pattern as existing journal)

### From Bible reader:
- Select verses → tap "Note" → note editor with verse pre-filled

### From devotional reading:
- Tap note icon → note editor with devotional context pre-filled

### From home screen (future):
- Long-press Journal tab icon → "New Note" quick action

---

## 6. Filter & Search System

### Filter pills (Notebook view)

Horizontal scroll of category pills at the top:
```
[ All ] [ Sermon ] [ Quiet Time ] [ Study ] [ Prayer ] [ General ]
```

Active pill uses accent color fill. Tapping filters the list. Only one active at a time (plus "All").

### Tag filtering

Below category pills (when a category is selected), show tag pills from notes in that category:
```
[ #marriage ] [ #ephesians ] [ #faith ] [ #parenting ]
```

### Search

- Full-text search across title, content, tags, and scripture references
- Search bar at top of Journal hub (shared between Reflections and Notebook)
- Results grouped by type with clear visual distinction

---

## 7. Smart Features (Phase 2+)

### Auto-scripture detection
When user types "John 3:16" or "Psalm 23" in a note, auto-detect using existing `parseScriptureReferences()` from `scripture-parser.ts` and create a `ScriptureRef` link. Show as a tappable pill in the note.

### AI note summary
After a sermon, if the note is long (500+ words), offer "Summarize this note" using Grok. Creates a 2-3 sentence summary stored on the note for the list view preview.

### "On This Day" (Day One pattern)
Surface notes from the same date in previous years. "A year ago, during your Psalm series, you wrote..." — creates emotional engagement and shows spiritual growth.

### Series growth view
For notes linked to a devotional series, show a timeline visualization of how the user's reflections evolved from Day 1 to Day 30.

---

## 8. Store Changes

### New state fields in Zustand store:

```typescript
// In UnfoldStore interface:
notes: Note[];
noteCategories: NoteCategory[];  // For custom categories (future)

// Actions:
addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => string;
updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'category' | 'tags' | 'isFavorite' | 'scriptureRefs'>>) => void;
deleteNote: (id: string) => void;
getNotesForScripture: (bookId: number, chapter: number) => Note[];
getNotesForDevotional: (devotionalId: string, dayNumber?: number) => Note[];
searchNotes: (query: string) => Note[];
```

### Store version migration:
- Bump from v19 → v20
- Migration: add `notes: []` to persisted state
- No breaking changes to existing journal data

---

## 9. Apple Sign-In & Sync Messaging

### Updated sign-in screen copy:

**Before**: (whatever current copy is)
**After**:
> "Sign in to sync your devotionals, journal reflections, notebook, and Bible highlights across all your devices."

### What syncs (make clear to user):
- ✅ Devotional progress & journal reflections
- ✅ Notebook notes (sermon notes, study notes, all notes)
- ✅ Bible highlights & bookmarks
- ✅ Reading settings & preferences
- ✅ Streak data

### Sync architecture:
- Phase 1: Local-only (MMKV, same as current journal). Sign-in required for cloud backup.
- Phase 2: Firebase Firestore sync (same pattern as devotionals). Notes collection per user.
- The data model is designed to be sync-friendly (UUIDs, timestamps, no circular refs).

---

## 10. Phased Rollout

### Phase 1 — Foundation (Build First)
- [ ] `Note` data model in store (v20 migration)
- [ ] Segmented control on Journal tab (Reflections / Notebook)
- [ ] Notebook list view with category filter pills
- [ ] Note editor screen (full-screen, auto-save, basic formatting)
- [ ] "+" FAB on Journal tab for new note
- [ ] Bible reader "Note" button creates a notebook note (not just highlight note)
- [ ] Scripture references as tappable links in notes

### Phase 2 — Integration
- [ ] Auto-scripture detection in note content
- [ ] Tag system (#hashtag inline + tag picker)
- [ ] Search across reflections + notes
- [ ] Verse indicators in Bible reader for verses with notes
- [ ] "Take Notes" option in devotional reading screen
- [ ] Cross-links between reflections and notes for same devotional

### Phase 3 — Intelligence
- [ ] AI note summary for long notes
- [ ] "On This Day" surfacing
- [ ] Series growth visualization
- [ ] Smart category auto-detection
- [ ] Export notes (PDF, text)

---

## 11. What We're NOT Building

To keep this focused and avoid Notion-complexity:

- ❌ Nested pages/sub-notes (flat list is better on mobile)
- ❌ Databases/tables (this is a notebook, not a spreadsheet)
- ❌ Real-time collaboration (solo journaling app)
- ❌ Markdown syntax (WYSIWYG toolbar instead — broader appeal)
- ❌ Sidebar navigation (doesn't work on mobile — use filter pills)
- ❌ Manual folders (categories + tags + search is enough)
- ❌ Audio recording (Phase 4+, if ever)
- ❌ Image attachments (Phase 3+)

---

## 12. Key Design Decisions Rationale

| Decision | Rationale |
|----------|-----------|
| Segmented control, not new tab | 3 tabs is optimal. 4 crowds the bar. |
| 5 preset categories, not user folders | Folders add friction. Categories auto-organize. |
| Tags over folders for cross-cutting | A note about marriage from a sermon can be `#sermon #marriage`. Folders force a choice. |
| Auto-save, no explicit save button | Matches existing journal pattern. Users expect this. |
| First line = title if no explicit title | Bear pattern. Removes friction of required title field. |
| Scripture refs as tappable pills | Connects notebook to Bible reader seamlessly. |
| Same editor for all note types | One writing experience. Category just changes the metadata. |
| Local-first, sync later | Ship fast. Firebase sync is Phase 2. |

---

## 13. Files to Create/Modify

### New files:
- `src/app/(tabs)/(journal)/note.tsx` — Note editor screen
- `src/app/(tabs)/(journal)/note-detail.tsx` — Note read-only view
- `src/components/notebook/NoteCard.tsx` — List item component
- `src/components/notebook/NoteEditor.tsx` — Editor component (reusable)
- `src/components/notebook/CategoryPills.tsx` — Filter pills
- `src/components/notebook/ScriptureRefPill.tsx` — Tappable scripture link

### Modified files:
- `src/lib/store.ts` — Add Note type, notes array, actions, migration v20
- `src/app/(tabs)/(journal)/index.tsx` — Add segmented control + notebook list
- `src/app/(tabs)/(bible)/reader.tsx` — Update "Note" button to create notebook note
- `src/app/(tabs)/(today)/reading.tsx` — Add "Take Notes" option
- Sign-in screen — Update sync messaging copy
