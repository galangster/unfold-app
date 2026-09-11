import type { AutoTrialIntentV1 } from './auto-trial-intent';
import type { Devotional } from './store';

export const LEGAL_LINKS = {
  terms: 'https://unfoldapp.co/terms',
  privacy: 'https://unfoldapp.co/privacy',
} as const;

// Parse "HH:mm" (24-hour) with graceful fallback. Mirrors the logic tested
// in src/lib/__tests__/notifications-scheduling.test.ts. Returns the
// fallback on any parse error or out-of-range values.
export function parseHhMm(
  time: string,
  fallback: { hour: number; minute: number },
): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return fallback;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return { hour, minute };
}

export const DEFAULT_REMINDER_CLOCK = { hour: 8, minute: 0 } as const;

/** "8:00 AM" or "08:00" → { hour, minute }, defaulting to 8:00 on bad input. */
export function parseReminderClock(
  time: string | null | undefined,
  fallback: { hour: number; minute: number } = DEFAULT_REMINDER_CLOCK,
): { hour: number; minute: number } {
  const normalized = time ? normalizePreferredNotificationTime(time) : undefined;
  return normalized ? parseHhMm(normalized, fallback) : fallback;
}

export function normalizePreferredNotificationTime(
  preferredNotificationTime?: string,
): string | undefined {
  if (!preferredNotificationTime) return undefined;

  const trimmed = preferredNotificationTime.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return undefined;

  const [, hourText, minuteText, meridiemText] = match;
  const meridiem = meridiemText.toUpperCase();
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return undefined;

  let normalizedHour = hour % 12;
  if (meridiem === 'PM') normalizedHour += 12;

  return `${String(normalizedHour).padStart(2, '0')}:${minuteText}`;
}

export function buildPushRegistrationRequestBody({
  expoPushToken,
  timezone,
  preferredNotificationTime,
}: {
  expoPushToken: string;
  timezone: string;
  preferredNotificationTime?: string;
}): {
  expoPushToken: string;
  timezone: string;
  preferredNotificationTime?: string;
} {
  const normalizedPreferredNotificationTime = normalizePreferredNotificationTime(
    preferredNotificationTime,
  );

  return {
    expoPushToken,
    timezone,
    ...(normalizedPreferredNotificationTime
      ? { preferredNotificationTime: normalizedPreferredNotificationTime }
      : {}),
  };
}

export function buildNotificationPreferenceRequestBody({
  preferredNotificationTime,
  timezone,
}: {
  preferredNotificationTime: string;
  timezone: string;
}): {
  preferredNotificationTime: string;
  timezone: string;
} {
  return {
    preferredNotificationTime: normalizePreferredNotificationTime(preferredNotificationTime) ?? preferredNotificationTime,
    timezone,
  };
}

export function buildDevotionalReadyNotificationData(
  devotional: Pick<Devotional, 'id' | 'title' | 'totalDays' | 'days'>,
  dayNumber: number,
): {
  type: 'devotional_ready';
  devotionalId: string;
  dayNumber: number;
  dayTitle: string;
  seriesTitle: string;
  totalDays: number;
} | null {
  const day = devotional.days.find((candidate) => candidate.dayNumber === dayNumber);
  if (!day) return null;

  return {
    type: 'devotional_ready',
    devotionalId: devotional.id,
    dayNumber,
    dayTitle: day.title,
    seriesTitle: devotional.title,
    totalDays: devotional.totalDays,
  };
}

export function shouldHandleNotificationData(
  data: Record<string, unknown> | null | undefined,
): boolean {
  if (!data || data.type !== 'devotional_ready') return false;
  return Boolean(data.devotionalId) && data.dayNumber != null;
}

export function shouldHydrateNotificationResponse({
  notificationDateMs,
  nowMs,
}: {
  notificationDateMs: number;
  nowMs: number;
}): boolean {
  return Number.isFinite(notificationDateMs) && notificationDateMs > 0 && nowMs >= notificationDateMs;
}

export function shouldMarkNotificationNavigationReady({
  pathname,
  rootNavigationKey,
}: {
  pathname?: string | null;
  rootNavigationKey?: string | null;
}): boolean {
  return Boolean(pathname && rootNavigationKey);
}

export function getCompletedUserRedirectDisposition({
  hasPendingNotificationNavigation,
  hasSettledInitialNotificationHydration,
  startedAtMs,
  nowMs,
  hydrationWaitWindowMs = 4_000,
  activePathname,
}: {
  hasPendingNotificationNavigation: boolean;
  hasSettledInitialNotificationHydration: boolean;
  startedAtMs: number;
  nowMs: number;
  hydrationWaitWindowMs?: number;
  /**
   * The currently focused route. The welcome screen is the root stack's anchor
   * (initialRouteName: 'index'), so it also mounts UNDER any cold-start deep
   * link (unfold://paywall, a web URL, a universal link). Redirecting home in
   * that situation replaces the deep-linked route the user asked for — the
   * same failure mode the pending-notification suppression exists for, but
   * for every other deep link. Only redirect while index itself is focused.
   */
  activePathname?: string | null;
}): 'skip' | 'wait' | 'redirect' {
  if (activePathname != null && activePathname !== '/') {
    return 'skip';
  }

  if (hasPendingNotificationNavigation) {
    return 'skip';
  }

  if (!hasSettledInitialNotificationHydration && nowMs - startedAtMs < hydrationWaitWindowMs) {
    return 'wait';
  }

  return 'redirect';
}

export type RevealNotificationRoute = {
  pathname: '/reveal';
  params: {
    devotionalId: string;
    dayNumber: string;
    dayTitle: string;
    seriesTitle: string;
    totalDays: string;
  };
};

export type ReadingRoute = {
  pathname: '/(tabs)/(today)/reading';
  params: {
    devotionalId: string;
    dayNumber: string;
    /** Scroll the reader to a section on open. */
    focus?: 'act';
  };
};

export type TodayNotificationRoute = {
  pathname: '/(tabs)/(today)';
};

export type EveningWindDownNotificationRoute = {
  pathname: '/(tabs)/(today)/evening-wind-down';
};

export type GeneratingNotificationRoute = {
  pathname: '/generating';
  params: {
    jobId?: string;
    devotionalId?: string;
  };
};

export interface SeriesRevealNotificationRoute {
  pathname: '/series-reveal';
  params: { intentId: string };
}

export type NotificationNavigationRoute =
  | RevealNotificationRoute
  | ReadingRoute
  | TodayNotificationRoute
  | EveningWindDownNotificationRoute
  | GeneratingNotificationRoute
  | SeriesRevealNotificationRoute;

export function buildRevealNotificationRoute(
  data: Record<string, unknown> | null | undefined,
): RevealNotificationRoute | null {
  if (!shouldHandleNotificationData(data)) return null;

  const {
    devotionalId,
    dayNumber,
    dayTitle,
    seriesTitle,
    totalDays,
  } = data as {
    devotionalId?: string;
    dayNumber?: number | string;
    dayTitle?: string;
    seriesTitle?: string;
    totalDays?: number | string;
  };

  return {
    pathname: '/reveal',
    params: {
      devotionalId: String(devotionalId),
      dayNumber: String(dayNumber),
      dayTitle: dayTitle ?? '',
      seriesTitle: seriesTitle ?? '',
      totalDays: String(totalDays ?? 0),
    },
  };
}

function readStringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isLiveAutoTrialStatus(status: AutoTrialIntentV1['status']): boolean {
  return status === 'purchased' || status === 'submitted' || status === 'landed' || status === 'failed';
}

export function buildNotificationNavigationRoute(
  data: Record<string, unknown> | null | undefined,
  autoTrialIntent?: AutoTrialIntentV1 | null,
): NotificationNavigationRoute | null {
  if (
    autoTrialIntent
    && isLiveAutoTrialStatus(autoTrialIntent.status)
    && (data?.type === 'devotional_ready' || data?.type === 'generation_failed')
  ) {
    const dataDevotionalId = readStringField(data, 'devotionalId');
    const dataJobId = readStringField(data, 'jobId');
    if (
      (dataDevotionalId != null && dataDevotionalId === autoTrialIntent.devotionalId)
      || (dataJobId != null && dataJobId === autoTrialIntent.jobId)
    ) {
      return { pathname: '/series-reveal', params: { intentId: autoTrialIntent.intentId } };
    }
  }

  const revealRoute = buildRevealNotificationRoute(data);
  if (revealRoute) return revealRoute;

  if (data?.type === 'midday-checkin' || data?.type === 'midday_checkin') {
    return { pathname: '/(tabs)/(today)' };
  }

  if (data?.type === 'evening-winddown' || data?.type === 'evening_winddown') {
    return { pathname: '/(tabs)/(today)/evening-wind-down' };
  }

  // Lapse re-entry: the series is waiting on Today.
  if (data?.type === 'lapse_reentry') {
    return { pathname: '/(tabs)/(today)' };
  }

  // The act reminder opens the day it came from, scrolled to the act.
  if (data?.type === 'act_reminder') {
    const devotionalId = readStringField(data, 'devotionalId');
    const dayNumber = data.dayNumber;
    if (!devotionalId || dayNumber == null) return null;
    return {
      pathname: '/(tabs)/(today)/reading',
      params: { devotionalId, dayNumber: String(dayNumber), focus: 'act' },
    };
  }

  // The server's "we hit a snag" push: the generating screen polls the job
  // it names and offers Try again. The ids ride along as route params
  // because every terminal exit clears the MMKV inflight record. Only the
  // first arc lands there: that screen owns the job and retries it by id,
  // so a push for anything else (the onboarding sample, a day) just opens
  // the app rather than pulling the reader onto the wrong screen.
  if (data?.type === 'generation_failed') {
    if (readStringField(data, 'jobType') !== 'initial_arc') return null;
    const params: GeneratingNotificationRoute['params'] = {};
    const jobId = readStringField(data, 'jobId');
    const devotionalId = readStringField(data, 'devotionalId');
    if (jobId) params.jobId = jobId;
    if (devotionalId) params.devotionalId = devotionalId;
    return { pathname: '/generating', params };
  }

  return null;
}

export function buildReadingRouteFromRevealParams({
  devotionalId,
  dayNumber,
}: {
  devotionalId: string;
  dayNumber?: string;
}): ReadingRoute {
  return {
    pathname: '/(tabs)/(today)/reading',
    params: {
      devotionalId,
      dayNumber: String(dayNumber ?? '1'),
    },
  };
}

export type NotificationNavigationDebugEvent =
  | { type: 'ignored_invalid'; notificationKey?: string }
  | { type: 'ignored_duplicate'; notificationKey?: string }
  | { type: 'queued'; notificationKey?: string; route: NotificationNavigationRoute }
  | { type: 'flush_skipped_not_ready'; notificationKey?: string; route: NotificationNavigationRoute }
  | { type: 'navigation_ready_changed'; ready: boolean }
  | { type: 'flushed'; notificationKey?: string; route: NotificationNavigationRoute };

export function createNotificationNavigationCoordinator({
  replace,
  onEvent,
  recentNavigationWindowMs = 5_000,
  readAutoTrialIntent,
}: {
  replace: (route: NotificationNavigationRoute) => void;
  onEvent?: (event: NotificationNavigationDebugEvent) => void;
  recentNavigationWindowMs?: number;
  readAutoTrialIntent?: () => AutoTrialIntentV1 | null;
}): {
  queueFromData: (
    data: Record<string, unknown> | null | undefined,
    notificationKey?: string,
  ) => boolean;
  setNavigationReady: (ready: boolean) => void;
  hasPendingRoute: () => boolean;
} {
  let navigationReady = false;
  let pendingRoute: NotificationNavigationRoute | null = null;
  let pendingNotificationKey: string | null = null;
  let lastRouteActivityAt = 0;
  const handledNotificationKeys = new Set<string>();

  const flushPendingRoute = () => {
    if (!pendingRoute) return;
    if (!navigationReady) {
      onEvent?.({
        type: 'flush_skipped_not_ready',
        notificationKey: pendingNotificationKey ?? undefined,
        route: pendingRoute,
      });
      return;
    }

    replace(pendingRoute);
    lastRouteActivityAt = Date.now();
    onEvent?.({
      type: 'flushed',
      notificationKey: pendingNotificationKey ?? undefined,
      route: pendingRoute,
    });

    if (pendingNotificationKey) {
      handledNotificationKeys.add(pendingNotificationKey);
    }

    pendingRoute = null;
    pendingNotificationKey = null;
  };

  return {
    queueFromData(data, notificationKey) {
      const route = buildNotificationNavigationRoute(data, readAutoTrialIntent?.() ?? null);
      if (!route) {
        onEvent?.({ type: 'ignored_invalid', notificationKey });
        return false;
      }
      if (notificationKey && handledNotificationKeys.has(notificationKey)) {
        onEvent?.({ type: 'ignored_duplicate', notificationKey });
        return false;
      }

      pendingRoute = route;
      pendingNotificationKey = notificationKey ?? null;
      lastRouteActivityAt = Date.now();
      onEvent?.({
        type: 'queued',
        notificationKey,
        route,
      });
      flushPendingRoute();
      return true;
    },

    setNavigationReady(ready) {
      navigationReady = ready;
      onEvent?.({ type: 'navigation_ready_changed', ready });
      flushPendingRoute();
    },

    hasPendingRoute() {
      if (pendingRoute !== null) return true;
      return lastRouteActivityAt !== 0 && Date.now() - lastRouteActivityAt <= recentNavigationWindowMs;
    },
  };
}

// ── NET-15 helpers ──────────────────────────────────────────────────────────

/**
 * Decision function for registerPushToken's permission check.
 *
 * Background registration NEVER requests permission — the in-context ask
 * (generating.tsx / settings) owns requestPermissionsAsync. Registration
 * only proceeds when permission was already granted.
 */
export function shouldProceedWithPushRegistration(args: {
  existingStatus: string;
}): { proceed: boolean; request: boolean } {
  if (args.existingStatus === 'granted') {
    return { proceed: true, request: false };
  }
  return { proceed: false, request: false };
}

/**
 * Session-dedupe guard for the backend POST in registerPushToken.
 *
 * Returns false if the token was already successfully posted this session,
 * preventing redundant POSTs on every foreground transition.
 */
export function shouldPostPushRegistration(args: {
  alreadyRegisteredThisSession: boolean;
}): boolean {
  return !args.alreadyRegisteredThisSession;
}

