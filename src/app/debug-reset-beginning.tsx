import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useTheme } from '@/lib/theme';
import { useUIState } from '@/lib/ui-state';
import { performFullLocalReset } from '@/lib/full-reset';

export default function DebugResetBeginningScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isQaToolsEnabled()) return;

    const resetToBeginning = async () => {
      await performFullLocalReset();

      const ui = useUIState.getState();
      ui.setQaPremiumOverride(false);
      ui.setDebugForceTrialExpired(false);
      useUIState.setState({ revenueCatResolved: false });
      useUIState.setState({
        tabBarHidden: false,
        tabBarHideMode: 'slide',
        revealTransitioning: false,
      });

      router.dismissAll();
      router.replace('/');
    };

    void resetToBeginning();
  }, [router]);

  if (!isQaToolsEnabled()) {
    return <Redirect href="/(tabs)/(you)" />;
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.accent} />
      <Text
        style={{
          color: colors.text,
          fontSize: 16,
          textAlign: 'center',
        }}
      >
        Resetting Unfold to the beginning…
      </Text>
    </View>
  );
}
