import React from 'react';
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ArrowRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { CompanionOrb } from '@/components/CompanionOrb';
import { alpha } from '@/components/ui';
import { buildBubblePath } from '@/lib/bubble-path';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  text: string;
  children?: React.ReactNode;
  label?: string;
  actionLabel?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  accentColor?: string;
  wrapperStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const BODY_TEXT_MAX_SCALE = 1.28;
const LABEL_TEXT_MAX_SCALE = 1.14;
const BUBBLE_TAIL_WIDTH = 6;
const BUBBLE_TAIL_HEIGHT = 14;
const BUBBLE_TAIL_CENTER_Y = 18;
const BUBBLE_STROKE_WIDTH = 1;
const BUBBLE_RADIUS = {
  topLeft: Radius.sm,
  topRight: Radius.lg,
  bottomRight: Radius.lg,
  bottomLeft: Radius.lg,
};

export function TodayCompanionBubble({
  colors,
  text,
  children,
  label,
  actionLabel,
  onPress,
  icon,
  accentColor = colors.accent,
  wrapperStyle,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const [bubbleSize, setBubbleSize] = React.useState({ width: 0, height: 0 });
  const bubbleColor = alpha(accentColor, 0.06);
  const bubbleBorder = alpha(accentColor, 0.13);
  const bubblePath = React.useMemo(
    () =>
      bubbleSize.width > 0 && bubbleSize.height > 0
        ? buildBubblePath({
            width: bubbleSize.width,
            height: bubbleSize.height,
            radius: BUBBLE_RADIUS,
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

  const content = (
    <>
      <View style={styles.orbWrap}>{icon ?? <CompanionOrb accentColor={accentColor} size={24} />}</View>

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
                strokeWidth={BUBBLE_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          ) : null}

          {label ? (
            <View style={styles.kickerRow}>
              <View style={[styles.kickerRule, { backgroundColor: accentColor }]} />
              <Text style={[styles.label, { color: accentColor }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                {label}
              </Text>
            </View>
          ) : null}

          {children ?? (
            <Text style={[styles.text, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
              {text}
            </Text>
          )}

          {actionLabel ? (
            <View style={styles.actionLink}>
              <Text style={[styles.actionText, { color: colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                {actionLabel}
              </Text>
              <ArrowRightIcon size={13} color={accentColor} weight="light" />
            </View>
          ) : null}
        </View>
      </View>
    </>
  );

  if (onPress) {
    return (
      <View style={[styles.wrapper, wrapperStyle]}>
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? `${label ? `${label}: ` : ''}${text}`}
          accessibilityHint={accessibilityHint}
          style={styles.row}
        >
          {content}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[styles.wrapper, wrapperStyle]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `Companion says: ${text}`}
    >
      <View style={styles.row}>{content}</View>
    </View>
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
  text: {
    position: 'relative',
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  actionLink: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1.5'],
    alignSelf: 'flex-start',
    marginTop: Spacing['3'],
  },
  actionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
