import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function BibleLayout() {
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
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="reader" options={{ animation: 'fade', animationDuration: 150 }} />
      <Stack.Screen name="search" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="saved" options={{ animation: 'ios_from_right' }} />
    </Stack>
  );
}
