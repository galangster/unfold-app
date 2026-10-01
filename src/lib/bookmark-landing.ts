import {
  bookmarkKind,
  canonicalizeScriptureReference,
  scripturePhraseWords,
  type BookmarkKind,
} from '@/lib/bookmark-identity';

/** What the reader knows of a bookmark it opens from My library. */
export interface LandingBookmark {
  kind?: BookmarkKind;
  scriptureReference: string;
  scriptureText: string;
  quotedText?: string;
  translation?: string;
}

/** The day the bookmark belongs to. */
export interface LandingDay {
  scriptureReference: string;
}

/**
 * Where the reader takes a bookmark it opens from My library.
 *
 * - `words`: the page finds the saved words (in the devotional text or one
 *   of its boxes) and reports where they are.
 * - `passage`: the day's passage block, at the top of the reading.
 * - `sheet`: the passage sheet. It shows `savedPassage`, the saved text and
 *   translation, when they are the whole passage. Without it the sheet loads
 *   the passage itself.
 *
 * `inPage`: the page looks for the words. A Scripture phrase the page cannot
 * find opens its passage sheet, and the page keeps its target, so its
 * document does not reload.
 */
export type BookmarkLanding =
  | { on: 'words'; inPage: true }
  | { on: 'passage'; inPage: false }
  | { on: 'sheet'; inPage: boolean; savedPassage?: { text: string; translation?: string } };

/**
 * What the bookmark saved decides, never the day's text: a regenerated
 * teaching can lose a phrase's words or quote a whole passage.
 *
 * @param wordsMissing The page reported that it cannot find the saved words.
 */
export function bookmarkLanding(bookmark: LandingBookmark, day: LandingDay, wordsMissing = false): BookmarkLanding {
  // Prose and the reader's boxes are in the page, and only there.
  if (bookmarkKind(bookmark) !== 'scripture') return { on: 'words', inPage: true };

  // A phrase selected in the devotional text lands on its words. It is not
  // the passage text, so when the page cannot find the words the sheet loads
  // the passage.
  if (scripturePhraseWords(bookmark) !== null) {
    return wordsMissing ? { on: 'sheet', inPage: true } : { on: 'words', inPage: true };
  }

  // A passage saved from the passage block or the passage sheet.
  if (canonicalizeScriptureReference(bookmark.scriptureReference)
    === canonicalizeScriptureReference(day.scriptureReference)) {
    return { on: 'passage', inPage: false };
  }
  return {
    on: 'sheet',
    inPage: false,
    savedPassage: {
      text: bookmark.scriptureText,
      ...(bookmark.translation ? { translation: bookmark.translation } : {}),
    },
  };
}

/** The words the page looks for: a Scripture phrase's words without their
 *  ellipses, else the saved words. */
export function bookmarkPageWords(bookmark: LandingBookmark): string {
  return scripturePhraseWords(bookmark) ?? (bookmark.quotedText || bookmark.scriptureText);
}
