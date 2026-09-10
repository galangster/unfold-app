/**
 * Quiet hours for computed one-shots (snoozes, late act nudges). The
 * reader's own chosen slots are never moved; only notifications the app
 * decides the time of respect this window.
 */
export const QUIET_HOURS = { startHour: 22, endHour: 7 } as const;
const RESUME_MINUTE = 30;

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
