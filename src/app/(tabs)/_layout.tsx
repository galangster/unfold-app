import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform, View, TouchableOpacity, Text } from 'react-native';
import { HouseIcon, BookBookmarkIcon, BookOpenIcon, UserIcon, CircleNotchIcon } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Duration, Spring } from '@/constants/animations';
import { useUIState } from '@/lib/ui-state';
// expo-router bundles its own @react-navigation/bottom-tabs which has
// type mismatches with the project-level version. Use structural typing.
type TabBarProps = {
  state: { routes: Array<{ key: string; name: string; params?: object }>; index: number };
  descriptors: Record<string, { options: Record<string, any> }>;
  navigation: { emit: (event: any) => any; navigate: (...args: any[]) => void };
};

const SPRING_CONFIG = Spring.snappy;

/** Animated wrapper for each tab icon -- handles scale spring + dot indicator */
function AnimatedTabIcon({
  focused,
  color,
  accentColor,
  children,
}: {
  focused: boolean;
  color: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(focused ? 1 : 1);
  const dotOpacity = useSharedValue(focused ? 1 : 0);
  const dotScale = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    if (focused) {
      // Spring pop on select
      scale.value = withSpring(1.12, SPRING_CONFIG);
      dotOpacity.value = withSpring(1, SPRING_CONFIG);
      dotScale.value = withSpring(1, SPRING_CONFIG);
    } else {
      scale.value = withSpring(1, SPRING_CONFIG);
      dotOpacity.value = withTiming(0, { duration: 200 });
      dotScale.value = withTiming(0, { duration: 200 });
    }
  }, [focused, scale, dotOpacity, dotScale]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotAnimStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotScale.value }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={iconAnimStyle}>
        {children}
      </Animated.View>
      <Animated.View
        style={[
          {
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: accentColor,
            marginTop: 4,
          },
          dotAnimStyle,
        ]}
      />
    </View>
  );
}

/** Fully custom tab bar with frosted glass, animated indicators, and premium feel */
function CustomTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHidden = useUIState((s) => s.tabBarHidden);
  const tabBarHideMode = useUIState((s) => s.tabBarHideMode);

  // Slide channel (scroll-based) and instant channel (verse selection)
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const lastModeRef = useRef<'slide' | 'instant'>('slide');

  useEffect(() => {
    if (tabBarHideMode === 'instant') {
      // Instant — no transition, no flash. Just snap.
      translateY.value = 0;
      opacity.value = tabBarHidden ? 0 : 1;
    } else {
      // Slide for scroll-based hide/show
      // If transitioning from instant-hidden → slide, fix positioning first
      if (lastModeRef.current === 'instant' && tabBarHidden) {
        // Was instant-hidden (opacity 0, translateY 0).
        // Snap translateY to hidden position, restore opacity, then slide works normally.
        translateY.value = 100;
        opacity.value = 1;
      } else if (lastModeRef.current === 'instant' && !tabBarHidden) {
        // Was instant-hidden, now showing via slide → slide up from bottom
        translateY.value = 100;
        opacity.value = 1;
        translateY.value = withTiming(0, { duration: Duration.normal });
      } else {
        opacity.value = 1;
        translateY.value = withTiming(tabBarHidden ? 100 : 0, { duration: Duration.normal });
      }
    }
    lastModeRef.current = tabBarHideMode;
  }, [tabBarHidden, tabBarHideMode, translateY, opacity]);

  const tabBarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
      }, tabBarAnimStyle]}
      pointerEvents={tabBarHidden ? 'none' : 'auto'}
    >
      {/* Blur background layer */}
      {Platform.OS === 'ios' && (
        <BlurView
          intensity={90}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Subtle top border */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: isDark
            ? 'rgba(245, 240, 235, 0.06)'
            : 'rgba(28, 23, 16, 0.06)',
        }}
      />

      {/* Tab items */}
      <View
        style={{
          flexDirection: 'row',
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingHorizontal: 24,
          backgroundColor: Platform.OS === 'ios'
            ? 'transparent'
            : isDark
              ? 'rgba(10, 10, 10, 0.95)'
              : 'rgba(255, 255, 255, 0.95)',
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // Hide You tab — accessed via profile avatar on home screen
          if (route.name === '(you)') return null;
          const isFocused = state.index === index;

          const activeColor = colors.accent;
          const inactiveColor = colors.textSubtle;
          const currentColor = isFocused ? activeColor : inactiveColor;

          const label =
            typeof options.title === 'string'
              ? options.title
              : route.name === '(today)'
                ? 'Today'
                : route.name === '(bible)'
                  ? 'Bible'
                  : route.name === '(ask)'
                    ? 'Companion'
                    : route.name === '(journal)'
                      ? 'Journal'
                      : 'You';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const renderIcon = () => {
            const iconProps = {
              size: 22,
              color: currentColor,
              weight: (isFocused ? 'fill' : 'light') as 'fill' | 'light',
            };

            switch (route.name) {
              case '(today)':
                return <HouseIcon {...iconProps} />;
              case '(bible)':
                return <BookBookmarkIcon {...iconProps} />;
              case '(ask)':
                return <CircleNotchIcon {...iconProps} />;
              case '(journal)':
                return <BookOpenIcon {...iconProps} />;
              case '(you)':
                return <UserIcon {...iconProps} />;
              default:
                return <HouseIcon {...iconProps} />;
            }
          };

          return (
            <TouchableOpacity activeOpacity={0.7}
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 2,
              }}
            >
              <AnimatedTabIcon
                focused={isFocused}
                color={currentColor}
                accentColor={activeColor}
              >
                {renderIcon()}
              </AnimatedTabIcon>
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 10,
                  color: currentColor,
                  marginTop: 2,
                  letterSpacing: 0.2,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      tabBar={(props: any) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="(today)"
        options={{
          title: 'Today',
        }}
      />
      <Tabs.Screen
        name="(bible)"
        options={{
          title: 'Bible',
        }}
      />
      <Tabs.Screen
        name="(ask)"
        options={{
          title: 'Companion',
        }}
      />
      <Tabs.Screen
        name="(journal)"
        options={{
          title: 'Journal',
        }}
      />
      <Tabs.Screen
        name="(you)"
        options={{
          title: 'You',
          href: null,
        }}
      />
    </Tabs>
  );
}
