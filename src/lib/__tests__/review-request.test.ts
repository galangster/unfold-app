import * as StoreReview from 'expo-store-review';
import { requestReviewAfterCompletion } from '../review-prompt';
import { useUnfoldStore } from '../store';
jest.mock('expo-store-review', () => ({ isAvailableAsync: jest.fn(), requestReview: jest.fn() }));
jest.mock('@/lib/store', () => ({ useUnfoldStore: { getState: jest.fn() } }));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn() } }));
const completion = { totalDaysCompleted: 3, currentStreak: 3, justCompletedSeries: false };
const record = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (useUnfoldStore.getState as jest.Mock).mockReturnValue({ reviewPromptDates: [], reviewPromptLastDate: null, reviewPromptCount: 0, reviewPromptDaysAtLast: 0, hasReviewed: false, recordReviewPrompt: record });
  (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (StoreReview.requestReview as jest.Mock).mockResolvedValue(undefined);
});
it('consumes one attempt even if completion callbacks race', async () => {
  const results = await Promise.all([requestReviewAfterCompletion(completion), requestReviewAfterCompletion(completion)]);
  expect(results).toEqual([true, false]);
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith(3);
});
it('does not spend the budget on unavailable or failed requests', async () => {
  (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  expect(await requestReviewAfterCompletion(completion)).toBe(false);
  (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (StoreReview.requestReview as jest.Mock).mockRejectedValue(new Error('unavailable'));
  expect(await requestReviewAfterCompletion(completion)).toBe(false);
  expect(record).not.toHaveBeenCalled();
});
