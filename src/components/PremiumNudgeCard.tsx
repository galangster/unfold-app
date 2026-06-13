/**
 * PremiumNudgeCard — Inline contextual premium invitation
 *
 * A quiet, dismissable card that surfaces premium value at the right
 * devotional moment. The card is not pressable as a whole; the CTA and
 * dismiss control are separate actions for clearer touch and accessibility.
 */

import { useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  FireIcon,
  SpeakerHighIcon,
  SparkleIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { Typography } from '@/constants/typography';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { DismissCircleButton } from '@/components/home/DismissCircleButton';
import { alpha } from '@/components/ui/utils/alpha';
import { animateCardDismiss } from '@/lib/card-dismiss-animation';
import type { NudgeType } from '@/lib/nudges';

type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

const DISPLAY_TEXT_MAX_SCALE = 1.18;
const BODY_TEXT_MAX_SCALE = 1.28;
const LABEL_TEXT_MAX_SCALE = 1.14;

// ---------------------------------------------------------------------------
// Tone mapping per nudge type
// ---------------------------------------------------------------------------

function getNudgeIcon(type: NudgeType): ComponentType<{ size: number; color: string; weight: IconWeight }> {
  switch (type) {
    case 'streak_freeze':
      return FireIcon;
    case 'audio_teaser':
      return SpeakerHighIcon;
    case 'journey_completion':
      return BookOpenTextIcon;
    default:
      return SparkleIcon;
  }
}

export function getPremiumNudgeCardTone(type: NudgeType): { kicker: string; title: string; footnote: string } {
  switch (type) {
    case 'streak_freeze':
      return {
        kicker: 'Rhythm support',
        title: 'Grace for missed days',
        footnote: 'No pressure — just a softer return.',
      };
    case 'audio_teaser':
      return {
        kicker: 'Quiet option',
        title: 'Let today be read aloud',
        footnote: 'For walks, chores, or tired eyes.',
      };
    case 'journey_completion':
      return {
        kicker: 'Premium series',
        title: 'Open another personal series',
        footnote: 'No pressure — your free rhythm stays intact.',
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PremiumNudgeCardProps {
  type: NudgeType;
  message: string;
  cta: string;
  premiumFeature: string;
  onAction: () => void;
  onDismiss: () => void;
  /** Variant: 'card' for Today/home screen, 'banner' for denser reading placements */
  variant?: 'card' | 'banner';
}

export function PremiumNudgeCard({
  type,
  message,
  cta,
  premiumFeature,
  onAction,
  onDismiss,
  variant = 'card',
}: PremiumNudgeCardProps) {
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  const IconComponent = getNudgeIcon(type);
  const tone = getPremiumNudgeCardTone(type);
  const isBanner = variant === 'banner';
  const useCompactLayout = !isBanner && (width < 400 || fontScale >= 1.18);
  const glassBackground = isBanner
    ? alpha(colors.backgroundElevated, 0.5)
    : Platform.OS === 'ios'
      ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
      : alpha(colors.backgroundElevated, 0.9);
  const glassBorder = alpha(colors.accent, isBanner ? 0.1 : 0.25);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    setDismissed(true);
    onDismiss();
  }, [onDismiss]);

  const handleAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSheet(true);
  }, []);

  const handleSheetClose = useCallback(() => {
    setShowSheet(false);
    animateCardDismiss();
    setDismissed(true);
    onAction();
  }, [onAction]);

  if (dismissed) return null;

  return (
    <>
      <Animated.View
        entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).delay(300).easing(Ease.out)}
        exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
        style={[
          styles.container,
          isBanner && styles.bannerContainer,
          useCompactLayout && styles.containerCompact,
          {
            backgroundColor: glassBackground,
            borderColor: glassBorder,
            shadowColor: colors.accent,
          },
        ]}
      >
        {!isBanner && Platform.OS === 'ios' ? (
          <BlurView
            intensity={isDark ? 28 : 18}
            tint={isDark ? 'dark' : 'light'}
            testID="premium-nudge-glass-blur"
            style={[StyleSheet.absoluteFill, styles.glassBlur]}
          />
        ) : null}
        <View style={styles.headerRow}>
          <View style={[styles.iconContainer, { backgroundColor: alpha(colors.accent, 0.11), borderColor: alpha(colors.accent, 0.18) }]}>
            <IconComponent size={18} color={colors.accent} weight="light" />
          </View>

          <View style={styles.headingGroup}>
            <Text style={[styles.kicker, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{tone.kicker}</Text>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={useCompactLayout ? 3 : 2} maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}>
              {tone.title}
            </Text>
          </View>
        </View>

        <DismissCircleButton
          colors={colors}
          onPress={handleDismiss}
          accessibilityLabel="Dismiss premium invitation"
          accessibilityHint="Hides this premium suggestion"
          style={styles.dismissButton}
        />

        <Text style={[styles.message, useCompactLayout && styles.messageCompact, { color: colors.textMuted }]} numberOfLines={useCompactLayout ? 4 : 3} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
          {message}
        </Text>

        <View style={[styles.footerRow, useCompactLayout && styles.footerRowCompact]}>
          <Text style={[styles.footnote, useCompactLayout && styles.footnoteCompact, { color: colors.textSubtle }]} numberOfLines={useCompactLayout ? 3 : 2} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
            {tone.footnote}
          </Text>

          <TouchableOpacity
            activeOpacity={0.76}
            onPress={handleAction}
            accessibilityRole="button"
            accessibilityLabel={`${cta}. Opens Premium details`}
            accessibilityHint="Shows details about this Premium feature"
            style={[
              styles.ctaButton,
              useCompactLayout && styles.ctaButtonCompact,
              {
                backgroundColor: alpha(colors.accent, 0.12),
                borderColor: alpha(colors.accent, 0.28),
              },
            ]}
          >
            <Text style={[styles.ctaText, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{cta}</Text>
            <ArrowRightIcon size={13} color={colors.accent} weight="bold" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <PremiumFeatureSheet
        visible={showSheet}
        onClose={handleSheetClose}
        feature={premiumFeature as any}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['5'],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 4,
  },
  glassBlur: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bannerContainer: {
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['4'],
    shadowOpacity: 0,
    elevation: 0,
  },
  containerCompact: {
    padding: Spacing['4'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['3'],
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  headingGroup: {
    flex: 1,
    paddingRight: Spacing['7'],
  },
  kicker: {
    ...Typography.cardMeta,
    marginBottom: 3,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.25,
  },
  dismissButton: {
    position: 'absolute',
    top: -9,
    right: -9,
    zIndex: 4,
  },
  message: {
    width: '100%',
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: Spacing['4'],
  },
  messageCompact: {
    width: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing['3'],
    marginTop: Spacing['5'],
  },
  footerRowCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: Spacing['2.5'],
  },
  footnote: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 17,
  },
  footnoteCompact: {
    flex: 0,
    width: '100%',
  },
  ctaButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['1.5'],
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2.5'],
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  ctaButtonCompact: {
    alignSelf: 'flex-start',
  },
  ctaText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.15,
  },
});
