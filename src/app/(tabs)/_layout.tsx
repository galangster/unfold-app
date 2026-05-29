import { useEffect, useRef } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform, View, TouchableOpacity, Text } from 'react-native';
import { HouseIcon, BookBookmarkIcon, BookOpenIcon, UserIcon, CircleNotchIcon } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
  FadeOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Duration, Spring } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useUIState } from '@/lib/ui-state';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { getNoteDraftDockOffset, useNoteDraftDock } from '@/lib/note-draft-dock';
// Expo Router owns its tab navigator types in SDK 56+. Use structural typing
// here so this custom tab bar stays decoupled from router internals.
type TabBarProps = {
  state: { routes: { key: string; name: string; params?: object }[]; index: number };
  descriptors: Record<string, { options: Record<string, any> }>;
  navigation: { emit: (event: any) => any; navigate: (...args: any[]) => void };
};

const SPRING_CONFIG = Spring.snappy;

function NoteDraftDock() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const draft = useNoteDraftDock((s) => s.draft);
  const clearDraft = useNoteDraftDock((s) => s.clearDraft);
  const tabBarHidden = useUIState((s) => s.tabBarHidden);
  const dockOffset = getNoteDraftDockOffset({
    safeAreaBottom: insets.bottom,
    tabBarHidden,
  });
  const dockTranslateY = useSharedValue(dockOffset.translateY);

  useEffect(() => {
    dockTranslateY.value = reducedMotion
      ? dockOffset.translateY
      : withTiming(dockOffset.translateY, { duration: Duration.fast });
  }, [dockOffset.translateY, dockTranslateY, reducedMotion]);

  const dockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dockTranslateY.value }],
  }));

  if (!draft) return null;

  const handleRestore = () => {
    const noteId = draft.noteId;
    clearDraft();
    router.push({
      pathname: '/(tabs)/(journal)/note-detail',
      params: { noteId, startEditing: 'true' },
    });
  };

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal)}
      exiting={reducedMotion ? undefined : FadeOutDown.duration(Duration.fast)}
      pointerEvents="box-none"
      style={[
        styles.draftDockWrap,
        { bottom: dockOffset.bottom },
        dockAnimatedStyle,
      ]}
    >
      <TouchableOpacity
        onPress={handleRestore}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel="Restore minimized note"
        accessibilityHint="Opens the minimized note in edit mode"
        style={[
          styles.draftDock,
          {
            backgroundColor: isDark ? 'rgba(28, 24, 20, 0.96)' : 'rgba(255, 252, 247, 0.98)',
            borderColor: colors.border,
            shadowColor: '#000',
          },
        ]}
      >
        <View style={[styles.draftDockIcon, { backgroundColor: colors.accent + '1A' }]}>
          <BookOpenIcon size={18} color={colors.accent} weight="light" />
        </View>
        <View style={styles.draftDockCopy}>
          <Text style={[styles.draftDockTitle, { color: colors.text }]} numberOfLines={1}>
            {draft.title}
          </Text>
          <Text style={[styles.draftDockPreview, { color: colors.textMuted }]} numberOfLines={1}>
            {draft.preview}
          </Text>
        </View>
        <Text style={[styles.draftDockAction, { color: colors.accent }]}>Restore</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Animated wrapper for each tab icon -- handles scale spring + dot indicator */
function AnimatedTabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(focused ? 1 : 1);

  useEffect(() => {
    if (focused) {
      // Spring pop on select
      scale.value = withSpring(1.12, SPRING_CONFIG);
    } else {
      scale.value = withSpring(1, SPRING_CONFIG);
    }
  }, [focused, scale]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={iconAnimStyle}>
        {children}
      </Animated.View>
    </View>
  );
}

/** Fully custom tab bar with frosted glass, animated indicators, and premium feel */
function CustomTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHidden = useUIState((s) => s.tabBarHidden);
  const tabBarHideMode = useUIState((s) => s.tabBarHideMode);

  // Audio player auto-collapse: sheet → pill on tab switch
  const playerTier = useAudioPlayerState((s) => s.playerTier);
  const setPlayerTier = useAudioPlayerState((s) => s.setTier);

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
          paddingTop: Spacing['2'],
          paddingBottom: Math.max(insets.bottom, 8),
          paddingHorizontal: Spacing['6'],
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

            if (!event.defaultPrevented) {
              if (!isFocused) {
                navigation.navigate(route.name, route.params);
              } else {
                // Already on this tab — pop to root (e.g., reading → home)
                navigation.navigate(route.name, { screen: 'index' });
              }

              // Auto-collapse audio player to pill on tab switch
              if (playerTier === 'sheet') {
                setPlayerTier('pill');
              }
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
            <TouchableOpacity activeOpacity={1}
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessible
              testID={`bottom-tab-${label.toLowerCase()}`}
              importantForAccessibility="yes"
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={`${options.tabBarAccessibilityLabel ?? label} tab`}
              accessibilityHint={`Switches to the ${label} tab`}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 2,
              }}
            >
              <AnimatedTabIcon
                focused={isFocused}
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
  const { colors } = useTheme();

  // Subscription gate state
  // DEV bypass: force premium in dev so the overlay doesn't block routine
  // development. Toggleable via the Dev Tools "Simulate Trial Expired" button
  // which sets debugForceTrialExpired=true to preview the churned-user UX.
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props: any) => (
          <CustomTabBar {...props} />
        )}
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
      <NoteDraftDock />
    </View>
  );
}

const styles = StyleSheet.create({
  draftDockWrap: {
    position: 'absolute',
    left: Spacing['4'],
    right: Spacing['4'],
    zIndex: 40,
  },
  draftDock: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  draftDockIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftDockCopy: {
    flex: 1,
    minWidth: 0,
  },
  draftDockTitle: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 14,
  },
  draftDockPreview: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    marginTop: 2,
  },
  draftDockAction: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 13,
  },
});
