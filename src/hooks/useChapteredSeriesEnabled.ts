import { useEffect, useState } from 'react';
import {
  hasRemoteConfigSettled,
  readChapteredSeriesEnabled,
  refreshRemoteConfig,
  subscribeRemoteConfig,
} from '@/lib/remote-config';

export interface ChapteredSeriesSwitch {
  enabled: boolean;
  /** False until the first config answer. Lets a screen tell "off" from "not known yet". */
  settled: boolean;
}

function readSwitch(): ChapteredSeriesSwitch {
  return { enabled: readChapteredSeriesEnabled(Date.now()), settled: hasRemoteConfigSettled() };
}

/** The weekly chapters creation switch from /api/config. Unreadable means off. Follows every refresh. */
export function useChapteredSeriesSwitch(): ChapteredSeriesSwitch {
  const [snapshot, setSnapshot] = useState(readSwitch);
  useEffect(() => {
    // A first "off" answer changes only `settled`, and it must still render.
    const read = () => setSnapshot((prev) => {
      const next = readSwitch();
      return prev.enabled === next.enabled && prev.settled === next.settled ? prev : next;
    });
    const unsubscribe = subscribeRemoteConfig(read);
    // A fetch that finished between the first render and this effect has no listener to tell.
    read();
    void refreshRemoteConfig();
    return unsubscribe;
  }, []);
  return snapshot;
}

export function useChapteredSeriesEnabled(): boolean {
  return useChapteredSeriesSwitch().enabled;
}
