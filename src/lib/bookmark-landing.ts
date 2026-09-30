import { bookmarkKind, canonicalizeScriptureReference, type BookmarkKind } from '@/lib/bookmark-identity';
import { readerWords, textContainsWords } from '@/lib/reader-words';

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
  scriptureText?: string;
  bodyText?: string;
}

/**
 * Where the reader takes a bookmark it opens from My library.
 *
 * - `words`: the page finds the saved words (in the devotional text or one
 *   of its boxes) and reports where they are.
 * - `passage`: the day's passage block, at the top of the reading.
 * - `sheet`: the passage sheet of another passage. It shows `savedPassage`,
 *   the saved text and translation, when they are the whole passage. Without
 *   it the sheet loads the passage itself.
 *
 * `inPage`: the page looks for the words. A Scripture phrase the page cannot
 * find lands on its passage, and the page keeps its target, so its document
 * does not reload.
 */
export type BookmarkLanding =
  | { on: 'words'; inPage: true }
  | { on: 'passage'; inPage: boolean }
  | { on: 'sheet'; inPage: boolean; savedPassage?: { text: string; translation?: string } };

/**
 * @param wordsMissing The page reported that it cannot find the saved words.
 */
export function bookmarkLanding(bookmark: LandingBookmark, day: LandingDay, wordsMissing = false): BookmarkLanding {
  // Prose and the reader's boxes are in the page, and only there.
  if (bookmarkKind(bookmark) !== 'scripture') return { on: 'words', inPage: true };

  // A Scripture bookmark whose words are in the devotional text is a phrase
  // selected there. Sync keeps only the reference and the text, so the text
  // decides. The day's whole passage is the passage, even when the teaching
  // quotes it word for word.
  const phrase = textContainsWords(day.bodyText, bookmark.scriptureText)
    && readerWords(bookmark.scriptureText) !== readerWords(day.scriptureText);
  // A phrase lands on its words. Its passage is the fallback when the page
  // cannot find them.
  if (phrase && !wordsMissing) return { on: 'words', inPage: true };

  if (canonicalizeScriptureReference(bookmark.scriptureReference)
    === canonicalizeScriptureReference(day.scriptureReference)) {
    return { on: 'passage', inPage: phrase };
  }

  // A phrase is not the passage text, so the sheet loads the passage. A
  // selection saved on this device keeps its kind and its words as
  // quotedText, which still mark it as a phrase after the day's text
  // changes. Older builds put quotedText on whole passages, with no kind.
  const savedPhrase = bookmark.kind === 'scripture' && Boolean(bookmark.quotedText);
  if (phrase || savedPhrase) return { on: 'sheet', inPage: phrase };
  return {
    on: 'sheet',
    inPage: false,
    savedPassage: {
      text: bookmark.scriptureText,
      ...(bookmark.translation ? { translation: bookmark.translation } : {}),
    },
  };
}
