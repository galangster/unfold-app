const DAY_MS = 86_400_000;
export const REVIEW_COOLDOWN_DAYS = 60;

export interface ReviewPromptHistory {
  reviewPromptDates?: string[];
  reviewPromptLastDate: string | null;
  reviewPromptCount: number;
  reviewPromptDaysAtLast: number;
  hasReviewed: boolean;
}

export interface ReviewCompletion {
  totalDaysCompleted: number;
  currentStreak: number;
  justCompletedSeries: boolean;
}

export function getRecentReviewRequests(history: ReviewPromptHistory, now = new Date()): string[] {
  // Older builds retained only a count and the latest request. Keep that budget
  // conservatively until its latest request leaves the rolling year.
  const dates = history.reviewPromptDates?.length
    ? history.reviewPromptDates
    : Array.from({ length: Math.min(3, Math.max(0, history.reviewPromptCount)) }, () => history.reviewPromptLastDate ?? '');
  return dates.filter((date) => {
    const timestamp = Date.parse(date);
    return Number.isFinite(timestamp) && now.getTime() - timestamp < 365 * DAY_MS;
  });
}

export function shouldRequestReview(
  history: ReviewPromptHistory,
  completion: ReviewCompletion,
  now = new Date(),
): boolean {
  if (history.hasReviewed || completion.totalDaysCompleted < 3) return false;
  if (completion.totalDaysCompleted <= history.reviewPromptDaysAtLast) return false;
  const dates = getRecentReviewRequests(history, now);
  if (dates.length >= 3) return false;
  const latest = Math.max(0, ...dates.map((date) => Date.parse(date)));
  if (now.getTime() - latest < REVIEW_COOLDOWN_DAYS * DAY_MS) return false;
  return dates.length === 0
    || completion.justCompletedSeries
    || [7, 14, 30].includes(completion.currentStreak)
    || completion.totalDaysCompleted - history.reviewPromptDaysAtLast >= 7;
}
