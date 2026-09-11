/**
 * useLatestRequest — one guard for "only the latest async request may write
 * state". `begin()` stamps a request and returns an `isCurrent()` predicate to
 * check after each await; `invalidate()` supersedes whatever is in flight
 * (call it when the input changes, the surface closes, or on unmount).
 */
import { useMemo, useRef } from 'react';

export interface LatestRequest {
  begin: () => () => boolean;
  invalidate: () => void;
}

export function useLatestRequest(): LatestRequest {
  const tokenRef = useRef(0);
  return useMemo(
    () => ({
      begin: () => {
        const id = ++tokenRef.current;
        return () => id === tokenRef.current;
      },
      invalidate: () => {
        tokenRef.current += 1;
      },
    }),
    [],
  );
}
