import { getAuthHeaders, PRIMARY_BACKEND_URL } from './api-config';
import { authenticatedFetch } from './device-credential';
import { logger } from './logger';
import { getDeviceId } from './mmkv-storage';
import type { UserProfile } from './store';
import { enqueueSyncChanges } from './sync-outbox';
import { buildSyncPushBody } from './sync-push-body';
import {
  assertSyncSessionCurrent,
  captureSyncSession,
  isSyncSessionCurrent,
  registerSyncTransport,
  SyncSessionInvalidatedError,
} from './sync-session-fence';

export type UserProfileSyncChange = {
  table: 'users';
  id: string;
  data: Record<string, unknown>;
  clientUpdatedAt: string;
  deleted: false;
};

function withoutUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

export function buildUserProfileSyncId(deviceId = getDeviceId()): string {
  return `user-profile-${deviceId}`;
}

export function buildUserProfileSyncData(user: UserProfile): Record<string, unknown> {
  const settings = withoutUndefined({
    writingStyle: user.writingStyle,
    readingDuration: user.readingDuration,
    devotionalLength: user.devotionalLength,
    reminderTime: user.reminderTime,
    dailyReminderEnabled: user.dailyReminderEnabled,
    localDailyReminderScheduled: user.localDailyReminderScheduled,
    bibleTranslation: user.bibleTranslation,
    fontSize: user.fontSize,
    themeMode: user.themeMode,
    accentTheme: user.accentTheme,
    readingFont: user.readingFont,
    preferredVoice: user.preferredVoice,
    selectedTheme: user.selectedTheme,
    selectedType: user.selectedType,
    selectedStudySubject: user.selectedStudySubject,
  });

  return withoutUndefined({
    name: user.name,
    aboutMe: user.aboutMe,
    personaTraits: user.personaTraits,
    currentSituation: user.currentSituation,
    emotionalState: user.emotionalState,
    spiritualSeeking: user.spiritualSeeking,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
    hasCompletedStyleOnboarding: user.hasCompletedStyleOnboarding,
    settings,
    relationshipWithGod: user.relationshipWithGod,
    bibleFrequency: user.bibleFrequency,
    growthGoals: user.growthGoals,
    obstacles: user.obstacles,
    companionName: user.companionName,
  });
}

export function buildUserProfileSyncChange(
  user: UserProfile,
  clientUpdatedAt: string,
  deviceId = getDeviceId()
): UserProfileSyncChange {
  return {
    table: 'users',
    id: buildUserProfileSyncId(deviceId),
    data: buildUserProfileSyncData(user),
    clientUpdatedAt,
    deleted: false,
  };
}

export async function syncUserProfileToBackend(
  user: UserProfile,
  clientUpdatedAt = new Date().toISOString()
): Promise<void> {
  const session = captureSyncSession();
  assertSyncSessionCurrent(session, 'user profile sync');
  const change = buildUserProfileSyncChange(user, clientUpdatedAt);

  const controller = new AbortController();
  const unregister = registerSyncTransport(controller);
  try {
    const headers = await getAuthHeaders();
    assertSyncSessionCurrent(session, 'user profile sync');

    const response = await authenticatedFetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
      method: 'POST',
      headers,
      body: buildSyncPushBody([change]),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`User profile sync failed with HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null) as {
      results?: Array<{ status?: string; reason?: string }>;
    } | null;
    assertSyncSessionCurrent(session, 'user profile sync');
    const result = payload?.results?.[0];
    if (result?.status && result.status !== 'accepted') {
      throw new Error(`User profile sync ${result.status}${result.reason ? `: ${result.reason}` : ''}`);
    }

    logger.log('[user-sync] Profile synced to backend');
  } catch (error) {
    if (!isSyncSessionCurrent(session)) {
      throw error instanceof SyncSessionInvalidatedError
        ? error
        : new SyncSessionInvalidatedError('user profile sync');
    }
    enqueueSyncChanges([change]);
    throw error;
  } finally {
    unregister();
  }
}
