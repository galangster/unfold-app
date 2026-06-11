import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { ArrowRightIcon, BookOpenTextIcon, FeatherIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useTheme } from '@/lib/theme';
import { NotificationCard } from '@/components/home/NotificationCard';
import { BridgeShimmer } from '@/components/home/BridgeShimmer';
import { DailyBridgeCard } from '@/components/home/DailyBridgeCard';
import { DismissCircleButton } from '@/components/home/DismissCircleButton';
import { animateCardDismiss } from '@/lib/card-dismiss-animation';
import type { ContextSlotType } from '@/lib/context-slot-priority';
import type { ColorTheme } from '@/constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResumeProps {
  onPress: () => void;
  /** e.g. "Resume where you left off" */
  label: string;
  /** e.g. "Series Title · Day N: Day Title" */
  title: string;
  /** e.g. "Saved 5m ago" */
  timeAgo: string;
}

interface Props {
  slotType: ContextSlotType;
  colors: ColorTheme;
  onMiddayPress?: () => void;
  middayMessage?: string;
  onEveningPress?: () => void;
  eveningMessage?: string;
  bridgeText?: string;
  resumeProps?: ResumeProps;
  onDismissResume?: () => void;
  onDismissMidday?: () => void;
  onDismissEvening?: () => void;
  onDismissBridge?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTER_DURATION = Duration.normal;
const EXIT_DURATION = Duration.fast;
const BODY_TEXT_MAX_SCALE = 1.26;
const LABEL_TEXT_MAX_SCALE = 1.14;

// ---------------------------------------------------------------------------
// Resume Card (inline, not via NotificationCard)
// ---------------------------------------------------------------------------

function ResumeCard({
  colors,
  resumeProps,
  onDismiss,
}: {
  colors: ColorTheme;
  resumeProps: ResumeProps;
  onDismiss?: () => void;
}) {
  const isJournalResume = resumeProps.label.toLowerCase().includes('reflection') || resumeProps.label.toLowerCase().includes('add to day');
  const actionLabel = isJournalResume ? 'Open reflection' : 'Continue reading';
  const { isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const useCompactFooter = width < 400 || fontScale >= 1.18;

  const handleDismiss = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    onDismiss?.();
  }, [onDismiss]);

  return (
    <View style={styles.cardPadding}>
      <View
        style={[
          styles.resumeContainer,
          {
            backgroundColor: Platform.OS === 'ios'
              ? alpha(colors.backgroundElevated, isDark ? 0.8 : 0.9)
              : alpha(colors.backgroundElevated, 0.94),
            borderColor: alpha(colors.accent, isDark ? 0.3 : 0.24),
            shadowColor: colors.accent,
          },
        ]}
      >
        {Platform.OS === 'ios' && (
          <BlurView
            intensity={isDark ? 78 : 60}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, styles.resumeBlur]}
          />
        )}
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={resumeProps.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${resumeProps.label}. ${resumeProps.title}. ${resumeProps.timeAgo}.`}
          accessibilityHint={isJournalResume ? 'Opens the saved journal reflection' : 'Returns to the saved devotional reading'}
        >
          <View style={[styles.resumeContent, onDismiss && styles.resumeContentDismissible]}>
            <View style={styles.resumeTitleRow}>
              <View style={[styles.resumeIcon, { borderColor: alpha(colors.accent, 0.16), backgroundColor: alpha(colors.accent, 0.075) }]}>
                {isJournalResume ? (
                  <FeatherIcon size={17} color={colors.accent} weight="light" />
                ) : (
                  <BookOpenTextIcon size={17} color={colors.accent} weight="light" />
                )}
              </View>
              <View style={styles.resumeTextColumn}>
                <Text numberOfLines={2} style={[styles.resumeTitle, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>
                  {resumeProps.title}
                </Text>
                <Text style={[styles.resumeTimeAgo, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{resumeProps.label} · {resumeProps.timeAgo}</Text>
              </View>
            </View>

            <View style={[styles.resumeFooterRow, useCompactFooter && styles.resumeFooterRowCompact]}>
              <Text style={[styles.resumeHelper, useCompactFooter && styles.resumeHelperCompact, { color: colors.textSubtle }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Your place is saved quietly.</Text>
              <View style={[styles.resumeCta, useCompactFooter && styles.resumeCtaCompact, { borderColor: alpha(colors.accent, 0.22), backgroundColor: alpha(colors.accent, 0.08) }]}>
                <Text style={[styles.resumeCtaText, { color: colors.text }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{actionLabel}</Text>
                <ArrowRightIcon size={13} color={colors.accent} weight="light" />
              </View>
            </View>
          </View>
        </TouchableOpacity>
        {onDismiss ? (
          <DismissCircleButton
            colors={colors}
            onPress={handleDismiss}
            accessibilityLabel="Dismiss resume card"
            accessibilityHint="Clears this saved resume prompt"
            style={styles.resumeDismissButton}
          />
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ContextSlot
// ---------------------------------------------------------------------------

export function ContextSlot({
  slotType,
  colors,
  onMiddayPress,
  middayMessage,
  onEveningPress,
  eveningMessage,
  bridgeText,
  resumeProps,
  onDismissResume,
  onDismissMidday,
  onDismissEvening,
  onDismissBridge,
}: Props) {
  const { entering, exiting } = useAccessibleAnimation();

  const isVisible = slotType !== 'none';

  // Render the active card based on slot type
  function renderCard() {
    switch (slotType) {
      case 'resume':
        if (!resumeProps) return null;
        return <ResumeCard colors={colors} resumeProps={resumeProps} onDismiss={onDismissResume} />;

      case 'evening':
        if (!onEveningPress || !eveningMessage) return null;
        return (
          <NotificationCard
            colors={colors}
            onPress={onEveningPress}
            message={eveningMessage}
            icon={null}
            accentColor={colors.accent}
            delay={0}
            label="Evening check-in"
            actionLabel="Wind down"
            onDismiss={onDismissEvening}
          />
        );

      case 'midday':
        if (!onMiddayPress || !middayMessage) return null;
        return (
          <NotificationCard
            colors={colors}
            onPress={onMiddayPress}
            message={middayMessage}
            icon={null}
            accentColor={colors.accent}
            delay={0}
            label="Companion check-in"
            actionLabel="Reflect"
            onDismiss={onDismissMidday}
          />
        );

      case 'bridge':
        if (!bridgeText) return null;
        return <DailyBridgeCard text={bridgeText} colors={colors} onDismiss={onDismissBridge} />;

      case 'bridge-loading':
        return <BridgeShimmer colors={colors} />;

      case 'none':
      default:
        return null;
    }
  }

  if (!isVisible) return null;

  return (
    <Animated.View
      key={slotType}
      entering={entering(FadeIn.duration(ENTER_DURATION).easing(Ease.out))}
      exiting={exiting(FadeOut.duration(EXIT_DURATION).easing(Ease.out))}
    >
      {renderCard()}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  cardPadding: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['3'],
  },
  resumeContainer: {
    position: 'relative',
    overflow: 'visible',
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    ...Shadow.md,
  },
  resumeBlur: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  resumeContent: {
    gap: Spacing['3'],
  },
  resumeContentDismissible: {
    paddingRight: Spacing['10'],
  },
  resumeDismissButton: {
    position: 'absolute',
    top: -9,
    right: -9,
    zIndex: 4,
  },
  resumeTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['3'],
  },
  resumeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  resumeTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  resumeTitle: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 22,
  },
  resumeTimeAgo: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    lineHeight: 17,
    marginTop: Spacing['1'],
  },
  resumeFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing['3'],
  },
  resumeFooterRowCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: Spacing['2.5'],
  },
  resumeHelper: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 12,
    lineHeight: 17,
  },
  resumeHelperCompact: {
    flex: 0,
    width: '100%',
  },
  resumeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1.5'],
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
  },
  resumeCtaCompact: {
    alignSelf: 'flex-start',
  },
  resumeCtaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
