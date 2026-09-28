import { cleanRecommendationReason } from '../recommendation-text';

const SENTENCE = 'This series meets you where doubt feels more honest than certainty.';

describe('cleanRecommendationReason', () => {
  it.each([
    ['a heading line', `# Recommendation\n\n${SENTENCE}`],
    ['a deeper heading with a rule under it', `## Why this fits\n---\n${SENTENCE}`],
    ['an underlined heading', `Recommendation\n==============\n${SENTENCE}`],
    ['a bold label', `**Recommendation:** ${SENTENCE}`],
    ['a bold label with the colon outside', `**Recommendation**: ${SENTENCE}`],
    ['a plain label', `Recommendation: ${SENTENCE}`],
    ['a quoted label', `"Recommendation: ${SENTENCE}"`],
    ['a list marker', `- ${SENTENCE}`],
    ['a blockquote marker', `> ${SENTENCE}`],
    ['emphasis inside the sentence', 'This series meets you where **doubt** feels more _honest_ than certainty.'],
    ['wrapping quotes', `"${SENTENCE}"`],
    ['plain text', SENTENCE],
  ])('returns plain text for %s', (_label, raw) => {
    expect(cleanRecommendationReason(raw)).toBe(SENTENCE);
  });

  it('keeps an ordinary hash inside a sentence', () => {
    expect(cleanRecommendationReason('Day #3 builds on this theme.')).toBe('Day #3 builds on this theme.');
  });

  it('keeps a short plain line', () => {
    expect(cleanRecommendationReason('Find rest.')).toBe('Find rest.');
  });

  it.each([
    ['a heading with no sentence', '# Recommendation'],
    ['a link', `${SENTENCE} [Start here](https://example.test)`],
    ['html', `<b>${SENTENCE}</b>`],
    ['a table row', `| Theme | ${SENTENCE} |`],
    ['a reference link', 'This series invites you to rest [here][1].'],
    ['a reference definition', `${SENTENCE}\n[1]: https://example.test`],
  ])('rejects %s', (_label, raw) => {
    expect(cleanRecommendationReason(raw)).toBeNull();
  });
});
