/**
 * Shape guard for the sample devotional day carried in the onboarding draft.
 *
 * The draft round-trips this day through JSON in MMKV, where it can survive an
 * app upgrade that changed the generated shape. Both consumers render or store
 * it directly — the reading step and the "I'll decide later" path, which writes
 * it into the store as a real devotional — so a day that parses as JSON but is
 * missing its text would put a broken devotional in front of someone, or into
 * their library permanently.
 *
 * Treat a day that fails this check as absent. The segue then re-polls the
 * persisted sample job and delivers a fresh one, which is the same path a
 * first-time person takes.
 *
 * Pure and free of native imports so it can be unit-tested directly.
 */
import type { DevotionalDay } from './store';

/** The fields the reading screen renders unguarded. */
const REQUIRED_TEXT_FIELDS = ['title', 'scriptureReference', 'scriptureText', 'bodyText'] as const;

export function isUsableSampleDevotionalDay(value: unknown): value is DevotionalDay {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const day = value as Record<string, unknown>;
  return REQUIRED_TEXT_FIELDS.every(
    (field) => typeof day[field] === 'string' && (day[field] as string).length > 0,
  );
}

/** The day when it is usable, otherwise null. */
export function readSampleDevotionalDay(value: unknown): DevotionalDay | null {
  return isUsableSampleDevotionalDay(value) ? value : null;
}
