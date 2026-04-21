import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { buildDevotionalSeed } from '@/lib/dev-seed';

export default function DebugSeedRevealScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (!__DEV__) return;

    const seeded = buildDevotionalSeed();
    const store = useUnfoldStore.getState();
    store.addDevotional(seeded);
    store.setCurrentDevotional(seeded.id);

    router.replace({
      pathname: '/reveal',
      params: {
        devotionalId: seeded.id,
        dayNumber: String(seeded.currentDay),
        seriesTitle: seeded.title,
        dayTitle: seeded.days[0]?.title ?? '',
        totalDays: String(seeded.totalDays),
      },
    });
  }, [router]);

  if (!__DEV__) {
    return <Redirect href="/(tabs)/(you)" />;
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
