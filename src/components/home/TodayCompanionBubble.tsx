import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { ArrowRightIcon, XIcon } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { CompanionOrb } from '@/components/CompanionOrb';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { animateCardDismiss } from '@/lib/card-dismiss-animation';
import type { ColorTheme } from '@/constants/colors';
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
