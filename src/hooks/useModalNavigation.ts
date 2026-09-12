import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Keep native navigation outside an iOS modal's dismissal transition. */
export function useModalNavigation(visible: boolean, hide: () => void) {
  const pending = useRef<(() => void) | null>(null);
  const onDismiss = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);

  const navigateAfterDismiss = useCallback((action: () => void) => {
    pending.current = action;
    hide();
  }, [hide]);

  useEffect(() => {
    // React Native emits onDismiss only on iOS. Android removes the hidden modal on commit.
    if (Platform.OS !== 'ios' && !visible) onDismiss();
  }, [visible, onDismiss]);

  useEffect(() => () => { pending.current = null; }, []);
  return { navigateAfterDismiss, onDismiss };
}
