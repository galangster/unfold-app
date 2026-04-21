export const LEGAL_LINKS = {
  terms: 'https://unfoldapp.co/terms',
  privacy: 'https://unfoldapp.co/privacy',
} as const;

import type { Devotional } from './store';

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
  tappedAtMs,
  nowMs,
  maxAgeMs = 5 * 60_000,
}: {
  tappedAtMs: number;
  nowMs: number;
  maxAgeMs?: number;
}): boolean {
  return nowMs >= tappedAtMs && nowMs - tappedAtMs <= maxAgeMs;
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
  };
};

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

export function createNotificationNavigationCoordinator({
  replace,
}: {
  replace: (route: RevealNotificationRoute) => void;
}): {
  queueFromData: (
    data: Record<string, unknown> | null | undefined,
    notificationKey?: string,
  ) => boolean;
  setNavigationReady: (ready: boolean) => void;
} {
  let navigationReady = false;
  let pendingRoute: RevealNotificationRoute | null = null;
  let pendingNotificationKey: string | null = null;
  const handledNotificationKeys = new Set<string>();

  const flushPendingRoute = () => {
    if (!navigationReady || !pendingRoute) return;

    replace(pendingRoute);

    if (pendingNotificationKey) {
      handledNotificationKeys.add(pendingNotificationKey);
    }

    pendingRoute = null;
    pendingNotificationKey = null;
  };

  return {
    queueFromData(data, notificationKey) {
      const route = buildRevealNotificationRoute(data);
      if (!route) return false;
      if (notificationKey && handledNotificationKeys.has(notificationKey)) {
        return false;
      }

      pendingRoute = route;
      pendingNotificationKey = notificationKey ?? null;
      flushPendingRoute();
      return true;
    },

    setNavigationReady(ready) {
      navigationReady = ready;
      flushPendingRoute();
    },
  };
}
