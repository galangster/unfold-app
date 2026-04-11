/**
 * RevenueCat session invalidation event bus.
 *
 * useRevenueCatSync (mounted once at root layout) runs its bootstrap
 * exactly once per app session: on success, it attaches a CustomerInfo
 * listener and flips an internal `bootstrapped` flag that makes all
 * subsequent retry paths no-ops. That's correct for the happy path,
 * but it leaves a hole for the welcome-screen escape hatch:
 *
 *   1. User launches app, signed-in + premium.
 *   2. useRevenueCatSync bootstraps successfully, attaches listener,
 *      writes isPremium=true.
 *   3. Clerk gets stuck. User hits the escape-hatch sign-out button.
 *   4. handleSignOut sets rc-logout-pending in MMKV and fires
 *      rcLogoutUser() in the background.
 *   5. The already-bootstrapped useRevenueCatSync never re-reads the
 *      pending flag, never removes its listener, and any late
 *      CustomerInfo callback from RevenueCat restores isPremium=true
 *      in the now-anonymous session.
 *
 * This event bus is the imperative bridge that closes that hole.
 * handleSignOut calls `invalidateRevenueCatSession()` right after
 * setting the MMKV flag. useRevenueCatSync subscribes on mount; on
 * fire it tears down its listener, clears local premium state, resets
 * its `bootstrapped` flag, and re-runs the full bootstrap path
 * (which will now see rc-logout-pending and block premium writes
 * until it can prove a clean logOut).
 *
 * Why a standalone event bus instead of a Zustand slice or store
 * subscription? The signal has no state worth persisting — it's a
 * one-shot "the welcome escape hatch fired, please reset." A Zustand
 * counter would work but forces every consumer into a selector; this
 * is simpler and has no React coupling.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Subscribe to RevenueCat session invalidation events. Returns an
 * unsubscribe function. Safe to call from useEffect.
 */
export function onRevenueCatSessionInvalidated(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Fire a session-invalidation event to all subscribers. Called from
 * the welcome-screen escape hatch (src/app/index.tsx) after setting
 * the `rc-logout-pending` MMKV flag. Synchronous: listeners run in
 * registration order before this returns. Errors in individual
 * listeners are swallowed so one failing subscriber can't block the
 * others.
 */
export function invalidateRevenueCatSession(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // Swallow — a failing subscriber must not block the others.
    }
  }
}
