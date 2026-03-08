import { Stack } from 'expo-router';

export default function JournalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="entry" />
      <Stack.Screen name="my-responses" />
    </Stack>
  );
}
