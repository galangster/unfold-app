import { bookmarkLanding, type LandingBookmark } from '@/lib/bookmark-landing';
import { storedReferenceFor } from '@/lib/bookmark-identity';

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

  it('lands Scripture selected in the devotional text on its words, as saved and as synced', () => {
    const selected = bookmark({ kind: 'scripture', scriptureReference: 'Matthew 11:28', scriptureText: 'Come to me', quotedText: 'Come to me' });
    const synced = bookmark({ scriptureReference: 'Matthew 11:28', scriptureText: 'Come to me' });
    const inEmphasis = bookmark({ kind: 'scripture', scriptureText: 'SO LOVED  the world', quotedText: 'SO LOVED  the world' });
    for (const saved of [selected, synced, inEmphasis]) {
      expect(bookmarkLanding(saved, day)).toEqual({ on: 'words', inPage: true });
    }
  });

  it('falls back to the passage when the page cannot find a selected phrase, and the page keeps its target', () => {
    const related = bookmark({ scriptureReference: 'Matthew 11:28', scriptureText: 'Come to me' });
    expect(bookmarkLanding(related, day, true)).toEqual({ on: 'sheet', inPage: true });
    const main = bookmark({ scriptureReference: ' john  3:16 ', scriptureText: 'so loved' });
    expect(bookmarkLanding(main, day, true)).toEqual({ on: 'passage', inPage: true });
  });

  it('lands the day’s passage on the passage block, even when the teaching quotes it word for word', () => {
    const passage = 'Be still, and know that I am God.';
    const quoting = { scriptureReference: 'Psalm 46:10', scriptureText: passage, bodyText: `The Lord says, “${passage}” Stillness is trust.` };
    expect(bookmarkLanding(bookmark({ scriptureReference: 'Psalm 46:10', scriptureText: passage }), quoting))
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

  it('opens the sheet without the saved words for a selected phrase the day no longer holds', () => {
    const phrase = bookmark({ kind: 'scripture', scriptureReference: 'Romans 8:28', scriptureText: 'all things work together', quotedText: 'all things work together' });
    expect(bookmarkLanding(phrase, day)).toEqual({ on: 'sheet', inPage: false });
  });
});
