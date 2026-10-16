/**
 * What the app already wrote for this reader, read back so the next request
 * can tell the model not to repeat it.
 *
 * The bridge and the examen keep one cache entry per local day. Their keys
 * end in the day the entry was written for, so the newest entries are found
 * by sorting keys, without storing a separate history.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-16": the UTC day keys carried before 2026-10-16. */
const ISO_DAY_SUFFIX = /(\d{4})-(\d{2})-(\d{2})$/;
/** "Fri Oct 16 2026": the local day key, `localDayKey` (Date#toDateString). */
const LOCAL_DAY_SUFFIX = /[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{2}) (\d{4})$/;

/** The day a cache key was written for, as days since the epoch, or null. */
export function cacheKeyDay(key: string): number | null {
  const iso = ISO_DAY_SUFFIX.exec(key);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / 86_400_000;
  const local = LOCAL_DAY_SUFFIX.exec(key);
  const month = local ? MONTHS.indexOf(local[1]) : -1;
  if (local && month >= 0) return Date.UTC(Number(local[3]), month, Number(local[2])) / 86_400_000;
  return null;
}

/** The newest `limit` keys that start with `prefix`, newest first. */
export function newestCacheKeys(keys: readonly string[], prefix: string, limit: number): string[] {
  return keys
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({ key, day: cacheKeyDay(key) }))
    .filter((entry): entry is { key: string; day: number } => entry.day !== null)
    .sort((a, b) => b.day - a.day)
    .slice(0, limit)
    .map((entry) => entry.key);
}

/** The first `count` words of `text`, without the punctuation that ends them. */
export function openingWords(text: string, count = 4): string {
  return text
    .trim()
    .split(/\s+/)
    .slice(0, count)
    .join(' ')
    .replace(/[\s.,;:!?…"'”’)\]]+$/u, '');
}

/**
 * The lines with repeats removed, in first-seen order, at most `limit`.
 * Case and punctuation do not make two lines different.
 */
export function uniqueLines(lines: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const identity = trimmed.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    unique.push(trimmed);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** A heading and its lines as one prompt block, or '' when there are no lines. */
export function avoidBlock(heading: string, lines: readonly string[]): string {
  if (lines.length === 0) return '';
  return `${heading}\n${lines.map((line) => `- ${line}`).join('\n')}`;
}
