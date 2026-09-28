import { cleanRecommendationReason } from '../recommendation-text';

const SENTENCE = 'This series meets you where doubt feels more honest than certainty.';

describe('cleanRecommendationReason', () => {
  it.each([
    ['a heading line', `# Recommendation\n\n${SENTENCE}`],
    ['a deeper heading with a rule under it', `## Why this fits\n---\n${SENTENCE}`],
    ['an underlined heading', `Recommendation\n==============\n${SENTENCE}`],
    ['a heading inside a quote', `> # Recommendation\n${SENTENCE}`],
    ['a heading inside a list item', `- # Recommendation\n${SENTENCE}`],
    ['a fenced block', '```text\n' + SENTENCE + '\n```'],
    ['a bold label', `**Recommendation:** ${SENTENCE}`],
    ['a bold label with the colon outside', `**Recommendation**: ${SENTENCE}`],
    ['a plain label', `Recommendation: ${SENTENCE}`],
    ['a quoted label', `"Recommendation: ${SENTENCE}"`],
    ['a list marker', `- ${SENTENCE}`],
    ['a blockquote marker', `> ${SENTENCE}`],
    ['emphasis inside the sentence', 'This series meets you where **doubt** feels more _honest_ than certainty.'],
    ['wrapping quotes', `"${SENTENCE}"`],
  ])('returns plain text for %s', (_label, raw) => {
    expect(cleanRecommendationReason(raw)).toBe(SENTENCE);
  });

  it.each([
    ['an ordinary hash', 'Day #3 builds on this theme.'],
    ['a short line', 'Find rest.'],
    ['literal symbols', 'Use * as a reminder, and read study_notes (*) slowly.'],
    ['an embedded quotation', 'Jesus says, "Come to me."'],
    ['a leading quotation', '"Be still," says Psalm 46:10.'],
    ['inline pipes', 'This season calls for prayer | patience | trust.'],
  ])('keeps %s as written', (_label, raw) => {
    expect(cleanRecommendationReason(raw)).toBe(raw);
  });

  it('keeps a bold introductory clause that is not a recommendation label', () => {
    expect(cleanRecommendationReason('**When you feel weary:** this series offers rest.')).toBe(
      'When you feel weary: this series offers rest.',
    );
  });

  it.each([
    ['a heading with no sentence', '# Recommendation'],
    ['a link', `${SENTENCE} [Start here](https://example.test)`],
    ['a reference link', 'This series invites you to rest [here][1].'],
    ['a reference definition', `${SENTENCE}\n[1]: https://example.test`],
    ['html', `<b>${SENTENCE}</b>`],
    ['an HTML comment', `<!-- Recommendation --> ${SENTENCE}`],
    ['a table row', `| Theme | ${SENTENCE} |`],
    ['a table without edge pipes', `Theme | Reason\n--- | ---\nRest | ${SENTENCE}`],
    ['strikethrough', 'Find ~~rest~~ in Him.'],
    ['a missing value', undefined],
    ['a non-string value', null],
  ])('rejects %s', (_label, raw) => {
    expect(cleanRecommendationReason(raw)).toBeNull();
  });

  it.each([
    ['unmatched brackets', '['.repeat(80_000)],
    ['unclosed tags', '<a'.repeat(40_000)],
  ])('rejects oversized input with %s without scanning it', (_label, raw) => {
    const started = performance.now();
    expect(cleanRecommendationReason(raw)).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });

  it.each([
    `> # Recommendation\n${SENTENCE}`,
    `- - ${SENTENCE}`,
    `"Recommendation: Recommendation: ${SENTENCE}"`,
    `**# Recommendation**\n${SENTENCE}`,
    '***Find rest.***',
  ])('gives the same text on a second pass: %j', (raw) => {
    const once = cleanRecommendationReason(raw);
    expect(once).not.toBeNull();
    expect(cleanRecommendationReason(once)).toBe(once);
  });
});
