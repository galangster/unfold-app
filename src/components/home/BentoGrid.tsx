import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BookOpenIcon, BookmarksSimpleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

export function BentoGrid() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { entering } = useAccessibleAnimation();

  const items = [
    {
      label: 'My Devotionals',
      icon: BookOpenIcon,
      pathname: '/(tabs)/(you)/past-devotionals',
    },
    {
      label: 'My Library',
      icon: BookmarksSimpleIcon,
      pathname: '/(tabs)/(you)/my-content',
    },
  ];

  return (
    <Animated.View
      entering={entering(FadeIn.duration(400).delay(150))}
      style={styles.container}
    >
      <View style={styles.row}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.label}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: item.pathname as any, params: { from: 'home' } });
            }}
            style={[
              styles.box,
              {
                backgroundColor: Platform.OS === 'ios'
                  ? alpha(colors.inputBackground, 0.6)
                  : alpha(colors.inputBackground, 0.85),
                borderColor: colors.border,
              },
            ]}
          >
            {/* Frosted glass blur (iOS only) */}
            {Platform.OS === 'ios' && (
              <BlurView
                intensity={80}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}
            <item.icon size={20} color={colors.textMuted} weight="light" />
            <Text
              style={[styles.label, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['5'],
  },
  row: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  box: {
    flex: 1,
    paddingVertical: Spacing['4'],
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
});
