import { Stack } from 'expo-router';
import { Colors } from '@/constants/colors';

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="home" />
      <Stack.Screen 
        name="reading" 
        options={{
          animation: 'fade',
        }}
      />
      <Stack.Screen name="journal" />
      <Stack.Screen name="journal-detail" />
      <Stack.Screen name="past-devotionals" />
      <Stack.Screen name="my-responses" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="saved-passages" />
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
