import { Stack } from 'expo-router';

export default function BibleLayout() {
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
      <Stack.Screen name="reader" options={{ animation: 'fade', animationDuration: 150, gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="search" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
    </Stack>
  );
}
