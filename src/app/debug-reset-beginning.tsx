import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { isQaToolsEnabled } from '@/lib/qa-tools';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { cancelAllReminders } from '@/lib/notifications';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { useTheme } from '@/lib/theme';
import { useUIState } from '@/lib/ui-state';
import { useUnfoldStore } from '@/lib/store';

export default function DebugResetBeginningScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isQaToolsEnabled()) return;

    const resetToBeginning = async () => {
      await cancelAllReminders();

      useUnfoldStore.getState().reset();
      useCompanionChatStore.getState().clearAllConversations();

      mmkvStorage.removeItem('unfold-storage');
      mmkvStorage.removeItem('unfold-companion-chat');
      mmkvStorage.removeItem('@unfold_companion_daily');
      mmkvStorage.removeItem('@unfold_exclusive_offer_seen');
      mmkvStorage.removeItem('@unfold_onboarding_offer_seen');
      mmkvStorage.removeItem('inflight-generation-job');

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
