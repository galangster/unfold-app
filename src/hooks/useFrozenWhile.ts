import { useRef } from 'react';

/**
 * Returns the value seen when `active` became true, until `active` turns
 * false. Use it to keep choices still under the reader's finger.
 */
export function useFrozenWhile<T>(active: boolean, value: T): T {
  const frozen = useRef<{ value: T } | null>(null);
  if (!active) {
    frozen.current = null;
    return value;
  }
  frozen.current ??= { value };
  return frozen.current.value;
}
