import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function TodayLayout() {
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
      <Stack.Screen name="reading" options={{ animation: 'fade' }} />
      <Stack.Screen name="journal" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="journal-detail" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen name="highlights" options={{ animation: 'ios_from_right' }} />
      <Stack.Screen
        name="evening-wind-down"
        options={{ animation: 'fade_from_bottom' }}
      />
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
