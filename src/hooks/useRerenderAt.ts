import { useEffect, useState } from 'react';

/**
 * Renders the component again once `atMs` has passed. A value read from
 * Date.now() during render, such as a retry that opens at a set time, is
 * otherwise stale until something else renders the screen.
 */
export function useRerenderAt(atMs: number | null | undefined): void {
  const [, setRenders] = useState(0);
  useEffect(() => {
    if (atMs == null || !Number.isFinite(atMs)) return;
    const waitMs = atMs - Date.now();
    if (waitMs < 0) return;
    // One millisecond past the time, so a strict `now < atMs` check has passed.
    const timer = setTimeout(() => setRenders((count) => count + 1), waitMs + 1);
    return () => clearTimeout(timer);
  }, [atMs]);
}
