import { useEffect } from 'react';

import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { syncUserProfileToBackend } from '@/lib/user-profile-sync';

const PROFILE_SYNC_DEBOUNCE_MS = 1_000;

/**
 * Pushes the persisted user profile/preferences into backend sync_users.
 *
 * Day 2+ generation is queued by the backend, so it cannot read only the local
 * Zustand store. The backend refreshes generation context from sync_users before
 * generating the next day; this hook keeps that canonical row current after
 * onboarding and after Settings edits.
 */
export function useUserProfileSync(): void {
  const user = useUnfoldStore((state) => state.user);
  const userUpdatedAt = useUnfoldStore((state) => state.userUpdatedAt);

  useEffect(() => {
    if (!user || !userUpdatedAt) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      syncUserProfileToBackend(user, userUpdatedAt).catch((error) => {
        logger.warn('[user-sync] Profile sync failed; will retry on next profile change/app start', error);
      });
    }, PROFILE_SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [user, userUpdatedAt]);
}
