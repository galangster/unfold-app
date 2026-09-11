import React from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ArrowRightIcon, XIcon } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { CompanionOrb } from '@/components/CompanionOrb';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { alpha } from '@/components/ui/utils/alpha';
import { animateCardDismiss } from '@/lib/card-dismiss-animation';
import { useTheme } from '@/lib/theme';
import type { ColorTheme } from '@/constants/colors';
import { GLASS } from '@/constants/today-surfaces';
import { Typography } from '@/constants/typography';

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

function buildLeftTailPath(width: number, height: number): string {
  const half = height / 2;
  return [
    `M ${width} ${height}`,
    `C ${width - width * 0.42} ${half + half * 0.74} 0 ${half + half * 0.32} 0 ${half}`,
    `C 0 ${half - half * 0.32} ${width - width * 0.42} ${half - half * 0.74} ${width} 0`,
    'Z',
  ].join(' ');
}

const BUBBLE_TAIL_PATH = buildLeftTailPath(BUBBLE_TAIL_WIDTH, BUBBLE_TAIL_HEIGHT);

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
  const mode = isDark ? 'dark' : 'light';
  const tailFill = alpha(
    colors.backgroundElevated,
    Platform.OS === 'ios' ? GLASS.tintAlpha[mode] : GLASS.androidTintAlpha,
  );
  const tailStroke = alpha(colors.text, GLASS.borderAlpha[mode]);

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
    <View style={styles.bubbleHost}>
      <GlassSurface
        radius={Radius.lg}
        blurTestID="today-companion-glass-blur"
        style={[styles.bubble, onDismiss && styles.bubbleWithDismiss]}
      >
        {children ?? (
          <Text style={[styles.text, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
            {text}
          </Text>
        )}

        {label ? (
          <Text style={[styles.label, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
            {label}
          </Text>
        ) : null}

        {actionLabel ? (
          <View style={styles.actionLink}>
            <Text style={[styles.actionText, { color: colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
              {actionLabel}
            </Text>
            <ArrowRightIcon size={13} color={accentColor} weight="light" />
          </View>
        ) : null}
      </GlassSurface>
      <Svg
        width={BUBBLE_TAIL_WIDTH}
        height={BUBBLE_TAIL_HEIGHT}
        viewBox={`0 0 ${BUBBLE_TAIL_WIDTH} ${BUBBLE_TAIL_HEIGHT}`}
        style={styles.tail}
        pointerEvents="none"
        testID="today-companion-tail"
      >
        <Path
          d={BUBBLE_TAIL_PATH}
          fill={tailFill}
          stroke={tailStroke}
          strokeWidth={StyleSheet.hairlineWidth}
        />
      </Svg>
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
  bubbleHost: {
    position: 'relative',
  },
  tail: {
    position: 'absolute',
    left: -BUBBLE_TAIL_WIDTH,
    top: BUBBLE_TAIL_CENTER_Y - BUBBLE_TAIL_HEIGHT / 2,
  },
  bubble: {
    position: 'relative',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3.5'],
  },
  bubbleWithDismiss: {
    paddingRight: Spacing['10'],
  },
  label: {
    ...Typography.cardMeta,
    marginTop: Spacing['2'],
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
