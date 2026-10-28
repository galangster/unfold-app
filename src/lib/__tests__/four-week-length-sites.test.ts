/**
 * R2: length 28 is a first-class length. One test per app site in spec r2
 * section 5 that is keyed to a length list or to 30.
 */
import { resolveGeneratingWaitCopy } from '../generating-wait-copy';
import { resolveNotifyPromisePlacement } from '../generating-notify-state';
import { isDevotionalLengthFree } from '../premium-gating';
import { DEVOTIONAL_LENGTHS } from '../series-length';
import {
  paywallSeriesLengthRow,
  pdfCoverSubtitle,
  premiumLengthDescription,
  recapClosingMessage,
  recapLongRhythmDays,
  seriesLengthPhrase,
} from '../series-length-copy';

describe('wait line (row 5, Ruled 5)', () => {
  it('reads the first-week estimate for 28 days', () => {
    expect(resolveGeneratingWaitCopy(28, 'exit')).toBe('Your first week usually takes about two minutes.');
  });

  it('adds the leave sentence for 28 days when notifications are confirmed', () => {
    expect(resolveNotifyPromisePlacement('confirmed', 28)).toBe('wait-line');
    expect(resolveGeneratingWaitCopy(28, 'wait-line')).toBe(
      'Your first week usually takes about two minutes. You can leave this screen. We’ll let you know when Day 1 is ready.',
    );
  });

  it('keeps every other length unchanged', () => {
    expect(resolveGeneratingWaitCopy(7, 'exit')).toBe('This usually takes about two minutes.');
    expect(resolveGeneratingWaitCopy(14, 'exit')).toBe('This usually takes about three minutes.');
    expect(resolveGeneratingWaitCopy(30, 'exit')).toBe('A 30-day series usually takes four to six minutes.');
  });
});

describe('premium gating (premium-gating.ts)', () => {
  it('treats 28 days as a premium length, like 14 and 30', () => {
    expect(isDevotionalLengthFree(28)).toBe(false);
    expect(isDevotionalLengthFree(7)).toBe(true);
  });
});

describe('generating header (row 6)', () => {
  it('names a 28-day series "4-week" and keeps other lengths in days', () => {
    expect(seriesLengthPhrase(28)).toBe('4-week');
    expect(seriesLengthPhrase(30)).toBe('30-day');
    expect(seriesLengthPhrase(7)).toBe('7-day');
  });
});

describe('PDF cover (row 39)', () => {
  it('names a 28-day series in weeks and keeps other lengths in days', () => {
    expect(pdfCoverSubtitle(28)).toBe('A Four-Week Devotional Series');
    expect(pdfCoverSubtitle(30)).toBe('A 30-Day Devotional Series');
    expect(pdfCoverSubtitle(7)).toBe('A 7-Day Devotional Series');
  });
});

describe('recap closing (row 38)', () => {
  it('fires the long closing at the series total, 28 or 30', () => {
    const long = 'You have built something rare — a rhythm of returning. Whatever comes next, you have the roots for it.';
    expect(recapLongRhythmDays([{ totalDays: 30 }, { totalDays: 7 }])).toBe(30);
    expect(recapLongRhythmDays([{ totalDays: 28 }])).toBe(28);
    expect(recapClosingMessage(28, 28)).toBe(long);
    expect(recapClosingMessage(28, 30)).toBe('A week of showing up changes more than you think. The seeds are already taking root.');
    expect(recapClosingMessage(30, 30)).toBe(long);
    expect(recapClosingMessage(2, 30)).toBe('It has begun. The most important step is the next one.');
  });
});

describe('premium sheet and paywall rows (rows 3 and 4)', () => {
  it('say "4-week" and "3 days to 4 weeks" only while chapters are on', () => {
    expect(premiumLengthDescription(false)).toBe('Go deeper with 14-day and 30-day series. Free users can create up to 7-day series.');
    expect(premiumLengthDescription(true)).toBe('Go deeper with 14-day and 4-week series. Free users can create up to 7-day series.');
    expect(paywallSeriesLengthRow(false)).toBe('3 to 30 days');
    expect(paywallSeriesLengthRow(true)).toBe('3 days to 4 weeks');
  });
});

describe('length list (series-length.ts)', () => {
  it('offers 28 beside the other lengths', () => {
    expect(DEVOTIONAL_LENGTHS).toEqual([3, 7, 14, 28, 30]);
  });
});
