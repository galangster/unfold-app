/**
 * A reading or check-in that starts before midnight and finishes after must
 * stay the start calendar day. Completing after 00:00 used to stamp `readAt`
 * / check-in dates as "today", which consumed the next local day.
 *
 * Travel is unchanged: if the device IANA zone changes mid-session, completion
 * keeps the finish instant.
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

export function beginRitualSessionRecord(
  existing: RitualSession | null | undefined,
  input: RitualSessionIdentity & {
    now?: Date;
    timeZone?: string | null;
  },
): RitualSession {
  if (isRitualSessionIdentity(existing, input)) return existing;
  const now = input.now ?? new Date();
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
  if (startedAt.toDateString() !== completedAt.toDateString()) {
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
    ? input.session
    : null;
  const startedAt = session ? new Date(session.startedAt) : completedAt;
  const at = session && Number.isFinite(startedAt.getTime())
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
