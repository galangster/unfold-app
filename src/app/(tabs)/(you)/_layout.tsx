import { Stack } from 'expo-router';

export default function YouLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="streak-settings" />
      <Stack.Screen name="past-devotionals" />
      <Stack.Screen name="saved-passages" />
      <Stack.Screen name="my-content" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="your-journey" />
    </Stack>
  );
}
