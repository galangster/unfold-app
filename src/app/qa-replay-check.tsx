import React, { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { Redirect, useRouter } from 'expo-router';
import { CaretLeftIcon } from 'phosphor-react-native';
import { captureAppError, isReplayPilotBuildProfile, isSentryEnabled } from '@/lib/sentry';

/** Internal replay fixture. Open unfold://qa-replay-check on the pilot build. */
export default function ReplayCheckScreen() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  if (!isReplayPilotBuildProfile(Constants.expoConfig?.extra?.buildProfile ?? '')) {
    return <Redirect href="/" />;
  }
  const enabled = isSentryEnabled();
  const buttonLabel = !enabled ? 'Sentry is disabled in this build' : sent ? 'Test sent' : 'Send replay test';

  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 80, gap: 24, backgroundColor: '#111111' }}>
      <Text style={{ color: '#ffffff', fontSize: 24 }}>Replay verification</Text>
      <Text style={{ color: '#ffffff' }}>SYNTHETIC PRIVATE TEXT</Text>
      <TextInput
        accessibilityLabel="Synthetic private input"
        defaultValue="SYNTHETIC PRIVATE INPUT"
        style={{ color: '#ffffff', borderColor: '#ffffff', borderWidth: 1, padding: 12 }}
      />
      <Image source={require('../../assets/images/icon.png')} style={{ width: 80, height: 80 }} />
      <CaretLeftIcon size={48} color="#ffffff" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        accessibilityState={{ disabled: !enabled || sent }}
        disabled={!enabled || sent}
        onPress={() => {
          if (!enabled || sent) return;
          captureAppError('replay-pilot-check', new Error('Sentry replay pilot verification'));
          setSent(true);
        }}
        style={{ padding: 16, backgroundColor: '#eeeeee' }}
      >
        <Text>{buttonLabel}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Go to Today" onPress={() => router.replace('/(tabs)/(today)')}>
        <Text style={{ color: '#ffffff' }}>Go to Today</Text>
      </Pressable>
    </View>
  );
}
