/**
 * titleWithPeriod adds a period unless the title already ends a sentence, by
 * the app's one sentence-end rule. It used to accept one straight closer only,
 * so a title ending in a curly quote got a second stop.
 */

import { titleWithPeriod } from '../display-title';

describe('titleWithPeriod', () => {
  it.each([
    ['Rest', 'Rest.'],
    ['Rest.', 'Rest.'],
    ['Why Rest?', 'Why Rest?'],
    ['Say “Yes.”', 'Say “Yes.”'],
    ['Keep Me (and Them.)', 'Keep Me (and Them.)'],
    ['I Call It "Home"', 'I Call It "Home".'],
    ['  ', ''],
  ])('%j becomes %j', (title, expected) => {
    expect(titleWithPeriod(title)).toBe(expected);
  });
});
