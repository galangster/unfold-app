/**
 * Quiet hours for computed one-shots (snoozes, late act nudges). The
 * reader's own chosen slots are never moved; only notifications the app
 * decides the time of respect this window.
 */
export const QUIET_HOURS = { startHour: 22, endHour: 7 } as const;
const RESUME_MINUTE = 30;
const LAST_NON_QUIET_HOUR = QUIET_HOURS.startHour - 1;
const LAST_NON_QUIET_MINUTE = 59;

export function isQuietTime(at: Date): boolean {
  const hour = at.getHours();
  return hour >= QUIET_HOURS.startHour || hour < QUIET_HOURS.endHour;
}

/**
 * Moves an instant that falls in quiet hours to the next morning's resume
 * time (07:30). Instants outside quiet hours come back unchanged.
 */
export function deferPastQuietHours(at: Date): Date {
  if (!isQuietTime(at)) return at;
  const resume = new Date(at);
  if (at.getHours() >= QUIET_HOURS.startHour) resume.setDate(resume.getDate() + 1);
  resume.setHours(QUIET_HOURS.endHour, RESUME_MINUTE, 0, 0);
  return resume;
}

/**
 * Moves an instant that falls in quiet hours to the latest earlier
 * non-quiet instant (21:59). Never moves later.
 */
export function latestNonQuietAtOrBefore(at: Date): Date {
  const hour = at.getHours();
  if (hour >= QUIET_HOURS.startHour) {
    const moved = new Date(at);
    moved.setHours(LAST_NON_QUIET_HOUR, LAST_NON_QUIET_MINUTE, 0, 0);
    return moved;
  }
  if (hour < QUIET_HOURS.endHour) {
    const moved = new Date(at);
    moved.setDate(moved.getDate() - 1);
    moved.setHours(LAST_NON_QUIET_HOUR, LAST_NON_QUIET_MINUTE, 0, 0);
    return moved;
  }
  return new Date(at.getTime());
}
