import React from 'react';
import { LayoutChangeEvent, StyleSheet, View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { CompanionOrb } from '@/components/CompanionOrb';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { buildBubblePath } from '@/lib/bubble-path';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  text: string;
  colors: ColorTheme;
}

const BODY_TEXT_MAX_SCALE = 1.28;
const BUBBLE_TAIL_WIDTH = 6;
const BUBBLE_TAIL_HEIGHT = 14;
// The left tail needs room to sit on the orb centerline. A smaller top-left
// radius keeps the shared path from clamping the tail back down.
const BUBBLE_TAIL_CENTER_Y = 18;
const BUBBLE_STROKE_WIDTH = 1;
const BRIDGE_BUBBLE_RADIUS = {
  topLeft: Radius.sm,
  topRight: Radius.lg,
  bottomRight: Radius.lg,
  bottomLeft: Radius.lg,
};

export function DailyBridgeCard({ text, colors }: Props) {
  const { entering } = useAccessibleAnimation();
  const bubbleColor = alpha(colors.accent, 0.06);
  const bubbleBorder = alpha(colors.accent, 0.13);
  const [bubbleSize, setBubbleSize] = React.useState({ width: 0, height: 0 });
  const bubblePath = React.useMemo(
    () =>
      bubbleSize.width > 0 && bubbleSize.height > 0
        ? buildBubblePath({
            width: bubbleSize.width,
            height: bubbleSize.height,
            radius: BRIDGE_BUBBLE_RADIUS,
            tail: {
              edge: 'left',
              centerY: BUBBLE_TAIL_CENTER_Y,
              width: BUBBLE_TAIL_WIDTH,
              height: BUBBLE_TAIL_HEIGHT,
            },
            strokeWidth: BUBBLE_STROKE_WIDTH,
          })
        : null,
    [bubbleSize.height, bubbleSize.width],
  );
  const handleBubbleLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBubbleSize((previous) => {
      if (Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1) return previous;
      return { width, height };
    });
  }, []);

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
          <View style={styles.bubble} onLayout={handleBubbleLayout}>
            {bubblePath ? (
              <Svg
                pointerEvents="none"
                width={bubbleSize.width + BUBBLE_TAIL_WIDTH}
                height={bubbleSize.height}
                viewBox={`0 0 ${bubbleSize.width + BUBBLE_TAIL_WIDTH} ${bubbleSize.height}`}
                style={[styles.bubbleShape, { left: -BUBBLE_TAIL_WIDTH }]}
              >
                <Path
                  d={bubblePath}
                  fill={bubbleColor}
                  stroke={bubbleBorder}
                  strokeWidth={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            ) : null}
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
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3.5'],
  },
  bubbleShape: {
    position: 'absolute',
    top: 0,
  },
  text: {
    position: 'relative',
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
});
