/**
 * PremiumNudgeCard — Inline contextual premium nudge card
 *
 * A subtle, dismissable card that surfaces premium feature value at
 * the right moment. Feels like a helpful tip, not an advertisement.
 *
 * Usage:
 *   <PremiumNudgeCard
 *     type="streak_freeze"
 *     message="Your streak ended. Premium members get streak freezes."
 *     cta="Learn more"
 *     premiumFeature="streak"
 *     onAction={() => {}}
 *     onDismiss={() => {}}
 *   />
 */

import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  XIcon,
  FireIcon,
  SpeakerHighIcon,
  BookOpenTextIcon,
  SparkleIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import type { NudgeType } from '@/lib/nudges';

// ---------------------------------------------------------------------------
// Icon mapping per nudge type
// ---------------------------------------------------------------------------

function getNudgeIcon(type: NudgeType): React.ComponentType<{ size: number; color: string; weight: 'light' }> {
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
  /** Variant: 'card' for home screen, 'banner' for reading screen */
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
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  const IconComponent = getNudgeIcon(type);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissed(true);
    onDismiss();
  }, [onDismiss]);

  const handleAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAction();
    setShowSheet(true);
  }, [onAction]);

  const handleSheetClose = useCallback(() => {
    setShowSheet(false);
    setDismissed(true);
  }, []);

  if (dismissed) return null;

  const isBanner = variant === 'banner';

  return (
    <>
      <Animated.View
        entering={FadeInDown.duration(500).delay(300)}
        exiting={FadeOut.duration(300)}
        accessibilityRole="alert"
        accessibilityLabel={`Premium feature suggestion: ${message}`}
      >
        <View
          style={[
            styles.container,
            {
              backgroundColor: `${colors.accent}0A`,
              borderColor: `${colors.accent}18`,
              ...(isBanner
                ? {
                    borderRadius: 0,
                    borderLeftWidth: 0,
                    borderRightWidth: 0,
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    marginHorizontal: 0,
                  }
                : {
                    borderRadius: Radius.card,
                    borderWidth: 1,
                  }),
            },
          ]}
        >
          {/* Icon + Message row */}
          <View style={styles.contentRow}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: `${colors.accent}14` },
              ]}
            >
              <IconComponent size={18} color={colors.accent} weight="light" />
            </View>

            <View style={styles.textContainer}>
              <Text
                style={[
                  styles.message,
                  { color: colors.textMuted, fontFamily: FontFamily.body },
                ]}
                numberOfLines={2}
              >
                {message}
              </Text>

              {/* CTA link */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleAction}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={cta}
                accessibilityHint="Opens premium feature details"
                style={styles.ctaPressable}
              >
                  <Text
                    style={[
                      styles.ctaText,
                      {
                        color: colors.accent,
                        fontFamily: FontFamily.uiSemiBold,
                      },
                    ]}
                  >
                    {cta}
                  </Text>
              </TouchableOpacity>
            </View>

            {/* Dismiss button */}
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleDismiss}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss suggestion"
              style={styles.dismissButton}
            >
                <XIcon
                  size={16}
                  color={colors.textSubtle}
                  weight="light"
                />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Premium Feature Sheet — opens on CTA tap */}
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
    paddingVertical: 14,
    paddingHorizontal: Spacing['4'],
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['3'],
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  textContainer: {
    flex: 1,
    gap: 6,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
  },
  ctaPressable: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  ctaText: {
    fontSize: 13,
  },
  dismissButton: {
    padding: 4,
    marginTop: 1,
  },
});
