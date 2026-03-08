import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform } from 'react-native';
import { HouseIcon, BookOpenIcon, UserIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: -2,
        },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: isDark ? 'rgba(10, 10, 10, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          ...Platform.select({
            ios: {
              // Transparent background for blur
            },
            android: {
              elevation: 0,
            },
          }),
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={80}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="(today)"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => (
            <HouseIcon
              size={22}
              color={color}
              weight={focused ? 'fill' : 'light'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="(journal)"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color, focused }) => (
            <BookOpenIcon
              size={22}
              color={color}
              weight={focused ? 'fill' : 'light'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="(you)"
        options={{
          title: 'You',
          tabBarIcon: ({ color, focused }) => (
            <UserIcon
              size={22}
              color={color}
              weight={focused ? 'fill' : 'light'}
            />
          ),
        }}
      />
    </Tabs>
  );
}
