/**
 * Pure function state machine for the DevotionalCard.
 * Computes which of 6 visual states the card should render
 * based on devotional data, reading progress, and time constraints.
 *
 * Keeps all logic testable and free of React/RN dependencies.
 */

import type { DevotionalDay, Devotional } from '@/lib/store';

// ─── State discriminated union ──────────────────────────────────

export type DayLabel = 'Yesterday' | 'Today' | 'Tomorrow';

export type DevotionalCardState =
  | { type: 'empty'; onCreateNew: () => void }
  | { type: 'preparing'; progress: number }
  | {
      type: 'unread';
      dayData: DevotionalDay;
      dayLabel: DayLabel;
      seriesTitle: string;
      progress: number;
      daysCompleted: number;
      totalDays: number;
      onContinue: () => void;
      onCreateNew: () => void;
      ctaText: string;
    }
  | {
      type: 'complete-today';
      dayData: DevotionalDay;
      dayLabel: DayLabel;
      seriesTitle: string;
      progress: number;
      daysCompleted: number;
      totalDays: number;
      onContinue: () => void;
      onCreateNew: () => void;
    }
  | {
      type: 'tomorrow-locked';
      dayData: DevotionalDay;
      dayLabel: DayLabel;
      seriesTitle: string;
      progress: number;
      daysCompleted: number;
      totalDays: number;
      tomorrowTeaser: string | null;
      onContinue: () => void;
      onCreateNew: () => void;
    }
  | { type: 'journey-complete'; seriesTitle: string; onCreateNew: () => void };

// ─── Input shape ────────────────────────────────────────────────

export interface ComputeInput {
  currentDevotional: Devotional | null;
  currentDayData: DevotionalDay | null;
  hasReadToday: boolean;
  isCatchUp: boolean;
  dayLabel: DayLabel;
  isJourneyComplete: boolean;
  isPreparing: boolean;
  daysCompleted: number;
  totalDays: number;
  progress: number;
  tomorrowTeaser: string | null;
  onContinue: () => void;
  onCreateNew: () => void;
  ctaText: string;
}

// ─── State machine ──────────────────────────────────────────────

/**
 * Compute the DevotionalCard state from app data.
 *
 * Priority order (first match wins):
 * 1. No devotional                          -> empty
 * 2. !hasReadToday && (preparing/no data)   -> preparing
 * 3. No day data (fallback)                 -> preparing
 * 4. isJourneyComplete                      -> journey-complete
 * 5. hasReadToday & next day unread         -> tomorrow-locked
 * 6. dayData.isRead                         -> complete-today
 * 7. else                                   -> unread  (daysCompleted may be > 0)
 */
export function computeDevotionalState(input: ComputeInput): DevotionalCardState {
  const {
    currentDevotional,
    currentDayData,
    hasReadToday,
    isCatchUp,
    dayLabel,
    isJourneyComplete,
    isPreparing,
    daysCompleted,
    totalDays,
    progress,
    tomorrowTeaser,
    onContinue,
    onCreateNew,
    ctaText,
  } = input;

  // 1. No devotional at all
  if (!currentDevotional) {
    return { type: 'empty', onCreateNew };
  }

  const seriesTitle = currentDevotional.title;

  // 2. Content is still being generated or no day data available.
  // Never show "preparing" if the user has already read today — the completed
  // day should remain visible while the next day generates in the background.
  if (!hasReadToday && (isPreparing || !currentDayData)) {
    return { type: 'preparing', progress: 0 };
  }

  // If we somehow have no day data even after reading today, bail to empty
  if (!currentDayData) {
    return { type: 'preparing', progress: 0 };
  }

  // 3. Entire series finished
  if (isJourneyComplete) {
    return { type: 'journey-complete', seriesTitle, onCreateNew };
  }

  // 4. Today's reading done but series not complete — locked until tomorrow
  //    UNLESS the user is catching up on an overdue day, in which case the
  //    current content is available now (don't lock them out of today's reading).
  if (hasReadToday && !currentDayData.isRead && !isCatchUp) {
    return {
      type: 'tomorrow-locked',
      dayData: currentDayData,
      dayLabel: 'Tomorrow' as DayLabel,
      seriesTitle,
      progress,
      daysCompleted,
      totalDays,
      tomorrowTeaser,
      onContinue,
      onCreateNew,
    };
  }

  // 5. Current day already read (complete-today — may still browse)
  if (currentDayData.isRead) {
    return {
      type: 'complete-today',
      dayData: currentDayData,
      dayLabel,
      seriesTitle,
      progress,
      daysCompleted,
      totalDays,
      onContinue,
      onCreateNew,
    };
  }

  // 6. Unread — covers both brand-new (daysCompleted=0) and in-progress (daysCompleted>0)
  return {
    type: 'unread',
    dayData: currentDayData,
    dayLabel,
    seriesTitle,
    progress,
    daysCompleted,
    totalDays,
    onContinue,
    onCreateNew,
    ctaText,
  };
}
