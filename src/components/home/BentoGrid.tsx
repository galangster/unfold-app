import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BookOpenIcon, BookmarksSimpleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';

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
      entering={entering(FadeIn.duration(Duration.normal).delay(150).easing(Ease.out))}
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
                backgroundColor: 'transparent',
                borderColor: colors.border,
                overflow: 'hidden',
              },
            ]}
          >
            <BlurView
              intensity={isDark ? 40 : 30}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
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
