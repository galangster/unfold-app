/**
 * Reveal-screen param resolution (P3-4 item 2b).
 *
 * `/reveal` is reachable from Today, the QA tools, the devotional-ready
 * notification route, and — before the native-intent allowlist — any
 * external `unfold://reveal?…` URL. Everything the store learns from that
 * screen (markDayAsRevealed, setCurrentDevotional, setResumeContext) must
 * come from a devotional that exists locally and a day inside its range,
 * never from the raw params. Pure module; the screen owns the redirect.
 */

export type RouteParam = string | string[] | undefined;

export interface RevealDevotional {
  id: string;
  title: string;
  totalDays: number;
  days: readonly { dayNumber: number; title: string }[];
}

export interface RevealTarget {
  devotionalId: string;
  dayNumber: number;
  seriesTitle: string;
  /** Title of the resolved day when it has been generated locally. */
  dayTitle: string | null;
  totalDays: number;
}

export function firstParam(value: RouteParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Strict positive integer: canonical digits only (no sign, exponent, or fraction). */
export function parsePositiveInteger(value: RouteParam): number | null {
  const raw = firstParam(value);
  if (!raw || !/^[1-9]\d{0,5}$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

/**
 * Resolve reveal params against the local devotionals. Returns null when the
 * devotional is unknown or the day is not a positive integer within
 * max(totalDays, days.length) — the day itself may still be "preparing", so
 * existence in `days` is not required.
 */
export function resolveRevealTarget(
  params: { devotionalId?: RouteParam; dayNumber?: RouteParam },
  devotionals: readonly RevealDevotional[],
): RevealTarget | null {
  const devotionalId = firstParam(params.devotionalId);
  if (!devotionalId) return null;

  const devotional = devotionals.find((candidate) => candidate.id === devotionalId);
  if (!devotional) return null;

  const dayNumber = parsePositiveInteger(params.dayNumber);
  if (dayNumber === null) return null;

  const days = Array.isArray(devotional.days) ? devotional.days : [];
  const declaredTotal = Number.isFinite(devotional.totalDays)
    ? Math.max(0, Math.floor(devotional.totalDays))
    : 0;
  const maxDay = Math.max(declaredTotal, days.length);
  if (dayNumber > maxDay) return null;

  const day = days.find((candidate) => candidate.dayNumber === dayNumber);
  return {
    devotionalId,
    dayNumber,
    seriesTitle: devotional.title,
    dayTitle: day?.title ?? null,
    totalDays: declaredTotal > 0 ? declaredTotal : maxDay,
  };
}
