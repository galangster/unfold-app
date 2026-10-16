/**
 * Resolves which copy draw this device is on.
 *
 * Kept separate from the pools (constants/check-in-messages.ts) and from the
 * bag itself (lib/variation-bag.ts) so both of those stay pure and testable
 * without a Keychain. This is the only place that reaches for identity.
 *
 * The home screen cards and the notifications both go through here, so the
 * card a reader sees at noon and the banner that fired at 12:30 are the same
 * draw rather than two independent ones.
 */

import { countReadsBefore, type DevotionalReadingProgress } from '@/lib/devotional-day-access';
import { getDeviceId, mmkvStorage } from '@/lib/mmkv-storage';
import { copyVariationAt, type CopyVariation } from '@/lib/variation-bag';

/**
 * Seed for the copy shuffle bags. The install id is Keychain-backed, so it is
 * normally stable across launches and reinstalls: two readers are never
 * drawing the same sequence on the same day, and one reader's sequence does
 * not reset when the app restarts.
 *
 * `getDeviceId()` does NOT throw when the Keychain is unreadable — a recovery
 * session, or a normal boot on a locked device, returns a session-scoped
 * `ephemeral-` id instead, memoised for that session (see mmkv-storage.ts).
 * So the seed is always stable within a session; an ephemeral one just draws
 * a different sequence on the next launch. That is invisible next to the
 * failure that caused it, and no reason to reach for a shared fallback.
 */
let cachedSeed: string | null = null;

export function copySeed(): string {
  // The install id cannot change within a session, and the home screen asks
  // for a variation on every render — so resolve it at most once.
  if (cachedSeed !== null) return cachedSeed;
  try {
    cachedSeed = getDeviceId();
  } catch {
    // Last resort only. getDeviceId handles an unreadable Keychain itself and
    // returns an ephemeral id, so reaching here means something unexpected
    // threw. Deliberately not cached: whatever broke may not be broken on the
    // next call, and pinning this literal would hold the reader on one
    // sequence for the rest of the session.
    return 'unfold';
  }
  return cachedSeed;
}


/** The draw for the local calendar day of `date`. */
export function copyVariationFor(date: Date): CopyVariation {
  return copyVariationAt(copySeed(), date);
}

// ─── Copy memory ────────────────────────────────────────────────────────────
// What this device last showed, so the next draw can step past it, and the
// order each day's act note draws at, so the note keeps it. It lives
// here, on this device only, beside the seed: nothing is synced and no
// stored day changes. Every key starts with COPY_MEMORY_KEY_PREFIX, which the
// full reset sweeps (full-reset.ts).

export const COPY_MEMORY_KEY_PREFIX = 'copy-memory-';
const COMPLETION_ORDINAL_KEY = `${COPY_MEMORY_KEY_PREFIX}completion-ordinal`;
const DAY_ORDINAL_KEY_PREFIX = `${COPY_MEMORY_KEY_PREFIX}day-ordinal-`;
const CARRIED_CUES_KEY_PREFIX = `${COPY_MEMORY_KEY_PREFIX}check-in-cues-`;
/** How many local days before a batch's first fire date its cues are kept. */
const CARRIED_CUE_DAYS = 14;

function readMemory(key: string): string | null {
  try {
    const value = mmkvStorage.getItem(key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function writeMemory(key: string, value: string): void {
  try {
    mmkvStorage.setItem(key, value);
  } catch {
    // Memory is a nicety: without it the next draw goes by the history alone.
  }
}

/** A day of a series, by the ids the reader opens it with. */
export interface SeriesDay {
  devotionalId: string;
  dayNumber: number;
}

function dayOrdinalKey({ devotionalId, dayNumber }: SeriesDay): string {
  return `${DAY_ORDINAL_KEY_PREFIX}${devotionalId}:${dayNumber}`;
}

/**
 * The completion order for an overlay about to open: the readings finished
 * before it (countReadsBefore), and never less than one past the last overlay
 * this device opened. Deleting a series takes its reads out of the history,
 * and without this floor the next overlay could land on the place the last
 * one used and repeat its words. The order used is kept for the next one,
 * and for the finished day when one is given, so its act note draws at the
 * same place (actNoteOrdinal).
 */
export function takeCompletionOrdinal(readsBefore: number, finished?: SeriesDay): number {
  const last = Number(readMemory(COMPLETION_ORDINAL_KEY) ?? Number.NaN);
  const ordinal = Math.max(readsBefore, Number.isInteger(last) ? last + 1 : 0);
  writeMemory(COMPLETION_ORDINAL_KEY, String(ordinal));
  if (finished) writeMemory(dayOrdinalKey(finished), String(ordinal));
  return ordinal;
}

/** The order this device holds for a day, if it took one. */
function keptDayOrdinal(day: SeriesDay): number | undefined {
  const kept = Number(readMemory(dayOrdinalKey(day)) ?? Number.NaN);
  return Number.isInteger(kept) && kept >= 0 ? kept : undefined;
}

/** The series and their days, as the store holds them, for one day's lookup. */
type ShelfProgress = readonly {
  id: string;
  days: readonly { dayNumber: number; isRead?: boolean; readAt?: string; actOutcome?: string }[];
}[];

/**
 * Takes an order for a day whose act is being marked on this device for the
 * first time, before its note draws (actNoteOrdinal). A day finished here
 * already holds the order its overlay took, so nothing changes. A day
 * finished on another device holds none, and after a delete its place in the
 * history can be the order the day before it holds. So it takes the next
 * order now (takeCompletionOrdinal), and its note steps past the last order
 * this device used.
 */
export function holdActNoteOrdinal(devotionals: ShelfProgress, day: SeriesDay): void {
  if (keptDayOrdinal(day) !== undefined) return;
  const row = devotionals.find((devotional) => devotional.id === day.devotionalId)
    ?.days.find((item) => item.dayNumber === day.dayNumber);
  if (row?.actOutcome) return;
  takeCompletionOrdinal(row?.readAt ? countReadsBefore(devotionals, new Date(row.readAt)) : 0, day);
}

/**
 * The completion order a day's act note draws at: the order this device
 * holds for the day. A day finished here holds the order its overlay took,
 * and a day finished elsewhere takes one when its act is first marked here
 * (holdActNoteOrdinal), so the note steps past this device's last one and a
 * series deleted since cannot move it. A day with no order, such as one
 * marked before orders were kept, goes by the readings finished before its
 * read time, which a delete or a sync can still move.
 */
export function actNoteOrdinal(
  devotionals: readonly Pick<DevotionalReadingProgress, 'days'>[],
  { devotionalId, dayNumber, readAt }: Partial<SeriesDay> & { readAt?: string },
): number {
  const kept = devotionalId && dayNumber !== undefined ? keptDayOrdinal({ devotionalId, dayNumber }) : undefined;
  return kept ?? (readAt ? countReadsBefore(devotionals, new Date(readAt)) : 0);
}

/**
 * The tap cue each fire date of one check-in slot carried, by local day
 * index. An empty string is a fire date whose sentence left no room for one.
 */
export type CarriedCues = Record<string, string>;

/** The cues this device last wrote for a slot's fire dates. */
export function readCarriedCues(slotId: string): CarriedCues {
  try {
    const parsed: unknown = JSON.parse(readMemory(`${CARRIED_CUES_KEY_PREFIX}${slotId}`) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).filter(
      (entry): entry is [string, string] => Number.isInteger(Number(entry[0])) && typeof entry[1] === 'string',
    ));
  } catch {
    return {};
  }
}

/** The cue the slot's last fire date before `dayIndex` carried, if this device wrote it. */
export function cueCarriedBefore(cues: CarriedCues, dayIndex: number): string | undefined {
  const before = Object.keys(cues).map(Number).filter((day) => day < dayIndex);
  return before.length > 0 ? cues[String(Math.max(...before))] : undefined;
}

/**
 * Keeps the cues one batch wrote, with the fire dates before its first that
 * are still recent, so the next batch's first banner can step past the cue
 * the fire date before it carried.
 */
export function rememberCarriedCues(
  slotId: string,
  previous: CarriedCues,
  written: readonly { dayIndex: number; cue?: string }[],
): void {
  if (written.length === 0) return;
  const first = written[0].dayIndex;
  const kept: CarriedCues = Object.fromEntries(Object.entries(previous).filter(([key]) => {
    const day = Number(key);
    return day < first && day >= first - CARRIED_CUE_DAYS;
  }));
  for (const { dayIndex, cue } of written) kept[String(dayIndex)] = cue ?? '';
  writeMemory(`${CARRIED_CUES_KEY_PREFIX}${slotId}`, JSON.stringify(kept));
}
