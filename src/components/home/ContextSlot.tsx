import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { CaretRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
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

/** @deprecated — collapse animation removed, content auto-sizes now */
const ENTER_DURATION = Duration.normal;
const EXIT_DURATION = Duration.fast;

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
  return (
    <View style={styles.cardPadding}>
      <TouchableOpacity activeOpacity={0.7} onPress={resumeProps.onPress}>
        <View
          style={[
            styles.resumeContainer,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
              ...Shadow.sm,
            },
          ]}
        >
          {/* Label */}
          <Text
            style={[
              styles.resumeLabel,
              { color: colors.accent },
            ]}
          >
            {resumeProps.label}
          </Text>

          {/* Title row */}
          <View style={styles.resumeTitleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.resumeTitle,
                { color: colors.text },
              ]}
            >
              {resumeProps.title}
            </Text>
            <CaretRightIcon
              size={14}
              color={colors.textSubtle}
              weight="light"
              style={styles.resumeChevron}
            />
          </View>

          {/* Time ago */}
          <Text
            style={[
              styles.resumeTimeAgo,
              { color: colors.textSubtle },
            ]}
          >
            {resumeProps.timeAgo}
          </Text>
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
    borderRadius: Radius.card,
    borderWidth: 1,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['4'],
  },
  resumeLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    marginBottom: 2,
  },
  resumeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resumeTitle: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 20,
  },
  resumeChevron: {
    marginLeft: Spacing['2'],
  },
  resumeTimeAgo: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
