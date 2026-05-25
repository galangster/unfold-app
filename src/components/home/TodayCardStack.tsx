import React from 'react';
import { LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ArrowRightIcon, XIcon } from 'phosphor-react-native';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { useElevation } from '@/constants/elevation';
import { Spacing } from '@/constants/spacing';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useTheme } from '@/lib/theme';
import { buildTodayCardStackModel, type TodayStackCardItem } from '@/lib/today-card-stack';
import {
  getTodayStackSwipeDismissal,
  TODAY_STACK_EXIT_DISTANCE_MULTIPLIER,
  TODAY_STACK_MAX_ROTATION_DEG,
} from '@/lib/today-card-stack-motion';
import type { ColorTheme } from '@/constants/colors';

export interface TodayCardStackAction {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  tone?: 'primary' | 'secondary';
}

export interface TodayCardStackCard extends TodayStackCardItem {
  eyebrow?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  actions?: TodayCardStackAction[];
  onPress?: () => void;
  onDismiss?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  dismissAccessibilityLabel?: string;
  dismissAccessibilityHint?: string;
  testID?: string;
}

interface TodayCardStackProps {
  cards: readonly TodayCardStackCard[];
  colors?: ColorTheme;
  maxBackCards?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Test/preview override; production should rely on useAccessibleAnimation. */
  reducedMotionOverride?: boolean;
}

const ENTER_DURATION = Duration.normal;
const EXIT_DURATION = Duration.fast;
const SWIPE_EXIT_DURATION = 200;
const SWIPE_SETTLE_DURATION = 220;
const BODY_TEXT_MAX_SCALE = 1.26;
const LABEL_TEXT_MAX_SCALE = 1.14;

function StackDismissButton({ card, colors }: { card: TodayCardStackCard; colors: ColorTheme }) {
  if (!card.onDismiss) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.72}
      onPress={card.onDismiss}
      accessibilityRole="button"
      accessibilityLabel={card.dismissAccessibilityLabel ?? `Dismiss ${card.title}`}
      accessibilityHint={card.dismissAccessibilityHint ?? 'Hides this optional Today card without deleting its content'}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={styles.dismissButton}
    >
      <XIcon size={15} color={colors.textSubtle} weight="regular" />
    </TouchableOpacity>
  );
}

function TopCardBody({ card, colors }: { card: TodayCardStackCard; colors: ColorTheme }) {
  const body = (
    <View style={[styles.content, card.onDismiss && styles.contentDismissible]}>
      {card.eyebrow ? (
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowRule, { backgroundColor: colors.accent }]} />
          <Text style={[styles.eyebrow, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
            {card.eyebrow}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.title, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE} numberOfLines={2}>
        {card.title}
      </Text>

      {card.body ? (
        <Text style={[styles.body, { color: colors.textMuted }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE} numberOfLines={3}>
          {card.body}
        </Text>
      ) : null}

      {card.actionLabel ? (
        <View style={[styles.actionPill, { borderColor: alpha(colors.accent, 0.22), backgroundColor: alpha(colors.accent, 0.08) }]}>
          <Text style={[styles.actionText, { color: colors.text }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
            {card.actionLabel}
          </Text>
          <ArrowRightIcon size={13} color={colors.accent} weight="light" />
        </View>
      ) : null}

      {card.actions?.length ? (
        <View style={styles.actionList}>
          {card.actions.map((action, index) => {
            const isPrimary = (action.tone ?? (index === 0 ? 'primary' : 'secondary')) === 'primary';
            return (
              <TouchableOpacity
                key={`${action.label}-${index}`}
                activeOpacity={0.74}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                accessibilityHint={action.accessibilityHint}
                style={[
                  styles.actionButton,
                  isPrimary ? styles.actionButtonPrimary : styles.actionButtonSecondary,
                  {
                    backgroundColor: isPrimary ? alpha(colors.accent, 0.1) : alpha(colors.text, 0.04),
                    borderColor: isPrimary ? alpha(colors.accent, 0.28) : alpha(colors.text, 0.08),
                  },
                ]}
              >
                <Text style={[styles.actionButtonText, { color: isPrimary ? colors.text : colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>
                  {action.label}
                </Text>
                {isPrimary ? <ArrowRightIcon size={13} color={colors.accent} weight="light" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  if (!card.onPress) {
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={card.accessibilityLabel} accessibilityHint={card.accessibilityHint}>
        {body}
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.74}
      onPress={card.onPress}
      accessibilityRole="button"
      accessibilityLabel={card.accessibilityLabel}
      accessibilityHint={card.accessibilityHint}
      style={styles.pressableBody}
    >
      {body}
    </TouchableOpacity>
  );
}

function commitSwipeDismiss(card: TodayCardStackCard, dismissInFlight: React.MutableRefObject<boolean>) {
  if (!card.onDismiss || dismissInFlight.current) return;

  dismissInFlight.current = true;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  card.onDismiss();
}

function BackCardSilhouette({
  index,
  totalCount,
  colors,
  isDark,
  reducedMotion,
  swipeX,
  cardWidth,
}: {
  index: number;
  totalCount: number;
  colors: ColorTheme;
  isDark: boolean;
  reducedMotion: boolean;
  swipeX: SharedValue<number>;
  cardWidth: SharedValue<number>;
}) {
  const depth = index + 1;
  const translateY = reducedMotion ? 0 : depth * 10;
  const scale = reducedMotion ? 1 : 1 - depth * 0.035;
  const opacity = Math.max(0.42, 0.72 - depth * 0.16);
  const fillOpacity = Math.max(isDark ? 0.1 : 0.065, (isDark ? 0.18 : 0.12) - index * 0.035);
  const promotedStyle = useAnimatedStyle(() => {
    const width = Math.max(1, cardWidth.value);
    const progress = depth === 1
      ? interpolate(Math.abs(swipeX.value), [0, width * 0.28], [0, 1], Extrapolation.CLAMP)
      : 0;

    return {
      opacity: opacity + (0.9 - opacity) * progress,
      transform: [
        { translateY: translateY - translateY * progress },
        { scale: scale + (1 - scale) * progress },
      ],
    };
  });
  const cardStyle = reducedMotion
    ? { opacity, transform: [{ translateY }, { scale }] }
    : promotedStyle;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`today-card-stack-back-card-${depth}`}
      style={[
        styles.backCard,
        {
          backgroundColor: alpha(colors.accent, fillOpacity),
          borderColor: 'transparent',
          zIndex: totalCount - depth,
        },
        cardStyle,
      ]}
    />
  );
}

export function TodayCardStack({
  cards,
  colors: colorsOverride,
  maxBackCards,
  style,
  testID = 'today-card-stack',
  reducedMotionOverride,
}: TodayCardStackProps) {
  const { colors: themeColors, isDark } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const elevation = useElevation();
  const { entering, exiting, reducedMotion: systemReducedMotion } = useAccessibleAnimation();
  const reducedMotion = reducedMotionOverride ?? systemReducedMotion;
  const model = buildTodayCardStackModel(cards, maxBackCards);
  const topCard = model.topCard;
  const swipeX = useSharedValue(0);
  const cardWidth = useSharedValue(320);
  const dismissInFlight = React.useRef(false);

  React.useEffect(() => {
    dismissInFlight.current = false;
    swipeX.value = 0;
  }, [swipeX, topCard?.id]);

  const commitDismiss = React.useCallback(() => {
    if (!topCard) return;
    commitSwipeDismiss(topCard, dismissInFlight);
  }, [topCard]);

  const topCardAnimatedStyle = useAnimatedStyle(() => {
    const width = Math.max(1, cardWidth.value);
    const absX = Math.abs(swipeX.value);
    const rotation = interpolate(
      swipeX.value,
      [-width, 0, width],
      [-TODAY_STACK_MAX_ROTATION_DEG, 0, TODAY_STACK_MAX_ROTATION_DEG],
      Extrapolation.CLAMP,
    );

    return {
      opacity: interpolate(absX, [0, width * 0.28, width * 0.72], [1, 0.96, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: swipeX.value },
        { rotateZ: `${rotation}deg` },
      ],
    };
  });

  const handleTopCardLayout = React.useCallback((event: LayoutChangeEvent) => {
    cardWidth.value = Math.max(1, event.nativeEvent.layout.width);
  }, [cardWidth]);

  const swipeGesture = React.useMemo(
    () => Gesture.Pan()
      .enabled(!reducedMotion && Boolean(topCard?.onDismiss))
      .activeOffsetX([-14, 14])
      .failOffsetY([-12, 12])
      .onBegin(() => {
        swipeX.value = 0;
      })
      .onUpdate((event) => {
        swipeX.value = event.translationX;
      })
      .onEnd((event) => {
        const decision = getTodayStackSwipeDismissal(
          event.translationX,
          event.translationY,
          event.velocityX,
          cardWidth.value,
          reducedMotion,
        );

        if (decision.shouldDismiss) {
          const exitX = decision.direction * cardWidth.value * TODAY_STACK_EXIT_DISTANCE_MULTIPLIER;
          swipeX.value = withTiming(exitX, { duration: SWIPE_EXIT_DURATION, easing: Ease.out }, (finished) => {
            if (finished) {
              runOnJS(commitDismiss)();
            }
          });
          return;
        }

        swipeX.value = withTiming(0, { duration: SWIPE_SETTLE_DURATION, easing: Ease.out });
      })
      .onFinalize((_event, success) => {
        if (!success) {
          swipeX.value = withTiming(0, { duration: SWIPE_SETTLE_DURATION, easing: Ease.out });
        }
      }),
    [cardWidth, commitDismiss, reducedMotion, swipeX, topCard?.onDismiss],
  );

  if (!topCard) return null;

  const enteringAnimation = reducedMotion ? undefined : entering(FadeIn.duration(ENTER_DURATION).easing(Ease.out));
  const exitingAnimation = reducedMotion ? undefined : exiting(FadeOut.duration(EXIT_DURATION).easing(Ease.out));
  const topCardContent = (
    <Animated.View
      onLayout={handleTopCardLayout}
      testID={topCard.testID ?? 'today-card-stack-top-card'}
      style={[
        styles.topCardOuter,
        elevation.raised.shadow,
        { zIndex: model.totalCount + 1 },
        reducedMotion ? null : topCardAnimatedStyle,
      ]}
    >
      <View
        style={[
          styles.topCardInner,
          {
            backgroundColor: Platform.OS === 'ios'
              ? alpha(colors.backgroundElevated, isDark ? 0.72 : 0.88)
              : alpha(colors.backgroundElevated, 0.95),
          },
          elevation.raised.outline,
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView
            pointerEvents="none"
            intensity={isDark ? 44 : 28}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, styles.cardBlur]}
            testID="today-card-stack-glass-blur"
          />
        ) : null}

        <View pointerEvents="none" style={elevation.raised.highlight} />

        <TopCardBody card={topCard} colors={colors} />
        <StackDismissButton card={topCard} colors={colors} />
      </View>
    </Animated.View>
  );

  return (
    <Animated.View
      entering={enteringAnimation}
      exiting={exitingAnimation}
      style={[styles.outer, style]}
      testID={testID}
      accessibilityLabel="Today card stack"
    >
      <View style={styles.stackStage} testID="today-card-stack-stage">
        {model.backCards.map((card, index) => (
          <BackCardSilhouette
            key={card.id}
            index={index}
            totalCount={model.totalCount}
            colors={colors}
            isDark={isDark}
            reducedMotion={reducedMotion}
            swipeX={swipeX}
            cardWidth={cardWidth}
          />
        ))}

        {reducedMotion || !topCard.onDismiss ? topCardContent : (
          <GestureDetector gesture={swipeGesture}>{topCardContent}</GestureDetector>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: Spacing['6'],
  },
  stackStage: {
    minHeight: 176,
    paddingBottom: Spacing['5'],
    position: 'relative',
  },
  topCardOuter: {
    borderRadius: Radius.xl,
    minHeight: 150,
    position: 'relative',
  },
  topCardInner: {
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    minHeight: 150,
    overflow: 'hidden',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    position: 'relative',
  },
  cardBlur: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  backCard: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.xl,
    borderWidth: 1,
    minHeight: 150,
    top: Spacing['3'],
  },
  pressableBody: {
    borderRadius: Radius.lg,
  },
  content: {
    gap: Spacing['2.5'],
    paddingTop: Spacing['2'],
  },
  contentDismissible: {
    paddingRight: Spacing['10'],
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  eyebrowRule: {
    height: 1,
    opacity: 0.9,
    width: 18,
  },
  eyebrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: FontSize.xl,
    lineHeight: 27,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  actionPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing['1.5'],
    marginTop: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  actionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  actionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
    marginTop: Spacing['1'],
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing['1.5'],
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  actionButtonPrimary: {
    flexBasis: '100%',
  },
  actionButtonSecondary: {
    flexGrow: 1,
  },
  actionButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  dismissButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: Spacing['2'],
    top: Spacing['2'],
    width: 32,
    zIndex: 4,
  },
});
