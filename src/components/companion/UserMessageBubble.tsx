/**
 * UserMessageBubble — right-aligned accent-tinted bubble.
 * Tail is drawn as part of the same SVG path as the bubble body so it cannot
 * render as a separate square/diamond artifact.
 *
 * ANIMATION: Fade + slide up on entrance (200ms, ease-out).
 */
import { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { alpha } from '@/components/ui';
import { Typography } from '@/constants/typography';
import { buildBubblePath } from '@/lib/bubble-path';
import type { CompanionMessage } from '@/lib/companion-chat-store';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — User Message Send
 *
 *   0ms   user bubble: opacity 0→1, translateY 6→0
 *         duration 200ms, ease-out cubic
 * ───────────────────────────────────────────────────────── */

const ENTERING = FadeInDown.duration(Duration.normal).easing(Ease.out);
const USER_BUBBLE_TAIL_WIDTH = 10;
const USER_BUBBLE_TAIL_HEIGHT = 20;
const USER_BUBBLE_RADIUS = {
  topLeft: 20,
  topRight: 20,
  bottomRight: 8,
  bottomLeft: 20,
};

interface Props {
  message: CompanionMessage;
}

export function UserMessageBubble({ message }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [bubbleSize, setBubbleSize] = useState<{ width: number; height: number } | null>(null);
  const bubbleFill = alpha(colors.accent, 0.15);
  const bubblePath = bubbleSize
    ? buildBubblePath({
        width: bubbleSize.width,
        height: bubbleSize.height,
        radius: USER_BUBBLE_RADIUS,
        tail: {
          edge: 'bottomRight',
          width: USER_BUBBLE_TAIL_WIDTH,
          height: USER_BUBBLE_TAIL_HEIGHT,
        },
        strokeWidth: 0,
      })
    : null;

  return (
    <Animated.View
      entering={reducedMotion ? undefined : ENTERING}
      style={{ alignItems: 'flex-end', paddingRight: Spacing['4'], paddingLeft: 60 }}
    >
      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (!bubbleSize || Math.abs(width - bubbleSize.width) > 1 || Math.abs(height - bubbleSize.height) > 1) {
            setBubbleSize({ width, height });
          }
        }}
        style={{
          maxWidth: '78%',
          marginRight: USER_BUBBLE_TAIL_WIDTH,
          paddingHorizontal: 14,
          paddingVertical: 10,
          overflow: 'visible',
          // Plain-color fallback so the text always sits on a bubble, even
          // during the one frame before onLayout reports a size and the
          // exact tailed SVG shape can be drawn on top of this same fill.
          backgroundColor: bubbleFill,
          borderRadius: USER_BUBBLE_RADIUS.topLeft,
        }}
      >
        {bubbleSize && bubblePath && (
          <Svg
            width={bubbleSize.width + USER_BUBBLE_TAIL_WIDTH}
            height={bubbleSize.height}
            viewBox={`0 0 ${bubbleSize.width + USER_BUBBLE_TAIL_WIDTH} ${bubbleSize.height}`}
            style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
            pointerEvents="none"
          >
            <Path d={bubblePath} fill={bubbleFill} />
          </Svg>
        )}
        <Text
          style={{
            ...Typography.bodyRelaxed,
            color: colors.text,
          }}
        >
          {message.content}
        </Text>
      </View>
    </Animated.View>
  );
}
