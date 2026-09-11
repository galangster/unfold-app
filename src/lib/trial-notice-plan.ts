import { DAY_MS, type AllowedTrialDays } from '@/lib/trial-facts';
import { QUIET_HOURS, deferPastQuietHours, isQuietTime, latestNonQuietAtOrBefore } from '@/lib/quiet-hours';

export const TRIAL_NOTICE_DEADLINE_LEAD_MS = 25 * 3_600_000;
export const TRIAL_NOTICE_LONG_LEAD_MS = 48 * 3_600_000;
export const TRIAL_NOTICE_LATE_DELAY_MS = 60_000;

export type TrialNoticeCopyKind = 'tomorrow' | 'two_days' | 'weekday';
export type TrialNoticePlan =
  | { kind: 'schedule'; fireAt: Date; copy: TrialNoticeCopyKind; expiresWeekday: number; shortTrial: boolean }
  | { kind: 'skip'; reason: 'past_deadline' | 'invalid_dates' | 'already_delivered' | 'quiet_hours' };

function knownMs(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function clampMiddaySlot(slot: { hour: number; minute: number }): { hour: number; minute: number } {
  if (slot.hour < QUIET_HOURS.endHour) return { hour: QUIET_HOURS.endHour, minute: 0 };
  if (slot.hour >= QUIET_HOURS.startHour) {
    return { hour: QUIET_HOURS.startHour - 1, minute: 59 };
  }
  return { hour: slot.hour, minute: slot.minute };
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalYmd(localDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function localCalendarDays(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end - start) / DAY_MS);
}

function copyKind(from: Date, expiresAt: Date): TrialNoticeCopyKind {
  const days = localCalendarDays(from, expiresAt);
  if (days === 1) return 'tomorrow';
  if (days === 2) return 'two_days';
  return 'weekday';
}

export function getTrialCheckInSkipLocalDate(i: {
  purchasedAtMs: number | null;
  trialDays: AllowedTrialDays | null;
}): string | null {
  const purchasedAtMs = knownMs(i.purchasedAtMs);
  if (i.trialDays !== 3 || purchasedAtMs === null) return null;
  const purchase = new Date(purchasedAtMs);
  const day3 = new Date(purchase.getFullYear(), purchase.getMonth(), purchase.getDate() + 2);
  return localYmd(day3);
}

export function planTrialEndingNotice(i: {
  purchasedAtMs: number | null;
  expiresAtMs: number;
  nowMs: number;
  trialDays: AllowedTrialDays | null;
  middaySlot: { hour: number; minute: number };
  priorFireAtMs: number | null;
  appActive: boolean;
}): TrialNoticePlan {
  if (!Number.isFinite(i.expiresAtMs) || !Number.isFinite(i.nowMs)) {
    return { kind: 'skip', reason: 'invalid_dates' };
  }

  const priorFireAtMs = knownMs(i.priorFireAtMs);
  if (priorFireAtMs !== null && priorFireAtMs <= i.nowMs) {
    return { kind: 'skip', reason: 'already_delivered' };
  }

  const deadlineMs = i.expiresAtMs - TRIAL_NOTICE_DEADLINE_LEAD_MS;
  const shortPurchaseMs = i.trialDays === 3 ? knownMs(i.purchasedAtMs) : null;
  const shortTrial = shortPurchaseMs !== null;
  const expiresAt = new Date(i.expiresAtMs);

  let planned: Date;
  if (shortPurchaseMs !== null) {
    const purchase = new Date(shortPurchaseMs);
    const slot = clampMiddaySlot(i.middaySlot);
    planned = new Date(
      purchase.getFullYear(),
      purchase.getMonth(),
      purchase.getDate() + 2,
      slot.hour,
      slot.minute,
      0,
      0,
    );
  } else {
    planned = new Date(i.expiresAtMs - TRIAL_NOTICE_LONG_LEAD_MS);
  }

  let candidate = latestNonQuietAtOrBefore(new Date(Math.min(planned.getTime(), deadlineMs)));

  if (candidate.getTime() <= i.nowMs) {
    const lateMs = i.nowMs + TRIAL_NOTICE_LATE_DELAY_MS;
    if (lateMs > deadlineMs) {
      return { kind: 'skip', reason: 'past_deadline' };
    }
    const late = new Date(lateMs);
    if (!isQuietTime(late) || i.appActive) {
      candidate = late;
    } else {
      const deferred = deferPastQuietHours(late);
      if (deferred.getTime() > deadlineMs) {
        return { kind: 'skip', reason: 'quiet_hours' };
      }
      candidate = deferred;
    }
  }

  return {
    kind: 'schedule',
    fireAt: candidate,
    copy: copyKind(candidate, expiresAt),
    expiresWeekday: expiresAt.getDay(),
    shortTrial,
  };
}
