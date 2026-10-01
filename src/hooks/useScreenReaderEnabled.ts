import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether a screen reader (VoiceOver, TalkBack) is on. It follows the
 *  setting while the component is mounted. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    let changed = false;
    // The first answer counts only when no change came before it. It can
    // only turn the state on: the state starts off.
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (mounted && !changed && on) setEnabled(true);
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
      changed = true;
      setEnabled(on);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
