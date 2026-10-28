import { useEffect, useState } from 'react';
import { readChapteredSeriesEnabled, refreshRemoteConfig, subscribeRemoteConfig } from '@/lib/remote-config';

/** The weekly chapters creation switch from /api/config. Unreadable means off. Follows every refresh. */
export function useChapteredSeriesEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => readChapteredSeriesEnabled(Date.now()));
  useEffect(() => {
    const read = () => setEnabled(readChapteredSeriesEnabled(Date.now()));
    const unsubscribe = subscribeRemoteConfig(read);
    // A fetch that finished between the first render and this effect has no listener to tell.
    read();
    void refreshRemoteConfig();
    return unsubscribe;
  }, []);
  return enabled;
}
