import { shouldOfferAppFeedback } from '../app-feedback-policy';
const now = new Date('2026-09-23T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const base = { readings: 3, series: 1, lastDate: null, readingsAtLast: 0, seriesAtLast: 0, lastReviewDate: null };
it('invites feedback after a series or seven readings', () => {
  expect(shouldOfferAppFeedback({ ...base, readings: 2, series: 0 }, now)).toBe(false);
  expect(shouldOfferAppFeedback(base, now)).toBe(true);
  expect(shouldOfferAppFeedback({ ...base, readings: 6, series: 0 }, now)).toBe(false);
  expect(shouldOfferAppFeedback({ ...base, readings: 7, series: 0 }, now)).toBe(true);
});
it('does not stack private feedback on a native rating request', () => {
  expect(shouldOfferAppFeedback({ ...base, lastReviewDate: ago(0) }, now)).toBe(false);
  expect(shouldOfferAppFeedback({ ...base, lastReviewDate: ago(2) }, now)).toBe(true);
});
it('respects dismissal for thirty days and requires further progress', () => {
  const dismissed = { ...base, lastDate: ago(29), readingsAtLast: 3, seriesAtLast: 1, readings: 17 };
  expect(shouldOfferAppFeedback(dismissed, now)).toBe(false);
  expect(shouldOfferAppFeedback({ ...dismissed, lastDate: ago(30) }, now)).toBe(true);
  expect(shouldOfferAppFeedback({ ...dismissed, lastDate: ago(60), readings: 4 }, now)).toBe(false);
  expect(shouldOfferAppFeedback({ ...dismissed, lastDate: ago(30), readings: 6, series: 2 }, now)).toBe(true);
});
