/**
 * One relative-date language for every content list (audit 2026-08-05: the
 * Reflections list showed raw dates while NoteCard had its own formatter with
 * different buckets — same-age content read differently per tab).
 */
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;
  if (dayDiff < 30) {
    const weeks = Math.floor(dayDiff / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
