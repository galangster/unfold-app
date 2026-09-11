import { DAY_MS, roundTrialDays } from '@/lib/trial-facts';
import {
  localCalendarDays,
  planTrialEndingNotice,
  type TrialNoticeCopyKind,
} from '@/lib/trial-notice-plan';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getTrialNoticeTitle(kind: TrialNoticeCopyKind, expiresWeekday: number): string {
  if (kind === 'tomorrow') return 'Your Unfold trial ends tomorrow';
  if (kind === 'two_days') return 'Your Unfold trial ends in 2 days';
  const weekday = WEEKDAYS[(((expiresWeekday % 7) + 7) % 7)];
  return `Your Unfold trial ends ${weekday}`;
}

export function trialLabelToDays(label: string): number | null {
  const match = /^(\d+)-(day|week|month|year)s?$/i.exec(label.trim());
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'day') return count;
  if (unit === 'week') return 7 * count;
  return null;
}

export function formatTrialFreePhrase(trialDays: number, trialLabel?: string): string {
  if (trialLabel) {
    const days = trialLabelToDays(trialLabel);
    if (days === null) {
      const readable = trialLabel.replace(/-/g, ' ');
      return readable.endsWith('free') ? readable : `${readable} free`;
    }
    return `${days} days free`;
  }
  return `${trialDays} days free`;
}

export function getTrialPaywallTimeline(i: {
  trialDays: number | null;
  nowMs: number;
  middaySlot: { hour: number; minute: number };
}): {
  reminderLeadLabel: '1 day' | '2 days' | null;
  reminderDay: number | null;
  chargeDay: number | null;
} {
  const empty = { reminderLeadLabel: null, reminderDay: null, chargeDay: null };
  if (i.trialDays === null) return empty;
  const days = roundTrialDays(i.trialDays * DAY_MS);
  if (days === null) return empty;

  const plan = planTrialEndingNotice({
    purchasedAtMs: i.nowMs,
    expiresAtMs: i.nowMs + days * DAY_MS,
    nowMs: i.nowMs,
    trialDays: days,
    middaySlot: i.middaySlot,
    priorFireAtMs: null,
    appActive: false,
  });
  if (plan.kind === 'skip') return empty;

  const reminderLeadLabel =
    plan.copy === 'tomorrow' ? '1 day' : plan.copy === 'two_days' ? '2 days' : null;
  return {
    reminderLeadLabel,
    reminderDay: 1 + localCalendarDays(new Date(i.nowMs), plan.fireAt),
    chargeDay: days + 1,
  };
}
