import { Stack } from 'expo-router';

export default function YouLayout() {
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
      <Stack.Screen name="settings" options={{ animation: 'ios_from_right', gestureEnabled: true }} />
      <Stack.Screen name="past-devotionals" options={{ animation: 'ios_from_right', gestureEnabled: true }} />
      <Stack.Screen name="my-content" options={{ animation: 'ios_from_right', gestureEnabled: true }} />
      <Stack.Screen name="checkin-schedule" options={{ animation: 'ios_from_right', gestureEnabled: true }} />
      <Stack.Screen name="series-detail" options={{ animation: 'ios_from_right', gestureEnabled: true }} />
    </Stack>
  );
}
