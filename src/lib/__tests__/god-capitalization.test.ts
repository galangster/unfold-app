/**
 * The app's lowercase "god" repair, held to the backend's cases
 * (unfold-backend src/lib/__tests__/validator-non-body-prose.test.ts) so the
 * two safety nets agree. The app used to capitalize every \bgod\b, which
 * made "a false god" read "a false God".
 */

import { capitalizeGodSlips } from '../god-capitalization';

describe('capitalizeGodSlips', () => {
  it.each([
    ['This hits different, because god is near.', 'This hits different, because God is near.'],
    ['Where do you need god to meet you today?', 'Where do you need God to meet you today?'],
    ['Where does god feel close?', 'Where does God feel close?'],
    ['Where do you need god to meet you?', 'Where do you need God to meet you?'],
    ['Where do you meet a faithful god in this passage?', 'Where do you meet a faithful God in this passage?'],
    ['A faithful god keeps every promise.', 'A faithful God keeps every promise.'],
  ])('capitalizes god where it names God: %s', (text, expected) => {
    expect(capitalizeGodSlips(text)).toBe(expected);
  });

  it.each([
    'Name the comfort that has become a god to you.',
    'Which habit has become a quiet god?',
    'Is there another god you run to?',
    'No other god can carry this.',
    'The god of this age has blinded the minds of unbelievers.',
    'Notice where the god of this age asks for your attention.',
    'Which false god asked for your time?',
    'Do not bow to a false god.',
  ])('keeps an idol named as a god lowercase: %s', (text) => {
    expect(capitalizeGodSlips(text)).toBe(text);
  });

  // A lowercase "god" is capitalized only where it names God. After a
  // determiner or a possessive it stays lowercase, because the model writes
  // lowercase "god" mostly for an idol: "a god who stays" stays as written.
  it.each([
    'Baal, the Canaanite storm god, never answered.',
    'Dagon, the god of the Philistines, fell.',
    'Molech was an Ammonite god.',
    'Baal was a pagan god of storms.',
    'Is comfort a smaller god you serve?',
    'Name a man-made god you trust.',
    'They bowed to the god Baal.',
    'Watch the god of this present age.',
    'Notice the god of this  world.',
    'Is comfort your god?',
    'Their god is their stomach.',
    'A household god sat by the door.',
    'Remember you serve a god who stays.',
  ])('keeps an idol or a god in general lowercase: %s', (text) => {
    expect(capitalizeGodSlips(text)).toBe(text);
  });

  it.each([
    ['Use a god-given gift today.', 'Use a God-given gift today.'],
    ['Every god-given gift is grace.', 'Every God-given gift is grace.'],
    ['There is a god-shaped hole.', 'There is a God-shaped hole.'],
    ['Say no and god will help.', 'Say no and God will help.'],
    ['Where did David trust god today?', 'Where did David trust God today?'],
    ['Our god is near.', 'Our God is near.'],
    ['Holy is the Lord god Almighty.', 'Holy is the Lord God Almighty.'],
    ['Worship the one true god.', 'Worship the one true God.'],
    ['The god of Israel keeps watch.', 'The God of Israel keeps watch.'],
    ['No one but god sees it.', 'No one but God sees it.'],
  ])('capitalizes a lowercase god that names God: %s', (text, expected) => {
    expect(capitalizeGodSlips(text)).toBe(expected);
  });

  it('leaves words that only contain "god" alone', () => {
    const text = 'A godly woman, a godmother, and a demigod walk in.';
    expect(capitalizeGodSlips(text)).toBe(text);
  });
});
