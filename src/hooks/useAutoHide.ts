import { useEffect } from 'react';

/**
 * Auto-dismiss: when `visible` becomes true, calls `onHide` after `delayMs`.
 * Cleans up timeout on unmount or when `visible` changes.
 */
export function useAutoHide(
  visible: boolean,
  delayMs: number,
  onHide: () => void,
) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onHide, delayMs);
    return () => clearTimeout(timer);
  }, [visible, delayMs, onHide]);
}
