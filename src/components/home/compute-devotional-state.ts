/**
 * Pure function state machine for the DevotionalCard.
 * Computes which of 7 visual states the card should render
 * based on devotional data, reading progress, and time constraints.
 *
 * Keeps all logic testable and free of React/RN dependencies.
 */

import type { DevotionalDay, Devotional } from '@/lib/store';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';
import type { ReflectionStatus } from '@/lib/reflection-status';

export type { ReflectionStatus } from '@/lib/reflection-status';

// ─── State discriminated union ──────────────────────────────────

export type DayLabel = 'Overdue' | 'Today' | 'Tomorrow';

export type DevotionalCardState =
  | { type: 'empty'; onCreateNew: () => void }
  | { type: 'preparing'; progress: number; seriesTitle: string; dayNumber: number; onCreateNew: () => void }
  | { type: 'first-series-failed'; message: string; onTryAgain: () => void; onDismiss: () => void }
  | {
      type: 'premium-paused';
      seriesTitle: string;
      daysCompleted: number;
      totalDays: number;
      onOpenBible: () => void;
      onRenewPremium: () => void;
    }
  | {
      type: 'unread';
      dayData: DevotionalDay;
      dayLabel: DayLabel;
      seriesTitle: string;
      progress: number;
      daysCompleted: number;
      totalDays: number;
      onContinue: (dayNumber?: number) => void;
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
      onContinue: (dayNumber?: number) => void;
      onReflect: (dayNumber?: number) => void;
      onCreateNew: () => void;
      reflectionStatus: ReflectionStatus;
      /** Existing free-write text for the completed day (prefills the inline composer). */
      freeWriteDraft: string;
      /** Persist inline free-write for the completed day. */
      onSaveFreeWrite: (dayNumber: number, text: string) => void;
    }
  | {
      type: 'tomorrow-locked';
      devotionalId: string;
      /** Tomorrow's reading — the locked day the card previews. */
      dayData: DevotionalDay;
      dayLabel: DayLabel;
      seriesTitle: string;
      progress: number;
      daysCompleted: number;
      totalDays: number;
      tomorrowTeaser: string | null;
      /**
       * The day the reader finished today. The inline reflect composer writes
       * to this day, not to `dayData`. Null only when the series carries no
       * read day at all.
       */
      completedDayData: DevotionalDay | null;
      onContinue: (dayNumber?: number) => void;
      onReflect: (dayNumber?: number) => void;
      onCreateNew: () => void;
      /** Persist inline free-write for the completed day. */
      onSaveFreeWrite: (dayNumber: number, text: string) => void;
    }
  | {
      type: 'reveal-ready';
      dayData: DevotionalDay;
      dayLabel: DayLabel;
      seriesTitle: string;
      dayNumber: number;
      totalDays: number;
      onReveal: () => void;
    }
  | { type: 'journey-complete'; seriesTitle: string; onCreateNew: () => void };

// ─── Input shape ────────────────────────────────────────────────

export interface ComputeInput {
  currentDevotional: Devotional | null;
  currentDayData: DevotionalDay | null;
  hasReadToday: boolean;
  dayLabel: DayLabel;
  isJourneyComplete: boolean;
  isPreparing: boolean;
  /**
   * A series the reader left /generating for ("Go home — we'll keep writing")
   * is still being written on the server and has not reached the store.
   * Renders the preparing card for its day 1 in place of whatever the store
   * would show: the new-user empty state, or the finished journey the reader
   * tapped "Start study" from. The caller decides whether it has landed.
   */
  preparingInflightSeries?: { seriesTitle: string } | null;
  /**
   * That series failed after the reader left /generating for Today and never
   * reached the store. Renders a visible failure with a retry in place of a
   * card that would say nothing about it.
   */
  inflightSeriesFailed?: { message: string; onTryAgain: () => void; onDismiss: () => void } | null;
  premiumPolicy: PremiumAccessPolicy;
  daysCompleted: number;
  totalDays: number;
  progress: number;
  tomorrowTeaser: string | null;
  onContinue: (dayNumber?: number) => void;
  onReflect?: (dayNumber?: number) => void;
  onCreateNew: () => void;
  onOpenBible: () => void;
  onRenewPremium: () => void;
  onReveal: () => void;
  ctaText: string;
  reflectionStatus?: ReflectionStatus;
  freeWriteDraft?: string;
  onSaveFreeWrite?: (dayNumber: number, text: string) => void;
}

// ─── State machine ──────────────────────────────────────────────

/**
 * The day the reader finished most recently — by `readAt`, then by day
 * number when timestamps tie or are missing. With `hasReadToday` true this
 * is the day completed today.
 */
export function findMostRecentlyReadDay(days: readonly DevotionalDay[]): DevotionalDay | null {
  let latest: DevotionalDay | null = null;
  for (const day of days) {
    if (!day.isRead) continue;
    if (latest === null) {
      latest = day;
      continue;
    }
    const readAt = day.readAt ?? '';
    const latestReadAt = latest.readAt ?? '';
    if (readAt > latestReadAt || (readAt === latestReadAt && day.dayNumber > latest.dayNumber)) {
      latest = day;
    }
  }
  return latest;
}

/**
 * Compute the DevotionalCard state from app data.
 *
 * Priority order (first match wins):
 * 0. In-flight series not in the store yet  -> preparing (day 1)
 * 0. In-flight series failed                -> first-series-failed
 * 1. No devotional                          -> empty
 * 2. !hasReadToday && (preparing/no data)   -> preparing
 * 3. No day data (fallback)                 -> preparing
 * 4. isJourneyComplete                      -> journey-complete
 * 5. hasReadToday & next day unread         -> tomorrow-locked
 *    (carries the day completed today so the reflect composer still renders)
 * 6. dayData.isRead                         -> complete-today
 * 7. !isRead & !isRevealed & dayNumber > 1  -> reveal-ready
 * 8. else                                   -> unread  (daysCompleted may be > 0)
 */
export function computeDevotionalState(input: ComputeInput): DevotionalCardState {
  const {
    currentDevotional,
    currentDayData,
    hasReadToday,
    dayLabel,
    isJourneyComplete,
    isPreparing,
    preparingInflightSeries = null,
    inflightSeriesFailed = null,
    premiumPolicy,
    daysCompleted,
    totalDays,
    progress,
    tomorrowTeaser,
    onContinue,
    onReflect = onContinue,
    onCreateNew,
    onOpenBible,
    onRenewPremium,
    onReveal,
    ctaText,
    reflectionStatus = 'empty',
    freeWriteDraft = '',
    onSaveFreeWrite = () => {},
  } = input;

  // 0. A series the reader is waiting on from Today. It is not in the store,
  // so every store-driven state below — the empty state, the finished journey
  // the reader tapped "Start study" from — would read as "nothing is
  // happening", which is exactly what "Go home — we'll keep writing" looked
  // like. The card must say the series is being written, or that it failed.
  if (preparingInflightSeries) {
    return {
      type: 'preparing',
      progress: 0,
      seriesTitle: preparingInflightSeries.seriesTitle,
      dayNumber: 1,
      onCreateNew,
    };
  }
  if (inflightSeriesFailed) {
    return { type: 'first-series-failed', ...inflightSeriesFailed };
  }

  // 1. No devotional at all.
  if (!currentDevotional) {
    return { type: 'empty', onCreateNew };
  }

  const seriesTitle = currentDevotional.title;

  // 2. Confirmed churned users should not see generation-progress copy for a
  // missing next day. The series is paused, not being prepared.
  if (!hasReadToday && !currentDayData && premiumPolicy === 'denied') {
    return {
      type: 'premium-paused',
      seriesTitle,
      daysCompleted,
      totalDays,
      onOpenBible,
      onRenewPremium,
    };
  }

  // 3. Entire series finished. This must win over missing-data/preparing
  // states because a completed progressive series may have currentDay = totalDays + 1.
  if (isJourneyComplete) {
    return { type: 'journey-complete', seriesTitle, onCreateNew };
  }

  // 4. Content is still being generated or no day data available.
  // Never show "preparing" if the user has already read today — the completed
  // day should remain visible while the next day generates in the background.
  if (!hasReadToday && (isPreparing || !currentDayData)) {
    return {
      type: 'preparing',
      progress: 0,
      seriesTitle,
      dayNumber: currentDevotional.currentDay,
      onCreateNew,
    };
  }

  // If we somehow have no day data even after reading today, keep the active
  // series anchored instead of implying the series disappeared.
  if (!currentDayData) {
    return {
      type: 'preparing',
      progress: 0,
      seriesTitle,
      dayNumber: currentDevotional.currentDay,
      onCreateNew,
    };
  }

  // 5. Today's reading done but series not complete — locked until tomorrow.
  // If the next current day is calendar-eligible today (for example after
  // catching up an overdue day), let it continue into reveal/unread states.
  // The card still owes the reader a reflect action for the day they just
  // finished, so the completed day rides along with tomorrow's preview.
  if (hasReadToday && !currentDayData.isRead && dayLabel === 'Tomorrow') {
    return {
      type: 'tomorrow-locked',
      devotionalId: currentDevotional.id,
      dayData: currentDayData,
      dayLabel: 'Tomorrow' as DayLabel,
      seriesTitle,
      progress,
      daysCompleted,
      totalDays,
      tomorrowTeaser,
      completedDayData: findMostRecentlyReadDay(currentDevotional.days ?? []),
      onContinue,
      onReflect,
      onCreateNew,
      onSaveFreeWrite,
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
      onReflect,
      onCreateNew,
      reflectionStatus,
      freeWriteDraft,
      onSaveFreeWrite,
    };
  }

  // 6. Content available but not yet revealed — show teaser card
  //    Day 1 bypasses this (uses generating screen flow).
  if (!currentDayData.isRead && !currentDayData.isRevealed && currentDayData.dayNumber > 1) {
    return {
      type: 'reveal-ready',
      dayData: currentDayData,
      dayLabel,
      seriesTitle,
      dayNumber: currentDayData.dayNumber,
      totalDays,
      onReveal,
    };
  }

  // 7. Unread — covers both brand-new (daysCompleted=0) and in-progress (daysCompleted>0)
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
