jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string, namespace: string) => `uuidv5:${namespace}:${value}`),
}));

import {
  LEGAL_LINKS,
  buildDevotionalReadyNotificationData,
  buildPushRegistrationRequestBody,
  buildNotificationPreferenceRequestBody,
  buildReadingRouteFromRevealParams,
  createNotificationNavigationCoordinator,
  normalizePreferredNotificationTime,
  shouldHandleNotificationData,
  shouldHydrateNotificationResponse,
  shouldMarkNotificationNavigationReady,
} from '../push-notification-helpers';
import { buildDevotionalSeed } from '../dev-seed';

describe('push notification helpers', () => {
  describe('buildPushRegistrationRequestBody', () => {
    it('includes preferredNotificationTime when reminderTime exists', () => {
      expect(
        buildPushRegistrationRequestBody({
          expoPushToken: 'ExponentPushToken[abc]',
          timezone: 'America/Los_Angeles',
          preferredNotificationTime: '08:30',
        }),
      ).toEqual({
        expoPushToken: 'ExponentPushToken[abc]',
        timezone: 'America/Los_Angeles',
        preferredNotificationTime: '08:30',
      });
    });

    it('omits preferredNotificationTime when reminderTime is absent', () => {
      expect(
        buildPushRegistrationRequestBody({
          expoPushToken: 'ExponentPushToken[abc]',
          timezone: 'America/Los_Angeles',
        }),
      ).toEqual({
        expoPushToken: 'ExponentPushToken[abc]',
        timezone: 'America/Los_Angeles',
      });
    });
  });

  describe('buildNotificationPreferenceRequestBody', () => {
    it('builds the backend payload for reminder time sync', () => {
      expect(
        buildNotificationPreferenceRequestBody({
          preferredNotificationTime: '07:00',
          timezone: 'America/Chicago',
        }),
      ).toEqual({
        preferredNotificationTime: '07:00',
        timezone: 'America/Chicago',
      });
    });

    it('normalizes 12-hour reminder times before syncing to the backend', () => {
      expect(
        buildNotificationPreferenceRequestBody({
          preferredNotificationTime: '8:00 AM',
          timezone: 'America/Chicago',
        }),
      ).toEqual({
        preferredNotificationTime: '08:00',
        timezone: 'America/Chicago',
      });
    });
  });

  describe('normalizePreferredNotificationTime', () => {
    it('converts morning 12-hour times to HH:MM', () => {
      expect(normalizePreferredNotificationTime('8:30 AM')).toBe('08:30');
    });

    it('converts noon and midnight correctly', () => {
      expect(normalizePreferredNotificationTime('12:00 PM')).toBe('12:00');
      expect(normalizePreferredNotificationTime('12:00 AM')).toBe('00:00');
    });

    it('passes through existing HH:MM values', () => {
      expect(normalizePreferredNotificationTime('07:15')).toBe('07:15');
    });
  });

  describe('shouldHandleNotificationData', () => {
    it('handles devotional_ready notifications with devotionalId and dayNumber', () => {
      expect(
        shouldHandleNotificationData({
          type: 'devotional_ready',
          devotionalId: 'dev-1',
          dayNumber: 3,
        }),
      ).toBe(true);
    });

    it('ignores non-devotional notifications', () => {
      expect(
        shouldHandleNotificationData({
          type: 'midday_checkin',
          devotionalId: 'dev-1',
          dayNumber: 3,
        }),
      ).toBe(false);
    });

    it('ignores devotional_ready notifications that are missing routing params', () => {
      expect(
        shouldHandleNotificationData({
          type: 'devotional_ready',
          devotionalId: 'dev-1',
        }),
      ).toBe(false);
    });
  });

  describe('LEGAL_LINKS', () => {
    it('points terms and privacy to the canonical unfoldapp.co website', () => {
      expect(LEGAL_LINKS).toEqual({
        terms: 'https://unfoldapp.co/terms',
        privacy: 'https://unfoldapp.co/privacy',
      });
    });
  });

  describe('buildDevotionalReadyNotificationData', () => {
    it('builds the same devotional_ready routing payload shape used by push handling', () => {
      const seeded = buildDevotionalSeed();

      expect(buildDevotionalReadyNotificationData(seeded, 1)).toEqual({
        type: 'devotional_ready',
        devotionalId: 'seeded-qa-devotional',
        dayNumber: 1,
        dayTitle: 'When the Path Is Quiet',
        seriesTitle: 'Seeded QA Series',
        totalDays: 3,
      });
    });

    it('returns null when the requested day does not exist', () => {
      const seeded = buildDevotionalSeed();

      expect(buildDevotionalReadyNotificationData(seeded, 99)).toBeNull();
    });
  });

  describe('buildReadingRouteFromRevealParams', () => {
    it('preserves devotionalId when handing off from reveal to reading', () => {
      expect(
        buildReadingRouteFromRevealParams({
          devotionalId: 'dev-1',
          dayNumber: '3',
        }),
      ).toEqual({
        pathname: '/(tabs)/(today)/reading',
        params: {
          devotionalId: 'dev-1',
          dayNumber: '3',
        },
      });
    });
  });

  describe('shouldHydrateNotificationResponse', () => {
    it('keeps a recently tapped cold-start notification eligible during normal app launch delay', () => {
      expect(
        shouldHydrateNotificationResponse({
          tappedAtMs: 1_000,
          nowMs: 16_000,
        }),
      ).toBe(true);
    });

    it('ignores stale notification responses from much older launches', () => {
      expect(
        shouldHydrateNotificationResponse({
          tappedAtMs: 1_000,
          nowMs: 1_000 + 5 * 60_000 + 1,
        }),
      ).toBe(false);
    });
  });

  describe('shouldMarkNotificationNavigationReady', () => {
    it('treats the root welcome screen as navigation-ready once the root stack exists so cold-start notifications can replace it', () => {
      expect(
        shouldMarkNotificationNavigationReady({ pathname: '/', rootNavigationKey: 'root-key' }),
      ).toBe(true);
    });

    it('treats unresolved pathname values as not ready', () => {
      expect(
        shouldMarkNotificationNavigationReady({ pathname: '', rootNavigationKey: 'root-key' }),
      ).toBe(false);
    });

    it('waits for the root navigation container before declaring cold-start notification routing ready', () => {
      expect(
        shouldMarkNotificationNavigationReady({ pathname: '/', rootNavigationKey: undefined }),
      ).toBe(false);
    });
  });

  describe('createNotificationNavigationCoordinator', () => {
    const devotionalReadyData = {
      type: 'devotional_ready',
      devotionalId: 'dev-1',
      dayNumber: 3,
      dayTitle: 'Hope',
      seriesTitle: 'Psalm Walk',
      totalDays: 7,
    };

    it('emits coordinator debug events when a notification is queued then flushed', () => {
      const replace = jest.fn();
      const onEvent = jest.fn();
      const coordinator = createNotificationNavigationCoordinator({ replace, onEvent });

      coordinator.queueFromData(devotionalReadyData, 'notif-1');
      coordinator.setNavigationReady(true);

      expect(onEvent.mock.calls).toEqual([
        [
          expect.objectContaining({
            type: 'queued',
            notificationKey: 'notif-1',
            route: expect.objectContaining({ pathname: '/reveal' }),
          }),
        ],
        [
          expect.objectContaining({
            type: 'flush_skipped_not_ready',
            notificationKey: 'notif-1',
            route: expect.objectContaining({ pathname: '/reveal' }),
          }),
        ],
        [
          expect.objectContaining({
            type: 'navigation_ready_changed',
            ready: true,
          }),
        ],
        [
          expect.objectContaining({
            type: 'flushed',
            notificationKey: 'notif-1',
            route: expect.objectContaining({ pathname: '/reveal' }),
          }),
        ],
      ]);
    });

    it('queues a cold-start devotional notification until navigation is ready', () => {
      const replace = jest.fn();
      const coordinator = createNotificationNavigationCoordinator({ replace });

      coordinator.queueFromData(devotionalReadyData);
      expect(replace).not.toHaveBeenCalled();

      coordinator.setNavigationReady(true);

      expect(replace).toHaveBeenCalledWith({
        pathname: '/reveal',
        params: {
          devotionalId: 'dev-1',
          dayNumber: '3',
          dayTitle: 'Hope',
          seriesTitle: 'Psalm Walk',
          totalDays: '7',
        },
      });
    });

    it('navigates immediately when navigation is already ready', () => {
      const replace = jest.fn();
      const coordinator = createNotificationNavigationCoordinator({ replace });

      coordinator.setNavigationReady(true);
      coordinator.queueFromData(devotionalReadyData);

      expect(replace).toHaveBeenCalledTimes(1);
    });

    it('deduplicates the same notification key across cold-start and warm handling', () => {
      const replace = jest.fn();
      const onEvent = jest.fn();
      const coordinator = createNotificationNavigationCoordinator({ replace, onEvent });

      coordinator.queueFromData(devotionalReadyData, 'notif-1');
      coordinator.setNavigationReady(true);
      coordinator.queueFromData(devotionalReadyData, 'notif-1');

      expect(replace).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ignored_duplicate',
          notificationKey: 'notif-1',
        }),
      );
    });
  });
});
