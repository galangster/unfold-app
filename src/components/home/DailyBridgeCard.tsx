import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SparkleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { CompanionOrb } from '@/components/CompanionOrb';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  text: string;
  colors: ColorTheme;
}

const BODY_TEXT_MAX_SCALE = 1.28;
const LABEL_TEXT_MAX_SCALE = 1.14;

export function DailyBridgeCard({ text, colors }: Props) {
  const { entering } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}
      style={styles.wrapper}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Companion bridge. ${text}`}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: alpha(colors.backgroundElevated, 0.62),
            borderColor: alpha(colors.accent, 0.13),
            shadowColor: colors.accent,
          },
        ]}
      >
        <View pointerEvents="none" style={styles.artLayer}>
          <View style={[styles.halo, { borderColor: alpha(colors.accent, 0.12) }]} />
          <View style={[styles.thread, { backgroundColor: alpha(colors.accent, 0.24) }]} />
          <View style={[styles.spark, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
        </View>

        <View style={styles.orbColumn}>
          <CompanionOrb accentColor={colors.accent} size={28} />
          <View style={[styles.orbStem, { backgroundColor: alpha(colors.accent, 0.24) }]} />
        </View>

        <View style={styles.content}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerRule, { backgroundColor: colors.accent }]} />
            <Text style={[styles.kicker, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Companion bridge</Text>
            <SparkleIcon size={12} color={colors.accent} weight="light" />
          </View>

          <Text style={[styles.text, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>{text}</Text>
          <Text style={[styles.helper, { color: colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>A small thread from yesterday into today.</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['3'],
  },
  card: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['3'],
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    ...Shadow.md,
  },
  artLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  halo: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    right: -50,
    top: -56,
  },
  thread: {
    position: 'absolute',
    width: 1,
    height: 100,
    right: 44,
    top: -8,
    transform: [{ rotate: '26deg' }],
  },
  spark: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    right: 32,
    top: 34,
    shadowOpacity: 0.42,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  orbColumn: {
    alignItems: 'center',
    paddingTop: Spacing['1'],
  },
  orbStem: {
    width: 1,
    height: 30,
    marginTop: Spacing['2'],
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['2'],
  },
  kickerRule: {
    width: 18,
    height: 1,
  },
  kicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  text: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  helper: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    lineHeight: 17,
    marginTop: Spacing['2'],
  },
});
