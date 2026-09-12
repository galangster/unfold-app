import { Stack } from 'expo-router';

/**
 * Study stack. Holds the current series arc, the library, a past series'
 * arc, and a host-local reader so a Devotional day-tap never leaves this tab.
 * Child reader sheets reuse the Today screens via thin aliases.
 */
export default function StudyLayout() {
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
      <Stack.Screen name="past-devotionals" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="series-detail" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="reading" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true, gestureResponseDistance: { end: 24 } }} />
      <Stack.Screen name="journal" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="journal-detail" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="my-content" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen
        name="day-menu"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5, 0.85],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          headerShown: false,
        }}
      />
    </Stack>
  );
}
