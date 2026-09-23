import { getContextSlotType, type ContextSlotInput } from '../context-slot-priority';
import {
  buildNotificationNavigationRoute,
  createNotificationNavigationCoordinator,
  getCompletedUserRedirectDisposition,
} from '../push-notification-helpers';

const todayAfterMiddayWindow: ContextSlotInput = {
  hasResumeContext: false,
  currentHour: 17,
  currentMinute: 45,
  hasDevotional: true,
  hasReadToday: true,
  hasMiddayCheckIn: false,
  hasEveningCheckIn: false,
  hasBridgeText: false,
  isBridgeLoading: false,
  hasBridgeInput: false,
  isPremium: true,
};

const middayTodayRoute = {
  pathname: '/life-update',
} as const;

describe('midday notification open', () => {
  it('opens a life update when a midday reminder is tapped after 17:00 from a cold start', () => {
    expect(getContextSlotType(todayAfterMiddayWindow)).not.toBe('midday');

    const replace = jest.fn();
    const coordinator = createNotificationNavigationCoordinator({ replace });

    coordinator.queueFromData({ type: 'midday-checkin' }, 'unfold-midday-checkin-0');
    expect(replace).not.toHaveBeenCalled();
    expect(
      getCompletedUserRedirectDisposition({
        hasPendingNotificationNavigation: coordinator.hasPendingRoute(),
        hasSettledInitialNotificationHydration: false,
        startedAtMs: 1_000,
        nowMs: 1_100,
        activePathname: '/',
      }),
    ).toBe('skip');
    expect(
      getCompletedUserRedirectDisposition({
        hasPendingNotificationNavigation: false,
        hasSettledInitialNotificationHydration: true,
        startedAtMs: 1_000,
        nowMs: 1_050,
        activePathname: '/paywall',
      }),
    ).toBe('skip');
    expect(buildNotificationNavigationRoute({ type: 'evening-winddown' })).toEqual({
      pathname: '/life-update',
    });

    coordinator.setNavigationReady(true);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]?.[0]).toEqual(middayTodayRoute);

    coordinator.queueFromData({ type: 'midday-checkin' }, 'unfold-midday-checkin-0');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('opens a life update for both live payload spellings', () => {
    expect(buildNotificationNavigationRoute({ type: 'midday-checkin' })).toEqual(middayTodayRoute);
    expect(buildNotificationNavigationRoute({ type: 'midday_checkin' })).toEqual(middayTodayRoute);
  });
});
