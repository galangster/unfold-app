import { useEffect, useState } from 'react';
import { readChapteredSeriesEnabled, refreshRemoteConfig } from '@/lib/remote-config';

/** The weekly chapters creation switch from /api/config. Unreadable means off. */
export function useChapteredSeriesEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => readChapteredSeriesEnabled(Date.now()));
  useEffect(() => {
    let live = true;
    void refreshRemoteConfig().then((next) => {
      if (live) setEnabled(readChapteredSeriesEnabled(Date.now(), next));
    });
    return () => {
      live = false;
    };
  }, []);
  return enabled;
}
