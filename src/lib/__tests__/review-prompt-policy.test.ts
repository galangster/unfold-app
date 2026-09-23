import { getRecentReviewRequests, shouldRequestReview, type ReviewPromptHistory } from '../review-prompt-policy';
const now = new Date('2026-09-23T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const empty: ReviewPromptHistory = { reviewPromptDates: [], reviewPromptLastDate: null, reviewPromptCount: 0, reviewPromptDaysAtLast: 0, hasReviewed: false };
const completion = { totalDaysCompleted: 3, currentStreak: 3, justCompletedSeries: false };
it('waits for three readings and catches an opportunity missed on exactly day three', () => {
  expect(shouldRequestReview(empty, { ...completion, totalDaysCompleted: 1 }, now)).toBe(false);
  expect(shouldRequestReview(empty, completion, now)).toBe(true);
  expect(shouldRequestReview(empty, { ...completion, totalDaysCompleted: 4 }, now)).toBe(true);
});
it('shares a cooldown across completion milestones and app versions', () => {
  const history = { ...empty, reviewPromptDates: [ago(59)], reviewPromptDaysAtLast: 3 };
  expect(shouldRequestReview(history, { ...completion, totalDaysCompleted: 10, justCompletedSeries: true }, now)).toBe(false);
  expect(shouldRequestReview({ ...history, reviewPromptDates: [ago(60)] }, { ...completion, totalDaysCompleted: 10 }, now)).toBe(true);
});
it('enforces three attempts within a rolling year, then frees the expired slot', () => {
  const history = { ...empty, reviewPromptDates: [ago(364), ago(200), ago(90)], reviewPromptDaysAtLast: 10 };
  expect(shouldRequestReview(history, { ...completion, totalDaysCompleted: 20 }, now)).toBe(false);
  expect(shouldRequestReview({ ...history, reviewPromptDates: [ago(366), ago(200), ago(90)] }, { ...completion, totalDaysCompleted: 20 }, now)).toBe(true);
});
it('migrates legacy counters conservatively without blocking forever', () => {
  const legacy = { ...empty, reviewPromptCount: 3, reviewPromptLastDate: ago(90) };
  expect(getRecentReviewRequests(legacy, now)).toHaveLength(3);
  expect(getRecentReviewRequests({ ...legacy, reviewPromptLastDate: ago(366) }, now)).toEqual([]);
});
it('requires new progress and respects a known completed review', () => {
  expect(shouldRequestReview({ ...empty, reviewPromptDaysAtLast: 3 }, completion, now)).toBe(false);
  expect(shouldRequestReview({ ...empty, hasReviewed: true }, completion, now)).toBe(false);
});
