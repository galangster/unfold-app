import { getAuthHeaders, PRIMARY_BACKEND_URL } from './api-config';
import { getDeviceId } from './mmkv-storage';
import { logger } from './logger';
import { enqueueSyncChanges } from './sync-outbox';
import type { UserProfile } from './store';

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
  const change = buildUserProfileSyncChange(user, clientUpdatedAt);

  try {
    const response = await fetch(`${PRIMARY_BACKEND_URL}/api/sync/push`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        changes: [change],
        deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    if (!response.ok) {
      throw new Error(`User profile sync failed with HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null) as {
      results?: Array<{ status?: string; reason?: string }>;
    } | null;
    const result = payload?.results?.[0];
    if (result?.status && result.status !== 'accepted') {
      throw new Error(`User profile sync ${result.status}${result.reason ? `: ${result.reason}` : ''}`);
    }

    logger.log('[user-sync] Profile synced to backend');
  } catch (error) {
    enqueueSyncChanges([change]);
    throw error;
  }
}
