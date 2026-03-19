import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function YouLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'ios_from_right',
        animationDuration: 280,
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
      <Stack.Screen name="settings" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="streak-settings" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="past-devotionals" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="saved-passages" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="my-content" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="stats" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="your-journey" options={{ animation: 'ios_from_right' }} />
    </Stack>
  );
}
