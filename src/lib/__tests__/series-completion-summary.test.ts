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

  it('prefers a whole opening sentence over an ellipsis when the pair is too long', () => {
    const first =
      'Over seven days you moved from the chaos of the storm to the stillness of a daily prayer, and you did not look away once from the hard parts of it.';
    const last =
      'The series is finished now, but the practice of sitting with Him in the quiet is only just beginning for you.';
    expect(`${first} ${last}`.length).toBeGreaterThan(220);

    const result = formatSeriesCompletionSummary(`${first} ${last}`);

    expect(result).toBe(first);
    expect(result!.endsWith('…')).toBe(false);
  });

  it('never ends mid-word when it must ellipsis-trim', () => {
    const result = formatSeriesCompletionSummary(`${'unbroken '.repeat(40)}sentence with no stops`);

    expect(result!.endsWith('…')).toBe(true);
    // The character before the ellipsis closes a word, never splits one.
    expect(result!.slice(0, -1)).toMatch(/\w$/);
    expect(`${result!.slice(0, -1)} `).toContain('unbroken ');
  });
});
