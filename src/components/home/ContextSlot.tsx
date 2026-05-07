import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
import { NotificationCard } from '@/components/home/NotificationCard';
import { BridgeShimmer } from '@/components/home/BridgeShimmer';
import { DailyBridgeCard } from '@/components/home/DailyBridgeCard';
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
}: {
  colors: ColorTheme;
  resumeProps: ResumeProps;
}) {
  const isJournalResume = resumeProps.label.toLowerCase().includes('reflection') || resumeProps.label.toLowerCase().includes('add to day');
  const actionLabel = isJournalResume ? 'Open reflection' : 'Continue reading';
  const { width, fontScale } = useWindowDimensions();
  const useCompactFooter = width < 400 || fontScale >= 1.18;

  return (
    <View style={styles.cardPadding}>
      <TouchableOpacity
        activeOpacity={0.72}
        onPress={resumeProps.onPress}
        accessibilityRole="button"
        accessibilityLabel={`${resumeProps.label}. ${resumeProps.title}. ${resumeProps.timeAgo}.`}
        accessibilityHint={isJournalResume ? 'Opens the saved journal reflection' : 'Returns to the saved devotional reading'}
        style={[
          styles.resumeContainer,
          {
            backgroundColor: alpha(colors.backgroundElevated, 0.66),
            borderColor: alpha(colors.accent, 0.14),
            shadowColor: colors.accent,
          },
        ]}
      >
        <View style={styles.resumeContent}>
          <View style={styles.resumeKickerRow}>
            <View style={[styles.resumeKickerRule, { backgroundColor: colors.accent }]} />
            <Text style={[styles.resumeLabel, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{resumeProps.label}</Text>
          </View>

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
              <Text style={[styles.resumeTimeAgo, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>{resumeProps.timeAgo}</Text>
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
}: Props) {
  const { entering, exiting } = useAccessibleAnimation();

  const isVisible = slotType !== 'none';

  // Render the active card based on slot type
  function renderCard() {
    switch (slotType) {
      case 'resume':
        if (!resumeProps) return null;
        return <ResumeCard colors={colors} resumeProps={resumeProps} />;

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
            label="Evening companion"
            actionLabel="Wind down"
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
          />
        );

      case 'bridge':
        if (!bridgeText) return null;
        return <DailyBridgeCard text={bridgeText} colors={colors} />;

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
    overflow: 'hidden',
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    ...Shadow.md,
  },
  resumeContent: {
    gap: Spacing['3'],
  },
  resumeKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  resumeKickerRule: {
    width: 18,
    height: 1,
    opacity: 0.9,
  },
  resumeLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
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
