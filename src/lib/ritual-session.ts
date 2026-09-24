/**
 * A reading or check-in that starts before midnight and finishes after must
 * stay the start calendar day. Completing after 00:00 used to stamp `readAt`
 * / check-in dates as "today", which consumed the next local day.
 *
 * Reuse covers the same local day or up to four hours across midnight.
 * A preview left overnight starts fresh in the morning. Travel is unchanged: if the
 * device IANA zone changes mid-session, completion keeps the finish instant.
 */

export type RitualSessionKind = 'reading' | 'midday' | 'evening';

export interface RitualSession {
  kind: RitualSessionKind;
  startedAt: string;
  startedTimeZone: string | null;
  devotionalId: string;
  dayNumber: number;
}

export type RitualSessions = Partial<Record<RitualSessionKind, RitualSession>>;

const MIDNIGHT_CARRYOVER_MS = 4 * 60 * 60 * 1000;

export type RitualSessionIdentity = Pick<RitualSession, 'kind' | 'devotionalId' | 'dayNumber'>;

export function localCalendarYmd(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

export function isRitualSessionIdentity(
  session: RitualSession | null | undefined,
  identity: RitualSessionIdentity,
): session is RitualSession {
  return !!session
    && session.kind === identity.kind
    && session.devotionalId === identity.devotionalId
    && session.dayNumber === identity.dayNumber;
}

function localCalendarDayDelta(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

function isWithinMidnightCrossingWindow(startedAt: Date, now: Date): boolean {
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(now.getTime())) return false;
  const delta = localCalendarDayDelta(startedAt, now);
  const elapsed = now.getTime() - startedAt.getTime();
  return elapsed >= 0 && (delta === 0 || (delta === 1 && elapsed <= MIDNIGHT_CARRYOVER_MS));
}

export function beginRitualSessionRecord(
  existing: RitualSession | null | undefined,
  input: RitualSessionIdentity & {
    now?: Date;
    timeZone?: string | null;
  },
): RitualSession {
  const now = input.now ?? new Date();
  if (
    isRitualSessionIdentity(existing, input)
    && isWithinMidnightCrossingWindow(new Date(existing.startedAt), now)
  ) {
    return existing;
  }
  return {
    kind: input.kind,
    startedAt: now.toISOString(),
    startedTimeZone: input.timeZone ?? null,
    devotionalId: input.devotionalId,
    dayNumber: input.dayNumber,
  };
}

export function resolveRitualCompletionInstant(input: {
  startedAt: Date;
  completedAt: Date;
  startedTimeZone: string | null;
  completedTimeZone: string | null;
}): Date {
  const { startedAt, completedAt, startedTimeZone, completedTimeZone } = input;
  if (startedTimeZone && completedTimeZone && startedTimeZone !== completedTimeZone) {
    return completedAt;
  }
  if (
    localCalendarDayDelta(startedAt, completedAt) === 1
    && isWithinMidnightCrossingWindow(startedAt, completedAt)
  ) {
    return startedAt;
  }
  return completedAt;
}

export function resolveRitualCompletion(input: {
  session: RitualSession | null | undefined;
  identity: RitualSessionIdentity;
  completedAt?: Date;
  completedTimeZone?: string | null;
}): {
  at: Date;
  iso: string;
  localYmd: string;
  dayNumber: number;
} {
  const completedAt = input.completedAt ?? new Date();
  // Kind + series is enough to keep a sheet that stayed open past midnight,
  // even if the computed day number advanced.
  const session = input.session
    && input.session.kind === input.identity.kind
    && input.session.devotionalId === input.identity.devotionalId
    && isWithinMidnightCrossingWindow(new Date(input.session.startedAt), completedAt)
    ? input.session
    : null;
  const startedAt = session ? new Date(session.startedAt) : completedAt;
  const at = session
    ? resolveRitualCompletionInstant({
        startedAt,
        completedAt,
        startedTimeZone: session.startedTimeZone,
        completedTimeZone: input.completedTimeZone ?? null,
      })
    : completedAt;

  return {
    at,
    iso: at.toISOString(),
    localYmd: localCalendarYmd(at),
    dayNumber: session?.dayNumber ?? input.identity.dayNumber,
  };
}
