import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useAppForegrounded(): boolean {
  const [foregrounded, setForegrounded] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setForegrounded(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  return foregrounded;
}
