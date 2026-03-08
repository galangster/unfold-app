import { Stack } from 'expo-router';

export default function TodayLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="reading" />
      <Stack.Screen name="journal" />
      <Stack.Screen name="journal-detail" />
      <Stack.Screen name="highlights" />
      <Stack.Screen name="evening-wind-down" />
      <Stack.Screen
        name="wallpaper"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
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
