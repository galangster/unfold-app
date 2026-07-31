/**
 * Day 1 belongs to the notification ask, not the App Store review sheet.
 *
 * Day progression is calendar-gated, so after the first reading the user
 * physically cannot continue until tomorrow — whether they return is the whole
 * product. The review prompt used to fire on `totalDaysCompleted === 1` and the
 * notification ask happened earlier, on a loading spinner. These are swapped:
 * notifications get day 1, reviews start at day 3.
 */
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(async () => true),
  requestReview: jest.fn(async () => undefined),
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}));

import { ReviewPromptManager } from '@/lib/review-prompt';

function manager() {
  return new ReviewPromptManager({
    lastPromptDate: null,
    promptCountThisYear: 0,
    hasReviewed: false,
    daysCompletedAtLastPrompt: 0,
  });
}

const base = {
  journalEntryCount: 0,
  justCompletedDay: true,
  currentStreak: 1,
  justCompletedSeries: false,
};

describe('review prompt triggers', () => {
  it('does not ask on the first completed day', () => {
    expect(manager().shouldPrompt({ ...base, totalDaysCompleted: 1 })).toBe(false);
  });

  it('does not ask on day 2 either', () => {
    expect(manager().shouldPrompt({ ...base, totalDaysCompleted: 2 })).toBe(false);
  });

  it('asks on day 3', () => {
    expect(manager().shouldPrompt({ ...base, totalDaysCompleted: 3 })).toBe(true);
  });

  it('still asks when a whole series is finished, even on day 1', () => {
    // Finishing a 1-day series is a genuine high point and terminal — there is
    // no "tomorrow" to promise, so the review ask is the right one here.
    expect(
      manager().shouldPrompt({ ...base, totalDaysCompleted: 1, justCompletedSeries: true }),
    ).toBe(true);
  });

  it('still asks at streak milestones', () => {
    for (const currentStreak of [7, 14, 30]) {
      expect(
        manager().shouldPrompt({ ...base, totalDaysCompleted: 10, currentStreak }),
      ).toBe(true);
    }
  });

  it('never asks outside a completion moment', () => {
    expect(
      manager().shouldPrompt({ ...base, totalDaysCompleted: 3, justCompletedDay: false }),
    ).toBe(false);
  });
});
