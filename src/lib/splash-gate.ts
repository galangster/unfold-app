import type { AppStateStatus } from 'react-native';

/** Native splash must hide this long after RootLayout mounts, even if fonts never settle. */
export const SPLASH_FAILSAFE_MS = 2500;

export type SplashHideAsync = () => void | Promise<unknown>;

export type SplashGate = {
  startFailsafe: () => void;
  onFontsSettled: () => void;
  onAppStateChange: (status: AppStateStatus) => void;
  dispose: () => void;
};

/**
 * One-shot native splash hide. Fonts still wait one animation frame so the
 * first JS frame can paint. A mount-time timer and an AppState `active`
 * transition hide anyway when that frame never runs.
 */
export function createSplashGate({
  hideAsync,
  failsafeMs = SPLASH_FAILSAFE_MS,
  requestAnimationFrame: scheduleFirstFrame = (callback) => {
    requestAnimationFrame(callback);
  },
}: {
  hideAsync: SplashHideAsync;
  failsafeMs?: number;
  requestAnimationFrame?: (callback: () => void) => unknown;
}): SplashGate {
  let hidden = false;
  let failsafeId: ReturnType<typeof setTimeout> | null = null;

  const clearFailsafe = () => {
    if (failsafeId != null) {
      clearTimeout(failsafeId);
      failsafeId = null;
    }
  };

  const hide = () => {
    if (hidden) return;
    hidden = true;
    clearFailsafe();
    try {
      void Promise.resolve(hideAsync()).catch(() => undefined);
    } catch {
      // hideAsync threw before returning a promise
    }
  };

  return {
    startFailsafe: () => {
      if (hidden || failsafeId != null) return;
      failsafeId = setTimeout(hide, failsafeMs);
    },
    onFontsSettled: () => {
      if (hidden) return;
      scheduleFirstFrame(hide);
    },
    onAppStateChange: (status) => {
      if (status === 'active') hide();
    },
    dispose: () => {
      clearFailsafe();
    },
  };
}
