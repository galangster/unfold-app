import React from 'react';
import {
  LayoutChangeEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { ArrowRightIcon, XIcon } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { CompanionOrb } from '@/components/CompanionOrb';
import { alpha } from '@/components/ui';
import { buildBubblePath } from '@/lib/bubble-path';
import { animateCardDismiss } from '@/lib/card-dismiss-animation';
import { useTheme } from '@/lib/theme';
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
  onDismiss?: () => void;
  dismissAccessibilityLabel?: string;
  dismissAccessibilityHint?: string;
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
  onDismiss,
  dismissAccessibilityLabel,
  dismissAccessibilityHint,
}: Props) {
  const { isDark } = useTheme();
  const [bubbleSize, setBubbleSize] = React.useState({ width: 0, height: 0 });
  const bubbleColor = Platform.OS === 'ios'
    ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
    : alpha(colors.backgroundElevated, 0.9);
  const bubbleBorder = alpha(accentColor, 0.25);
  const blurIntensity = isDark ? 28 : 18;
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

  const handleDismiss = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    onDismiss?.();
  }, [onDismiss]);

  const dismissButton = onDismiss ? (
    <TouchableOpacity
      activeOpacity={0.64}
      onPress={handleDismiss}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={dismissAccessibilityLabel ?? 'Dismiss Companion card'}
      accessibilityHint={dismissAccessibilityHint ?? 'Hides this optional Companion card'}
      style={styles.dismissButton}
    >
      <XIcon size={13} color={colors.textSubtle} weight="regular" />
    </TouchableOpacity>
  ) : null;

  const bubbleContent = (
    <View style={[styles.bubble, onDismiss && styles.bubbleWithDismiss]} onLayout={handleBubbleLayout}>
      {Platform.OS === 'ios' ? (
        <View pointerEvents="none" testID="today-companion-glass-blur" style={styles.bubbleGlassClip}>
          <BlurView
            intensity={blurIntensity}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}
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
  );

  const content = (
    <>
      <View style={styles.orbWrap}>{icon ?? <CompanionOrb accentColor={accentColor} size={24} />}</View>

      <View style={styles.bubbleWrap}>
        {onPress ? (
          <TouchableOpacity
            activeOpacity={0.72}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? `${label ? `${label}: ` : ''}${text}`}
            accessibilityHint={accessibilityHint}
          >
            {bubbleContent}
          </TouchableOpacity>
        ) : (
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={accessibilityLabel ?? `Companion says: ${text}`}
          >
            {bubbleContent}
          </View>
        )}
        {dismissButton}
      </View>
    </>
  );

  if (onPress) {
    return (
      <View style={[styles.wrapper, wrapperStyle]}>
        <View style={styles.row}>
          {content}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, wrapperStyle]}>
      <View style={styles.row}>
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['3'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['2.5'],
  },
  dismissButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    top: -4,
    right: -4,
    width: 32,
    zIndex: 4,
  },
  orbWrap: {
    marginTop: Spacing['2'],
  },
  bubbleWrap: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
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
  bubbleGlassClip: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: BUBBLE_RADIUS.topLeft,
    borderTopRightRadius: BUBBLE_RADIUS.topRight,
    borderBottomRightRadius: BUBBLE_RADIUS.bottomRight,
    borderBottomLeftRadius: BUBBLE_RADIUS.bottomLeft,
    overflow: 'hidden',
  },
  bubbleWithDismiss: {
    paddingRight: Spacing['10'],
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
