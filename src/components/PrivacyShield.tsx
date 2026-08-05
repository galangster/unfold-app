import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View, type AppStateStatus } from 'react-native';

import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

export function shouldShowPrivacyShield(status: AppStateStatus): boolean {
  return status !== 'active';
}

export function PrivacyShield() {
  const { colors } = useTheme();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => subscription.remove();
  }, []);

  if (!shouldShowPrivacyShield(appState)) return null;

  return (
    <View
      testID="privacy-shield"
      style={[styles.shield, { backgroundColor: colors.background }]}
    >
      <Text style={[styles.wordmark, { color: colors.accent }]}>Unfold</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shield: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
  wordmark: {
    fontFamily: FontFamily.display,
    fontSize: 21,
  },
});
