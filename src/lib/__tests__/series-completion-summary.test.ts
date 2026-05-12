import { formatSeriesCompletionSummary } from '../series-completion-summary';

describe('formatSeriesCompletionSummary', () => {
  it('returns null for empty summaries', () => {
    expect(formatSeriesCompletionSummary()).toBeNull();
    expect(formatSeriesCompletionSummary('   ')).toBeNull();
  });

  it('leaves already short summaries intact after whitespace normalization', () => {
    expect(formatSeriesCompletionSummary('God was faithful.\n\nThe practice continues.')).toBe(
      'God was faithful. The practice continues.'
    );
  });

  it('keeps a long backend reflection to an opening and closing thought', () => {
    const summary = [
      'Over seven days, you moved from the chaos of the storm to the stillness of a daily prayer.',
      'You sat with Jesus asleep in the stern while the waves came.',
      'You voiced the lament of Psalm 13 without flinching.',
      'You stood at the edge of Abraham\'s silence on the mountain and let the tension be real.',
      'The series is finished. The practice is just beginning.',
    ].join(' ');

    expect(formatSeriesCompletionSummary(summary)).toBe(
      'Over seven days, you moved from the chaos of the storm to the stillness of a daily prayer. The practice is just beginning.'
    );
  });

  it('trims very long sentence pairs at a word boundary', () => {
    const summary = `${'A very long opening sentence '.repeat(14)}. ${'Another long closing invitation '.repeat(14)}.`;
    const result = formatSeriesCompletionSummary(summary);

    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(221);
    expect(result!.endsWith('…')).toBe(true);
  });
});
