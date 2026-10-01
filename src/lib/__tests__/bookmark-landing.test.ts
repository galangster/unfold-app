import { bookmarkLanding, bookmarkPageWords, type LandingBookmark } from '@/lib/bookmark-landing';
import { storedReferenceFor } from '@/lib/bookmark-identity';

// The teaching quotes Matthew 11:28 and the day's own passage word for word.
// The landing never reads it: what the bookmark saved decides.
const day = {
  scriptureReference: 'John 3:16',
  scriptureText: 'For God so loved the world, that he gave his only Son.',
  bodyText: 'Jesus said, “Come to me” (Matthew 11:28).\n\nFor God *so loved* the world. Grace meets you here.',
};

const bookmark = (fields: Partial<LandingBookmark>): LandingBookmark => ({
  scriptureReference: 'John 3:16',
  scriptureText: 'Saved text',
  ...fields,
});

describe('bookmarkLanding', () => {
  it.each([
    ['an excerpt', bookmark({ kind: 'excerpt', scriptureReference: storedReferenceFor('excerpt'), scriptureText: 'Grace meets you' })],
    ['a synced excerpt', bookmark({ scriptureReference: storedReferenceFor('excerpt'), scriptureText: 'Grace meets you' })],
    ['a quote box', bookmark({ scriptureReference: storedReferenceFor('quote'), scriptureText: 'Words no longer here' })],
    ['a context box', bookmark({ kind: 'context', scriptureReference: storedReferenceFor('context') })],
    ['a word study box', bookmark({ kind: 'word-study', scriptureReference: storedReferenceFor('word-study') })],
  ])('lands %s on its words in the page, found or not', (_label, saved) => {
    expect(bookmarkLanding(saved, day)).toEqual({ on: 'words', inPage: true });
    expect(bookmarkLanding(saved, day, true)).toEqual({ on: 'words', inPage: true });
  });

  describe('a Scripture phrase selected in the devotional text', () => {
    // As this device saves it: the kind, the words as quotedText, and the
    // words between ellipses as scriptureText.
    const saved = bookmark({ kind: 'scripture', scriptureReference: 'Matthew 11:28', scriptureText: '…Come to me…', quotedText: 'Come to me' });
    // As a sync pull rebuilds it: the reference and the text only.
    const synced = bookmark({ scriptureReference: 'Matthew 11:28', scriptureText: '…Come to me…' });
    // A phrase whose words a regenerated teaching no longer holds.
    const gone = bookmark({ scriptureReference: 'Romans 8:28', scriptureText: '…all things work together…' });
    // A phrase of the day's own passage.
    const ofTheDay = bookmark({ scriptureReference: ' john  3:16 ', scriptureText: '…so loved…' });
    const phrases = [saved, synced, gone, ofTheDay];

    it('lands on its words in the page, as saved and after a sync round trip', () => {
      for (const phrase of phrases) {
        expect(bookmarkLanding(phrase, day)).toEqual({ on: 'words', inPage: true });
      }
    });

    it('opens the passage sheet without the saved words when the page cannot find them, and the page keeps its target', () => {
      for (const phrase of phrases) {
        expect(bookmarkLanding(phrase, day, true)).toEqual({ on: 'sheet', inPage: true });
      }
    });

    it('is looked for by its words, without the ellipses', () => {
      expect(bookmarkPageWords(saved)).toBe('Come to me');
      expect(bookmarkPageWords(synced)).toBe('Come to me');
      expect(bookmarkPageWords(bookmark({ kind: 'excerpt', scriptureReference: storedReferenceFor('excerpt'), scriptureText: 'Grace meets you' })))
        .toBe('Grace meets you');
    });
  });

  describe('a Scripture passage saved from the passage block or the passage sheet', () => {
    it('opens another passage in its sheet with the saved text, even when the teaching quotes it word for word', () => {
      const sheet = bookmark({ kind: 'scripture', scriptureReference: 'Matthew 11:28', scriptureText: 'Come to me', translation: 'WEB' });
      expect(bookmarkLanding(sheet, day))
        .toEqual({ on: 'sheet', inPage: false, savedPassage: { text: 'Come to me', translation: 'WEB' } });
      // After a sync round trip (no kind, no translation).
      expect(bookmarkLanding(bookmark({ scriptureReference: 'Matthew 11:28', scriptureText: 'Come to me' }), day, true))
        .toEqual({ on: 'sheet', inPage: false, savedPassage: { text: 'Come to me' } });
    });

    it('lands the day’s passage on the passage block, even when the teaching quotes it word for word', () => {
      const passage = 'Be still, and know that I am God.';
      const quoting = { scriptureReference: 'Psalm 46:10', scriptureText: passage, bodyText: `The Lord says, “${passage}” Stillness is trust.` };
      expect(bookmarkLanding(bookmark({ scriptureReference: 'Psalm 46:10', scriptureText: passage }), quoting))
        .toEqual({ on: 'passage', inPage: false });
      // The passage sheet's translation reads differently from the day's text.
      expect(bookmarkLanding(bookmark({ kind: 'scripture', scriptureReference: 'john 3:16', scriptureText: 'For God so loved the world', translation: 'KJV' }), day))
        .toEqual({ on: 'passage', inPage: false });
      expect(bookmarkLanding(bookmark({ scriptureReference: 'john 3:16', scriptureText: 'Saved main passage.' }), day))
        .toEqual({ on: 'passage', inPage: false });
    });

    it('opens another passage in its sheet with the saved text and translation', () => {
      expect(bookmarkLanding(bookmark({ scriptureReference: 'Romans 8:28', scriptureText: 'Saved related passage.', translation: 'KJV' }), day))
        .toEqual({ on: 'sheet', inPage: false, savedPassage: { text: 'Saved related passage.', translation: 'KJV' } });
      // Older builds saved the whole passage with quotedText and no kind.
      const passage = 'And we know that all things work together for good.';
      expect(bookmarkLanding(bookmark({ scriptureReference: 'Romans 8:28', scriptureText: passage, quotedText: passage }), day))
        .toEqual({ on: 'sheet', inPage: false, savedPassage: { text: passage } });
    });
  });
});
