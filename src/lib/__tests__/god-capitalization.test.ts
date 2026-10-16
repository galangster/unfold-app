/**
 * The app's lowercase "god" repair and em dash spacing, held to every case in
 * the backend's tests (unfold-backend fef122a,
 * src/lib/__tests__/validator-non-body-prose.test.ts) so the two safety nets
 * agree. A lowercase "god" is capitalized only where it can only be God.
 */

import { spaceEmDashes } from '../bridge-text';
import { capitalizeGodSlips } from '../god-capitalization';

/** The backend's repair of a short field: em dashes, then god, then double spaces. */
function repair(text: string): string {
  return capitalizeGodSlips(spaceEmDashes(text)).replace(/ {2,}/g, ' ');
}

describe('capitalizeGodSlips', () => {
  it.each([
    ['This hits different — and it lasts. god is near.', 'This hits different, and it lasts. God is near.'],
    ['How does the Lord your god meet you today?', 'How does the Lord your God meet you today?'],
    ['Where does the Lord our god feel close?', 'Where does the Lord our God feel close?'],
  ])('repairs the fields of a day: %s', (text, expected) => {
    expect(repair(text)).toBe(expected);
  });

  // The model capitalizes God when it means God, so every lowercase "god"
  // outside a name position keeps its casing: idols, and the rare slip alike.
  it.each([
    'Name the comfort that has become a god to you.',
    'Which habit has become a quiet god?',
    'Is there another god you run to?',
    'No other god can carry this.',
    'Notice where the god of this age asks for your attention.',
    'Which false god asked for your time?',
    'Where do you meet a faithful god in this passage?',
    'A faithful god keeps every promise.',
    'Baal, the Canaanite storm god, never answered.',
    'Dagon, the god of the Philistines, fell.',
    'Chemosh, the god of Moab, demanded much.',
    'Molech was an Ammonite god.',
    'Baal was a pagan god of storms.',
    'They bowed to the god Baal.',
    'Stop serving the god of approval.',
    'Is comfort your god?',
    'Is comfort our god?',
    'Their god is their stomach.',
    'Which god are you serving this week?',
    'That god cannot save you.',
    'Remember you serve a god who stays.',
    'The Lord is a god of justice.',
    'Worship the one true god.',
    'Zeus, king of the gods and god of the sky, ruled Olympus.',
    'Eros, the god of love, ruled the songs.',
    'Anu, the god of heaven, ruled the sky.',
    'Money is a “god” that never sleeps.',
    'Ra, the sun-god, rose.',
    'Baal: god of storms.',
    'Athens had an altar to every known god.',
    'Roman coins called Augustus son of god.',
    'Inscriptions hailed Augustus as savior and god.',
    'Money becomes a kind of god.',
    'Has comfort become your lord, your god?',
    'Comfort can quietly turn into our god.',
    'Trust god with this.',
    'Where do you need god to meet you?',
    'Know that god is near.',
    'Our god is near.',
    "Rest in god's love.",
  ])('leaves a lowercase god outside a name position as written: %s', (text) => {
    expect(capitalizeGodSlips(text)).toBe(text);
  });

  it.each([
    'god is near.',
    'Rest. god is near.',
    '“Be still.” god is near.',
    "She called it 'rest.' god is near.",
    'Read Psalm 4. (Read it slowly.) god is near.',
    'Holy is the Lord god Almighty.',
    'Amos calls Him the LORD god of hosts.',
    'Love the Lord your god with all your heart.',
    'I am the Lord thy god.',
    'O Lord, my god, I trust You.',
    'They forgot the Lord their god.',
    'Naomi returned to the Lord her god.',
    'The god of Israel keeps watch.',
    'Rest in the god of all comfort.',
    'Walk with the god of love and peace.',
    'The god of heaven and earth made you.',
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
  ])('capitalizes a lowercase god that can only be God: %s', (text) => {
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

    // Linear code takes a few ms; a quadratic pass took about 1.9 s here.
    expect(performance.now() - started).toBeLessThan(500);
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
