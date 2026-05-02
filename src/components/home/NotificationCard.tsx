import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ArrowRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { alpha } from '@/components/ui';
import { CompanionOrb } from '@/components/CompanionOrb';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onPress: () => void;
  message: string;
  icon: React.ReactNode;
  accentColor: string;
  delay?: number;
  label?: string;
  actionLabel?: string;
}

const BODY_TEXT_MAX_SCALE = 1.26;
const LABEL_TEXT_MAX_SCALE = 1.14;

export function NotificationCard({
  colors,
  onPress,
  message,
  icon,
  accentColor,
  delay = 150,
  label = 'Companion',
  actionLabel = 'Reflect',
}: Props) {
  const { entering, exiting } = useAccessibleAnimation();
  const { width, fontScale } = useWindowDimensions();
  const useCompactLayout = width < 400 || fontScale >= 1.18;

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(delay).easing(Ease.out))}
      exiting={exiting(FadeOut.duration(Duration.fast).easing(Ease.out))}
      style={styles.wrapper}
    >
      <TouchableOpacity
        activeOpacity={0.72}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${message}`}
        accessibilityHint={`Opens ${actionLabel.toLowerCase()} with the Companion`}
        style={[
          styles.container,
          useCompactLayout && styles.containerCompact,
          {
            borderColor: alpha(accentColor, 0.13),
            backgroundColor: alpha(colors.backgroundElevated, 0.6),
            shadowColor: accentColor,
          },
        ]}
      >
        <View pointerEvents="none" style={styles.artLayer}>
          <View style={[styles.orbit, { borderColor: alpha(accentColor, 0.12) }]} />
          <View style={[styles.thread, { backgroundColor: alpha(accentColor, 0.24) }]} />
        </View>

        <View style={styles.orbWrap}>
          {icon ?? <CompanionOrb accentColor={accentColor} size={30} />}
        </View>

        <View style={styles.messageColumn}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerRule, { backgroundColor: accentColor }]} />
            <Text style={[styles.label, { color: accentColor }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{label}</Text>
          </View>
          <Text style={[styles.message, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>{message}</Text>
        </View>

        <View style={[styles.actionPill, useCompactLayout && styles.actionPillCompact, { borderColor: alpha(accentColor, 0.18), backgroundColor: alpha(accentColor, 0.07) }]}>
          <Text style={[styles.actionText, { color: colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{actionLabel}</Text>
          <ArrowRightIcon size={13} color={accentColor} weight="light" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['3'],
  },
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.xl,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    ...Shadow.md,
  },
  containerCompact: {
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  artLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orbit: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    right: -42,
    top: -48,
  },
  thread: {
    position: 'absolute',
    width: 1,
    height: 82,
    right: 50,
    bottom: -24,
    transform: [{ rotate: '-28deg' }],
  },
  orbWrap: {
    marginRight: Spacing['3'],
  },
  messageColumn: {
    flex: 1,
    minWidth: 0,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['1.5'],
  },
  kickerRule: {
    width: 16,
    height: 1,
  },
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1.5'],
    borderWidth: 1,
    borderRadius: Radius.full,
    marginLeft: Spacing['3'],
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['2.5'],
  },
  actionPillCompact: {
    marginLeft: 0,
    marginTop: Spacing['3'],
  },
  actionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
