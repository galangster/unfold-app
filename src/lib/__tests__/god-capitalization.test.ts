/**
 * The app's lowercase "god" repair and em dash spacing, held to every case in
 * the backend's tests (unfold-backend ab7d932,
 * src/lib/__tests__/validator-non-body-prose.test.ts) so the two safety nets
 * agree. A lowercase "god" is capitalized only in a name position.
 */

import { spaceEmDashes } from '../bridge-text';
import { capitalizeGodSlips } from '../god-capitalization';

/** The backend's repair of a short field: em dashes, then god, then double spaces. */
function repair(text: string): string {
  return capitalizeGodSlips(spaceEmDashes(text)).replace(/ {2,}/g, ' ');
}

describe('capitalizeGodSlips', () => {
  it.each([
    ['This hits different — because god is near.', 'This hits different, because God is near.'],
    ['Where do you need god to meet you today?', 'Where do you need God to meet you today?'],
    ['Where does god feel close?', 'Where does God feel close?'],
    ['Where do you need god to meet you?', 'Where do you need God to meet you?'],
  ])('repairs the fields of a day: %s', (text, expected) => {
    expect(repair(text)).toBe(expected);
  });

  it.each([
    'Name the comfort that has become a god to you.',
    'Which habit has become a quiet god?',
    'Is there another god you run to?',
    'No other god can carry this.',
    'The god of this age has blinded the minds of unbelievers.',
    'Notice where the god of this age asks for your attention.',
    'Where do you meet a faithful god in this passage?',
    'Which false god asked for your time?',
    'A faithful god keeps every promise.',
  ])('keeps an idol named as a god, the god of this age, and a qualified god lowercase: %s', (text) => {
    expect(capitalizeGodSlips(text)).toBe(text);
  });

  // A lowercase "god" is capitalized only where it can only be a name. The
  // model writes lowercase "god" mostly for an idol, so every other place
  // keeps it as written, true-God slips included ("a god who stays").
  it.each([
    'Baal, the Canaanite storm god, never answered.',
    'Dagon, the god of the Philistines, fell.',
    'Chemosh, the god of Moab, demanded much.',
    'Molech was an Ammonite god.',
    'Baal was a pagan god of storms.',
    'Is comfort a smaller god you serve?',
    'Name a man-made god you trust.',
    'They bowed to the god Baal.',
    'Watch the god of this present age.',
    'Notice the god of this  world.',
    'Stop serving the god of approval.',
    'Is comfort your god?',
    'Their god is their stomach.',
    "Chemosh was Moab's god.",
    'Which god are you serving this week?',
    'That god cannot save you.',
    'Is this god worth it?',
    'What has become your true god?',
    'Ra, the great sun god, rose.',
    'Baal was a distant and silent god.',
    'A household god sat by the door.',
    'Remember you serve a god who stays.',
    'The Lord is a god of justice.',
    'Worship the one true god.',
  ])('keeps an idol or a god in general lowercase: %s', (text) => {
    expect(capitalizeGodSlips(text)).toBe(text);
  });

  it.each([
    // The start of a sentence.
    'god is near.',
    'Rest. god is near.',
    // A preposition, a conjunction, an auxiliary, or a verb of prayer and trust.
    "Rest in god's love.",
    'Say no and god will help.',
    'No one but god sees it.',
    'When god Feels Far',
    'Does god care?',
    'Where do you need god to meet you?',
    'Trust god with this.',
    'Thank god You are near.',
    'Pray to god Most High.',
    // "that" inside a sentence, "our", and "Lord".
    'Know that god is near.',
    'Our god is near.',
    'Holy is the Lord god Almighty.',
    'Love the Lord your god with all your heart.',
    // A name of God.
    'The god of Israel keeps watch.',
    'Rest in the god of all comfort.',
    // Compounds.
    'Use a god-given gift today.',
    'She was a god-fearing woman.',
    'There is a god-shaped hole.',
    'Read a god-breathed word.',
    'Make a god-honoring choice.',
    'Live a god-centered life.',
    'Live a god-centred life.',
    'Dream a god-sized dream.',
    'It was a god-ordained moment.',
    'She was a god-sent friend.',
    'Do a god-glorifying act.',
    'Write a god-inspired idea.',
  ])('capitalizes a lowercase god in a name position: %s', (text) => {
    expect(capitalizeGodSlips(text)).toBe(text.replace(/\bgod\b/, 'God'));
  });

  it('leaves words that only contain "god" alone', () => {
    const text = 'A godly woman, a godmother, and a demigod walk in.';
    expect(capitalizeGodSlips(text)).toBe(text);
  });

  it.each([
    ['spaces before a name', `${' '.repeat(60_000)}god is near.`],
    ['spaces and a far em dash', `${' '.repeat(60_000)}god is near — always.`],
    ['many qualified gods', 'a quiet god '.repeat(20_000)],
  ])('repairs a long field quickly: %s', (_kind, text) => {
    const started = performance.now();

    repair(text);

    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('spaceEmDashes', () => {
  it.each([
    ['a — b', 'a, b'],
    ['a—b', 'a, b'],
    ['— —', ', , '],
    ['a \t—\n b — c', 'a, b, c'],
  ])('turns an em dash and its spaces into a comma: %j', (text, expected) => {
    expect(spaceEmDashes(text)).toBe(expected);
  });
});
