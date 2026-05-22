export const TODAY_STACK_SWIPE_DISTANCE_RATIO = 0.28;
export const TODAY_STACK_SWIPE_VELOCITY = 650;
export const TODAY_STACK_HORIZONTAL_INTENT_PX = 14;
export const TODAY_STACK_HORIZONTAL_INTENT_RATIO = 1.25;
export const TODAY_STACK_MAX_ROTATION_DEG = 4;
export const TODAY_STACK_EXIT_DISTANCE_MULTIPLIER = 1.18;

export interface TodayStackSwipeDismissal {
  shouldDismiss: boolean;
  direction: -1 | 0 | 1;
}

export function hasTodayStackHorizontalIntent(translationX: number, translationY: number): boolean {
  'worklet';

  const absX = Math.abs(translationX);
  const absY = Math.abs(translationY);

  return absX >= TODAY_STACK_HORIZONTAL_INTENT_PX && absX >= absY * TODAY_STACK_HORIZONTAL_INTENT_RATIO;
}

export function getTodayStackSwipeDismissal(
  translationX: number,
  translationY: number,
  velocityX: number,
  width: number,
  reducedMotion = false,
): TodayStackSwipeDismissal {
  'worklet';

  if (reducedMotion || !hasTodayStackHorizontalIntent(translationX, translationY)) {
    return { shouldDismiss: false, direction: 0 };
  }

  const safeWidth = Math.max(1, width);
  const direction: -1 | 1 = translationX < 0 ? -1 : 1;
  const distancePassed = Math.abs(translationX) > safeWidth * TODAY_STACK_SWIPE_DISTANCE_RATIO;
  const velocityPassed = Math.abs(velocityX) > TODAY_STACK_SWIPE_VELOCITY;

  return {
    shouldDismiss: distancePassed || velocityPassed,
    direction,
  };
}
