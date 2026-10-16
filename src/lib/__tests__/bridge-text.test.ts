/**
 * The bridge safety net. Banned phrases used to be deleted as raw substrings,
 * so "journeyed" became "ed", "boyfriend," became "boy", and "a season of
 * rest" became "a of rest". A phrase now counts only as whole words, and the
 * sentence that holds one goes whole, or the bridge is dropped.
 */

import { findBannedPhrase, sanitizeBridgeText, splitSentences } from '../bridge-text';

describe('sanitizeBridgeText', () => {
  it('keeps a word that only contains a banned phrase', () => {
    const text =
      "Today's reading follows Ruth, who journeyed to a land she did not know. It's about loyalty when it costs you something. What would that look like this week?";

    expect(sanitizeBridgeText(text)).toBe(text);
  });

  it('keeps "boyfriend," whole', () => {
    const text =
      "Today's reading is about forgiveness that costs something. Think of the boyfriend, the brother, or the boss you still avoid. Who comes to mind first?";

    expect(sanitizeBridgeText(text)).toBe(text);
  });

  it('removes the whole sentence that holds "a season of rest", never part of it', () => {
    const text =
      "Today's reading is about rest. Elijah slept under a tree and an angel brought him bread. It's a season of rest God hands him before the next road. What would you do with a day like that?";

    const cleaned = sanitizeBridgeText(text);

    expect(cleaned).toBe(
      "Today's reading is about rest. Elijah slept under a tree and an angel brought him bread. What would you do with a day like that?",
    );
    expect(cleaned).not.toContain('a of rest');
  });

  it('drops the bridge when removing a sentence leaves too little to read as one', () => {
    expect(sanitizeBridgeText("It's about a season of rest. Elijah slept for a long time.")).toBeNull();
    expect(sanitizeBridgeText('This psalm is damn honest. It is short.')).toBeNull();
  });

  it('never leaves part of a word behind', () => {
    for (const word of ['journeyed', 'boyfriend,', 'seasoned', 'powerfully', 'unpacked']) {
      const text = `Today's reading has one word worth a look: ${word} sits in the middle of it. The rest is plain and short and easy to read.`;
      expect(sanitizeBridgeText(text)).toBe(text);
    }
  });

  it('replaces em dashes and fixes a lowercase god that names God, but not an idol', () => {
    expect(
      sanitizeBridgeText(
        "Today's reading is about rest — the kind god gives before the next road. It turns away from a false god of hustle. What would you put down first?",
      ),
    ).toBe(
      "Today's reading is about rest, the kind God gives before the next road. It turns away from a false god of hustle. What would you put down first?",
    );
  });

  it('keeps only the complete sentences of a reply cut off mid-sentence', () => {
    expect(
      sanitizeBridgeText("Today's reading is about rest. Elijah slept under a broom tree and an angel woke him with"),
    ).toBe("Today's reading is about rest.");
  });

  it('gives the same result run twice', () => {
    const samples = [
      "Today's reading is about rest. Elijah slept under a tree and an angel brought him bread. It's a season of rest God hands him. What would you do with a day like that?",
      "Today's reading is about rest — the kind god gives. It is plain and it is short and it still lands well. What would you put down?",
    ];
    for (const sample of samples) {
      const once = sanitizeBridgeText(sample);
      expect(once).not.toBeNull();
      expect(sanitizeBridgeText(once!)).toBe(once);
    }
  });
});

describe('findBannedPhrase', () => {
  it('finds the longest phrase first', () => {
    expect(findBannedPhrase("It's a season of rest.")).toBe('season of');
    expect(findBannedPhrase("Here's what most people skip past in the story.")).toBe("here's what most people skip past");
  });

  it('matches a curly apostrophe and any spacing', () => {
    expect(findBannedPhrase('Here’s the thing about rest.')).toBe("here's the thing");
    expect(findBannedPhrase('You can sit\nwith it.')).toBe('sit with');
  });

  it('matches whole words only', () => {
    expect(findBannedPhrase('She journeyed home with her boyfriend, tired.')).toBeNull();
    expect(findBannedPhrase('The journey home was long.')).toBe('journey');
  });
});

describe('splitSentences', () => {
  it('keeps end punctuation, closing quotes, abbreviations, and decimals inside their sentence', () => {
    expect(splitSentences('St. Paul wrote it. He said "Rest." Then 3.5 miles later, quiet!')).toEqual([
      'St. Paul wrote it.',
      'He said "Rest."',
      'Then 3.5 miles later, quiet!',
    ]);
  });
});
