/**
 * Pure function state machine for the DevotionalCard.
 * Computes which of 7 visual states the card should render
 * based on devotional data, reading progress, and time constraints.
 *
 * Keeps all logic testable and free of React/RN dependencies.
 */

import type { DevotionalDay, Devotional } from '@/lib/store';

// ─── State discriminated union ──────────────────────────────────

export type DevotionalCardState =
  | { type: 'empty'; onCreateNew: () => void }
  | { type: 'preparing' }
  | {
      type: 'unread';
      dayData: DevotionalDay;
      seriesTitle: string;
      totalDays: number;
      onContinue: () => void;
      onCreateNew: () => void;
      ctaText: string;
    }
  | {
      type: 'in-progress';
      dayData: DevotionalDay;
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
      seriesTitle: string;
      progress: number;
      daysCompleted: number;
      totalDays: number;
      tomorrowTeaser: string | null;
    }
  | { type: 'journey-complete'; seriesTitle: string; onCreateNew: () => void };

// ─── Input shape ────────────────────────────────────────────────

export interface ComputeInput {
  currentDevotional: Devotional | null;
  currentDayData: DevotionalDay | null;
  hasReadToday: boolean;
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
 * 1. No devotional            -> empty
 * 2. isPreparing or no dayData -> preparing
 * 3. isJourneyComplete         -> journey-complete
 * 4. hasReadToday              -> tomorrow-locked
 * 5. dayData.isRead            -> complete-today
 * 6. daysCompleted > 0         -> in-progress
 * 7. else                      -> unread
 */
export function computeDevotionalState(input: ComputeInput): DevotionalCardState {
  const {
    currentDevotional,
    currentDayData,
    hasReadToday,
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

  // 2. Content is still being generated or no day data available
  if (isPreparing || !currentDayData) {
    return { type: 'preparing' };
  }

  // 3. Entire series finished
  if (isJourneyComplete) {
    return { type: 'journey-complete', seriesTitle, onCreateNew };
  }

  // 4. Today's reading done but series not complete — locked until tomorrow
  if (hasReadToday && !currentDayData.isRead) {
    return {
      type: 'tomorrow-locked',
      dayData: currentDayData,
      seriesTitle,
      progress,
      daysCompleted,
      totalDays,
      tomorrowTeaser,
    };
  }

  // 5. Current day already read (complete-today — may still browse)
  if (currentDayData.isRead) {
    return {
      type: 'complete-today',
      dayData: currentDayData,
      seriesTitle,
      progress,
      daysCompleted,
      totalDays,
      onContinue,
      onCreateNew,
    };
  }

  // 6. Some days completed but current day unread
  if (daysCompleted > 0) {
    return {
      type: 'in-progress',
      dayData: currentDayData,
      seriesTitle,
      progress,
      daysCompleted,
      totalDays,
      onContinue,
      onCreateNew,
      ctaText,
    };
  }

  // 7. Brand-new series, nothing read yet
  return {
    type: 'unread',
    dayData: currentDayData,
    seriesTitle,
    totalDays,
    onContinue,
    onCreateNew,
    ctaText,
  };
}
