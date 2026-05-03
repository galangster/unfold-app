import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useTheme } from '@/lib/theme';
import { useUIState } from '@/lib/ui-state';

type RawParam = string | string[] | undefined;

function firstParam(value: RawParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function shouldGrantQaPremium(mode: RawParam, enabled: RawParam): boolean {
  const raw = (firstParam(enabled) ?? firstParam(mode) ?? 'grant').toLowerCase();
  return !['0', 'false', 'off', 'clear', 'revoke', 'disabled'].includes(raw);
}

export default function DebugPremiumScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { mode, enabled } = useLocalSearchParams<{ mode?: string; enabled?: string }>();
  const shouldGrant = shouldGrantQaPremium(mode, enabled);

  useEffect(() => {
    if (!isQaToolsEnabled()) return;

    const ui = useUIState.getState();

    ui.setQaPremiumOverride(shouldGrant);
    ui.setDebugForceTrialExpired(false);
    ui.setRevenueCatResolved();

    router.replace('/(tabs)/(you)');
  }, [router, shouldGrant]);

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
        {shouldGrant ? 'Granting QA Premium for this session…' : 'Clearing QA Premium override…'}
      </Text>
    </View>
  );
}
