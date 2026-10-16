/**
 * The bridge safety net. Banned phrases used to be deleted as raw substrings,
 * so "journeyed" became "ed", "boyfriend," became "boy", and "a season of
 * rest" became "a of rest". A phrase now counts only as whole words outside
 * quotation marks, and a bridge that holds one is dropped whole, never cut.
 * One rule decides where a sentence ends, for the splitter and for the gate
 * that Today and the cache share.
 */

import {
  countWords,
  endsSentence,
  findBannedPhrase,
  isDisplayableBridge,
  sanitizeBridgeText,
  splitSentences,
} from '../bridge-text';

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

  it('drops the whole bridge for a banned phrase in its own words, and never keeps part of it', () => {
    expect(
      sanitizeBridgeText(
        "Today's reading is about rest. Elijah slept under a tree and an angel brought him bread. It's a season of rest God hands him before the next road. What would you do with a day like that?",
      ),
    ).toBeNull();
    expect(
      sanitizeBridgeText(
        "Elijah's journey ends under a broom tree. The angel brings bread twice. Today is about the rest God gives before the next road.",
      ),
    ).toBeNull();
    expect(sanitizeBridgeText('This psalm is damn honest. It is short, and it says what it means.')).toBeNull();
  });

  it('never leaves part of a word behind', () => {
    for (const word of ['journeyed', 'boyfriend,', 'seasons', 'seasoned', 'powerfully', 'unpacked']) {
      const text = `Today's reading has one word worth a look: ${word} sits in the middle of it. The rest is plain and short and easy to read.`;
      expect(sanitizeBridgeText(text)).toBe(text);
    }
  });

  it('replaces em dashes and capitalizes god where it can only be God, but not an idol', () => {
    expect(
      sanitizeBridgeText(
        "Today's reading is about rest — the kind the Lord your god gives. It turns away from a false god of hustle. What would you put down first?",
      ),
    ).toBe(
      "Today's reading is about rest, the kind the Lord your God gives. It turns away from a false god of hustle. What would you put down first?",
    );
  });

  it('shows a bridge that ends in a curly closing quote or a bracket', () => {
    for (const text of [
      'Elijah is done, and he says so. Today the reading lets him sleep. The angel said, “Get up and eat.”',
      'Elijah is done, and he says so. Today the reading lets him sleep. (The angel brings bread twice.)',
    ]) {
      expect(sanitizeBridgeText(text)).toBe(text);
    }
  });

  it('drops a reply cut off mid-sentence instead of trimming it', () => {
    expect(
      sanitizeBridgeText("Today's reading is about rest. Elijah slept under a broom tree and an angel woke him with"),
    ).toBeNull();
  });

  it('gives the same result run twice', () => {
    const samples = [
      'Elijah is done, and he says so. The angel wakes him and says, “Get up and eat, for the journey is too much for you.” Today the reading lets rest come first.',
      "Today's reading is about rest — the kind you get with god. It is plain and it is short and it still lands well. What would you put down?",
    ];
    for (const sample of samples) {
      const once = sanitizeBridgeText(sample);
      expect(once).not.toBeNull();
      expect(sanitizeBridgeText(once!)).toBe(once);
    }
  });
});

// The reviewer's shapes (round 1, F1): a sentence split goes wrong after an
// ellipsis, before a dialogue tag, and inside a quotation. Each bridge comes
// back whole or not at all.
describe('sanitizeBridgeText where a sentence split goes wrong', () => {
  it('drops "Have you ever wondered… why" instead of keeping the half after the ellipsis', () => {
    expect(
      sanitizeBridgeText(
        'Have you ever wondered… why Elijah ran so far from everyone? He sleeps under a broom tree and wakes to bread, twice. Today is about the rest God gives before the next road.',
      ),
    ).toBeNull();
  });

  it('keeps a quoted question before its dialogue tag whole, and drops the bridge for a banned word in the tag', () => {
    const quoted =
      '"Is this really all there is?" he asks under the broom tree. Elijah has run out of road and out of words. Today the reading lets him sleep, then hands him bread.';
    expect(sanitizeBridgeText(quoted)).toBe(quoted);
    expect(
      sanitizeBridgeText(
        '"Is this all there is?" he asks under the broom tree, truly worn out. Elijah has run out of road. Today the reading lets him sleep, then hands him bread.',
      ),
    ).toBeNull();
  });

  it('keeps a sentence inside a quotation of several sentences whole, and drops the bridge for a banned word after it', () => {
    const quoted =
      'The angel says, "Sit with it. Eat the bread." Then Elijah gets up and walks for forty days. Today is about strength that arrives as a meal.';
    expect(sanitizeBridgeText(quoted)).toBe(quoted);
    expect(
      sanitizeBridgeText(
        'The angel says, "Get up. Eat the bread." Then Elijah walks a long journey of forty days. Today is about strength that arrives as a meal.',
      ),
    ).toBeNull();
  });
});

// Round 1, F3: quoted Scripture passes the gate, and "Friend," counts only
// where it opens a sentence.
describe('sanitizeBridgeText with quoted words and "Friend,"', () => {
  it('keeps 1 Kings 19:7 quoted with straight or curly quotation marks', () => {
    for (const text of [
      'Elijah is done, and he says so. The angel wakes him and says, “Get up and eat, for the journey is too much for you.” Today the reading lets rest come first.',
      'Elijah is done, and he says so. The angel wakes him and says, "Get up and eat, for the journey is too much for you." Today the reading lets rest come first.',
    ]) {
      expect(sanitizeBridgeText(text)).toBe(text);
    }
  });

  it('keeps "a friend, a sister" and drops a bridge that opens a sentence with "Friend,"', () => {
    const listed = 'Think of a friend, a sister, or a coworker you still avoid. Today is about forgiving before they ask. Who comes to mind first?';
    expect(sanitizeBridgeText(listed)).toBe(listed);
    expect(
      sanitizeBridgeText('Friend, this one is about rest. Elijah sleeps under a broom tree. The angel brings bread twice and lets him sleep.'),
    ).toBeNull();
    expect(
      sanitizeBridgeText('Rest comes first today. Friend, the angel brings bread twice. Elijah sleeps again under the tree.'),
    ).toBeNull();
  });

  it('does not let a quotation mark with no partner hide a banned word', () => {
    expect(
      sanitizeBridgeText('The angel says, "Get up and eat. The journey is too much for you. Elijah eats and sleeps again under the tree.'),
    ).toBeNull();
  });
});

describe('the sentence end rule', () => {
  it.each([
    ['Rest.', true],
    ['He said, “Eat.”', true],
    ["She asked, 'Why?'", true],
    ['Keep me (and them.)', true],
    ['Wait…', true],
    ['I call it "home"', false],
    ['and an angel woke him with', false],
  ])('%j ends a sentence: %s', (text, expected) => {
    expect(endsSentence(text)).toBe(expected);
  });

  it('holds a bridge to more than twenty characters that end a sentence', () => {
    expect(isDisplayableBridge('The angel said, “Get up and eat.”')).toBe(true);
    expect(isDisplayableBridge('Rest gets a chapter "')).toBe(false);
    expect(isDisplayableBridge('Short and done.')).toBe(false);
  });

  it('counts words across any whitespace', () => {
    expect(countWords('  one two\nthree\tfour  ')).toBe(4);
    expect(countWords('')).toBe(0);
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

  it('matches the phrases that end in punctuation without a word-end check', () => {
    expect(findBannedPhrase('Can I be honest? This one is hard.')).toBe('can i be honest?');
    expect(findBannedPhrase('Friend, this one is for you.')).toBe('friend,');
    expect(findBannedPhrase('Friend,x')).toBe('friend,');
  });

  it('counts "Friend," only where it opens a sentence', () => {
    expect(findBannedPhrase('Think of a friend, a sister, or a coworker.')).toBeNull();
    expect(findBannedPhrase('Rest first. Friend, listen.')).toBe('friend,');
    expect(findBannedPhrase('Rest first? “Friend, listen.”')).toBeNull();
  });

  it('skips the words inside matched double quotation marks', () => {
    expect(findBannedPhrase('The angel says, “the journey is too much for you.”')).toBeNull();
    expect(findBannedPhrase('The angel says, "the journey is too much for you."')).toBeNull();
    expect(findBannedPhrase('He said, "Rest." The journey goes on.')).toBe('journey');
    expect(findBannedPhrase('He said, "Rest. The journey goes on.')).toBe('journey');
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
