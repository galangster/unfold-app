import { Stack } from 'expo-router';

export default function JournalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'ios_from_right',
        animationDuration: 280,
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="entry" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="my-responses" options={{ animation: 'ios_from_right' }} />
    </Stack>
  );
}
