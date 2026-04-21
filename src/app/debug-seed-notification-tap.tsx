import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';

import { buildDevotionalSeed } from '@/lib/dev-seed';
import { scheduleDevotionalReadyTapTestNotification } from '@/lib/notifications';
import { useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

export default function DebugSeedNotificationTapScreen() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)/(you)" />;
  }

  const { colors } = useTheme();
  const [status, setStatus] = useState('Scheduling devotional-ready tap test…');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const seeded = buildDevotionalSeed();
      const store = useUnfoldStore.getState();
      store.addDevotional(seeded);
      store.setCurrentDevotional(seeded.id);

      const scheduled = await scheduleDevotionalReadyTapTestNotification(seeded, {
        dayNumber: seeded.currentDay,
        delaySeconds: 2,
      });

      if (cancelled) return;
      setStatus(
        scheduled
          ? 'Notification scheduled. Tap the devotional-ready banner when it appears to verify tap-through routing.'
          : 'Notification was not scheduled. Check notification permission on this simulator/device and try again.',
      );
    };

    run().catch((error) => {
      if (cancelled) return;
      setStatus(`Tap-test setup failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.accent} />
      <Text
        style={{
          color: colors.text,
          textAlign: 'center',
          fontSize: 16,
          lineHeight: 24,
        }}
      >
        {status}
      </Text>
    </View>
  );
}
