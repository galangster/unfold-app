import { useRef } from 'react';

/** Returns the value from the previous render. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const prev = ref.current;
  ref.current = value;
  return prev;
}
