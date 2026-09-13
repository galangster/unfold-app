import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getNextMidnight } from '@/lib/widget-timeline';

/**
 * A local calendar clock for day-gating.
 * It advances at the next midnight and when the app returns to the foreground.
 */
export function useCalendarNow(): Date {
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(() => {
    setNow(new Date());
  }, []);

  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status === 'active') refresh();
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    const delay = Math.max(getNextMidnight(now).getTime() - Date.now(), 50);
    const timer = setTimeout(refresh, delay);
    return () => clearTimeout(timer);
  }, [now, refresh]);

  return now;
}
