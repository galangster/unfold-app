/**
 * Context Slot Priority System
 * Determines which single card to show in Zone 2.
 * Only one card at a time — highest priority wins.
 */

export type ContextSlotType =
  | 'resume'
  | 'evening'
  | 'midday'
  | 'bridge'
  | 'bridge-loading'
  | 'none';

export interface ContextSlotInput {
  /** User has a paused reading in progress */
  hasResumeContext: boolean;
  /** Current hour (0-23) */
  currentHour: number;
  /** Current minute (0-59) */
  currentMinute: number;
  /** User has a current devotional */
  hasDevotional: boolean;
  /** Today's reading is complete */
  hasReadToday: boolean;
  /** Midday check-in already done today */
  hasMiddayCheckIn: boolean;
  /** Evening check-in already done today */
  hasEveningCheckIn: boolean;
  /** Bridge text is loaded */
  hasBridgeText: boolean;
  /** Bridge is currently loading */
  isBridgeLoading: boolean;
  /** Bridge input is available (not day 1, has user name) */
  hasBridgeInput: boolean;
}

export function getContextSlotType(input: ContextSlotInput): ContextSlotType {
  // Priority 1: Resume card
  if (input.hasResumeContext) return 'resume';

  if (!input.hasDevotional) return 'none';

  // Priority 2: Evening wind-down (5pm-11:30pm, reading complete, no evening check-in)
  const isEveningWindow =
    (input.currentHour >= 17 && input.currentHour < 23) ||
    (input.currentHour === 23 && input.currentMinute < 30);
  if (isEveningWindow && input.hasReadToday && !input.hasEveningCheckIn) {
    return 'evening';
  }

  // Priority 3: Midday check-in (12pm-5pm, reading incomplete, no midday check-in)
  const isMiddayWindow = input.currentHour >= 12 && input.currentHour < 17;
  if (isMiddayWindow && !input.hasReadToday && !input.hasMiddayCheckIn) {
    return 'midday';
  }

  // Priority 4: Daily bridge
  if (input.hasBridgeInput && input.hasBridgeText) return 'bridge';

  // Priority 5: Bridge loading shimmer
  if (input.hasBridgeInput && input.isBridgeLoading) return 'bridge-loading';

  return 'none';
}
