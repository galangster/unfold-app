import { getAuthHeaders, PRIMARY_BACKEND_URL } from './api-config';
import { authenticatedFetch } from './device-credential';
import { logger } from './logger';
import { getDeviceId, mmkvStorage } from './mmkv-storage';
import type { UserProfile } from './store';
import { resolveCompanionPersonality } from './companion-personality';
import { correlateSyncAcknowledgements, isValidConflictResult } from './sync-acknowledgements';
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
    companionPersonality: resolveCompanionPersonality(user.companionPersonality),
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

/**
 * The newest profile stamp the server refused because it holds a newer row.
 * Server last-write-wins only moves forward, so a snapshot stamped at or
 * before it can never land. Without this, useUserProfileSync re-sent the same
 * persisted snapshot on every app open, and the outbox sent it once more.
 */
export const USER_PROFILE_CONFLICT_KEY = 'user-profile-sync-conflict-v1';

function serverHoldsNewerProfile(change: UserProfileSyncChange): boolean {
  const raw = mmkvStorage.getItem(USER_PROFILE_CONFLICT_KEY);
  if (typeof raw !== 'string') return false;
  try {
    const refused = JSON.parse(raw) as { id?: unknown; clientUpdatedAt?: unknown };
    if (refused.id !== change.id || typeof refused.clientUpdatedAt !== 'string') return false;
    return Date.parse(change.clientUpdatedAt) <= Date.parse(refused.clientUpdatedAt);
  } catch {
    return false;
  }
}

export async function syncUserProfileToBackend(
  user: UserProfile,
  clientUpdatedAt = new Date().toISOString()
): Promise<void> {
  const session = captureSyncSession();
  assertSyncSessionCurrent(session, 'user profile sync');
  const change = buildUserProfileSyncChange(user, clientUpdatedAt);
  if (serverHoldsNewerProfile(change)) return;

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
    // A conflict is the server's final answer for this snapshot, as in the
    // outbox drain: its newer row stands. Queueing it would only re-send a
    // snapshot that cannot win. A rejection still queues for retry below.
    const answer = correlateSyncAcknowledgements([change], payload?.results ?? [])[0]?.result;
    if (answer && isValidConflictResult(answer)) {
      mmkvStorage.setItem(USER_PROFILE_CONFLICT_KEY, JSON.stringify({
        id: change.id,
        clientUpdatedAt: change.clientUpdatedAt,
      }));
      logger.log('[user-sync] Server holds a newer profile; not re-sending this one');
      return;
    }
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
