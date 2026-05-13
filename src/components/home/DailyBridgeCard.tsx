import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
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

export function DailyBridgeCard({ text, colors }: Props) {
  const { entering } = useAccessibleAnimation();
  const bubbleColor = alpha(colors.accent, 0.06);
  const bubbleBorder = alpha(colors.accent, 0.13);

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}
      style={styles.wrapper}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Companion says: ${text}`}
    >
      <View style={styles.row}>
        <View style={styles.orbWrap}>
          <CompanionOrb accentColor={colors.accent} size={24} />
        </View>

        <View style={styles.bubbleWrap}>
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: bubbleColor,
                borderColor: bubbleBorder,
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.bubbleTail,
                {
                  backgroundColor: bubbleColor,
                  borderColor: bubbleBorder,
                },
              ]}
            />
            <Text style={[styles.text, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
              {text}
            </Text>
          </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['2.5'],
  },
  orbWrap: {
    marginTop: Spacing['2'],
  },
  bubbleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  bubble: {
    position: 'relative',
    overflow: 'visible',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: Radius.lg,
    borderTopLeftRadius: Radius.sm,
    borderWidth: 1,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3.5'],
  },
  bubbleTail: {
    position: 'absolute',
    left: -5,
    top: 15,
    width: 10,
    height: 10,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  text: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
});
