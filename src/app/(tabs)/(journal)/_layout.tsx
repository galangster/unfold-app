import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function JournalLayout() {
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
      <Stack.Screen name="entry" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="note" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="note-detail" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="my-responses" options={{ animation: 'ios_from_right' }} />
    </Stack>
  );
}
