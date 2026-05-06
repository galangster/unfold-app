import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BookOpenIcon, BookmarksSimpleIcon, CaretRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';

import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const LABEL_TEXT_MAX_SCALE = 1.16;

export function BentoGrid() {
  const { colors } = useTheme();
  const router = useRouter();
  const { entering } = useAccessibleAnimation();

  const items = [
    {
      label: 'My Devotionals',
      icon: BookOpenIcon,
      pathname: '/(tabs)/(today)/past-devotionals',
    },
    {
      label: 'My Library',
      icon: BookmarksSimpleIcon,
      pathname: '/(tabs)/(today)/my-content',
    },
  ];

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(260).easing(Ease.out))}
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
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.label}`}
            accessibilityHint="Opens this section from the Today tab"
            style={[
              styles.box,
              {
                backgroundColor: alpha(colors.backgroundElevated, 0.54),
                borderColor: alpha(colors.text, 0.08),
              },
            ]}
          >
            <View style={[styles.iconShell, { backgroundColor: alpha(colors.accent, 0.08) }]}>
              <item.icon size={17} color={colors.textMuted} weight="light" />
            </View>
            <Text
              style={[styles.label, { color: colors.text }]}
              numberOfLines={2}
              maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}
            >
              {item.label}
            </Text>
            <CaretRightIcon size={13} color={colors.textSubtle} weight="light" />
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['3'],
  },
  row: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  box: {
    flex: 1,
    minHeight: 58,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3'],
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  iconShell: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    flexShrink: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
});
