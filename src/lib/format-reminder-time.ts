/**
 * ONE display format for reminder/check-in times everywhere: `h:mm AM/PM`
 * — 12-hour, no leading zero on the hour, uppercase meridiem ("8:00 AM",
 * "12:30 PM"). Display only: storage formats stay as-is (user.reminderTime
 * keeps its 12h strings; check-in times keep 24h "HH:mm").
 *
 * Accepts both storage formats found in the wild:
 * - 24h "HH:mm" ("12:30", "08:00") — check-in store fields, debug seeds
 * - 12h "h:mm AM/PM" ("8:00 AM") — user.reminderTime from onboarding
 * Unknown shapes are returned unchanged so a bad value can never crash a
 * settings row.
 */
export function formatReminderTime(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP])\.?M\.?)?$/i);
  if (!match) return time;

  let hour = parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = match[3]?.toUpperCase();

  if (meridiem) {
    // already 12h — normalize leading zero and meridiem casing
    if (hour === 0) hour = 12;
    return `${hour}:${minutes} ${meridiem}M`;
  }

  // 24h storage form
  if (hour > 23) return time;
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${period}`;
}
