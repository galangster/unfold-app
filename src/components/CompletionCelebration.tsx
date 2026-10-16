import { useEffect, useMemo, useRef } from 'react';
import { AppState, View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { EmberSystem } from '@/components/EmberSystem';
import { formatSeriesCompletionSummary } from '@/lib/series-completion-summary';
import { Button } from '@/components/ui/Button';
import { completionCopy } from '@/constants/daily-copy';
import { copyVariationFor } from '@/lib/copy-variation';

// ─── Main component ─────────────────────────────────────────────────────────
interface CompletionCelebrationProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'day' | 'series';
  message?: string;
  detail?: string;
  /**
   * Readings finished earlier on this local day. The drawn title and line
   * move on one entry for each, so a second completion today reads differently.
   */
  step?: number;
  seriesReflectionSummary?: string;
  nextStep?: {
    title: string;
    detail: string;
    primaryLabel: string;
    onPrimary: () => void;
    secondaryLabel: string;
    onSecondary: () => void;
  };
}

export function CompletionCelebration({
  visible,
  onDismiss,
  type,
  message,
  detail,
  step = 0,
  seriesReflectionSummary,
  nextStep,
}: CompletionCelebrationProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { reducedMotion } = useAccessibleAnimation();
  const handledAction = useRef(false);
  useEffect(() => { handledAction.current = false; }, [visible]);
  const runAction = (action: () => void) => {
    if (handledAction.current) return;
    handledAction.current = true;
    action();
  };

  // Drawn for the local day each time the overlay opens, so it does not
  // repeat yesterday's title or line, and moved on by `step` within a day.
  const copy = useMemo(
    () => (visible ? completionCopy(type, copyVariationFor(new Date()), step) : null),
    [visible, type, step],
  );

  // Overlay + content animation values
  const overlayOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(18);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(14);
  const hintOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible || AppState.currentState !== 'active') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    const secondTap = setTimeout(() => {
      if (AppState.currentState === 'active') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }, 100);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') clearTimeout(secondTap);
    });
    return () => {
      clearTimeout(secondTap);
      subscription.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        overlayOpacity.value = 1;
        titleOpacity.value = 1;
        titleTranslateY.value = 0;
        subtitleOpacity.value = 1;
        subtitleTranslateY.value = 0;
        hintOpacity.value = 1;
        return;
      }

      // Background overlay fade in
      overlayOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });

      // Title rises into view
      titleOpacity.value = withDelay(500, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      titleTranslateY.value = withDelay(500, withSpring(0, { damping: 20, stiffness: 100 }));

      // Subtitle follows
      subtitleOpacity.value = withDelay(800, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      subtitleTranslateY.value = withDelay(800, withSpring(0, { damping: 20, stiffness: 100 }));

      // Dismiss hint appears last
      hintOpacity.value = withDelay(1200, withTiming(1, { duration: 800 }));
    } else {
      overlayOpacity.value = withTiming(0, { duration: Duration.slow });
      titleOpacity.value = withTiming(0, { duration: Duration.normal });
      subtitleOpacity.value = withTiming(0, { duration: Duration.normal });
      hintOpacity.value = 0;
      titleTranslateY.value = 18;
      subtitleTranslateY.value = 14;
    }
  }, [visible, overlayOpacity, titleOpacity, titleTranslateY, subtitleOpacity, subtitleTranslateY, hintOpacity, reducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    backgroundColor: colors.background,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  if (!visible || !copy) return null;

  const { title } = copy;
  const subtitle = message || copy.message;
  const seriesSummaryExcerpt = formatSeriesCompletionSummary(seriesReflectionSummary);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => runAction(onDismiss)}>
      <Animated.View style={[{ flex: 1 }, overlayStyle]}>
        <EmberSystem variant="celebration" motes active />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{
          flexGrow: 1,
          paddingTop: Math.max(insets.top, Spacing['8']),
          paddingBottom: Math.max(insets.bottom, Spacing['8']),
        }}>
      <TouchableOpacity
        disabled={!!nextStep}
        accessible={!nextStep}
        activeOpacity={1}
        style={{ flexGrow: 1 }}
        onPress={() => runAction(onDismiss)}
        accessibilityRole="button"
        accessibilityLabel={[title, subtitle, detail, seriesSummaryExcerpt, 'Continue'].filter(Boolean).join('. ')}
        accessibilityHint="Tap anywhere to continue"
      >
          {/* Content — left aligned */}
          <View
            style={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'flex-start',
              paddingHorizontal: Spacing['8'],
            }}
          >
            {/* Title */}
            <Animated.View style={titleStyle}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: type === 'series' ? 46 : 43,
                  color: colors.text,
                  textAlign: 'left',
                  lineHeight: type === 'series' ? 50 : 47,
                  letterSpacing: -0.45,
                }}
              >
                {title}
              </Text>
            </Animated.View>

            {/* Subtitle */}
            <Animated.View style={[{ marginTop: Spacing['5'] }, subtitleStyle]}>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 17,
                  color: colors.textMuted,
                  textAlign: 'left',
                  lineHeight: 26,
                }}
              >
                {subtitle}
              </Text>
            </Animated.View>

            {detail ? (
              <Animated.View style={[{ marginTop: Spacing['4'], alignSelf: 'stretch' }, subtitleStyle]}>
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 17,
                    color: colors.textMuted,
                    textAlign: 'left',
                    lineHeight: 26,
                  }}
                >
                  {detail}
                </Text>
              </Animated.View>
            ) : null}

            {/* Series reflection summary */}
            {type === 'series' && seriesSummaryExcerpt && (
              <Animated.View style={[{ marginTop: Spacing['4'], alignSelf: 'stretch' }, subtitleStyle]}>
                {/* No line clamp. Four lines holds ~170 characters at iPhone
                    widths, but formatSeriesCompletionSummary allows 220, so the
                    clamp re-truncated the reflection mid-word. The overlay is
                    already inside a ScrollView, so long text scrolls instead. */}
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 16,
                    lineHeight: 24,
                    color: colors.textMuted,
                    textAlign: 'left',
                  }}
                >
                  {seriesSummaryExcerpt}
                </Text>
              </Animated.View>
            )}
          </View>

          {!nextStep && <Animated.View
            style={[
              {
                paddingTop: Spacing['8'],
                paddingHorizontal: Spacing['6'],
                alignSelf: 'center',
              },
              hintStyle,
            ]}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textHint,
              }}
            >
              Tap anywhere to continue
            </Text>
          </Animated.View>}
      </TouchableOpacity>
          {nextStep && (
            <Animated.View style={[{ padding: Spacing['8'], gap: Spacing['4'] }, hintStyle]}>
              <Text accessibilityRole="header" style={{ fontFamily: FontFamily.display, fontSize: 25, lineHeight: 32, color: colors.text }}>
                {nextStep.title}
              </Text>
              <Text style={{ fontFamily: FontFamily.body, fontSize: 16, lineHeight: 25, color: colors.textMuted }}>
                {nextStep.detail}
              </Text>
              <Button fullWidth size="lg" label={nextStep.primaryLabel} onPress={() => runAction(nextStep.onPrimary)} />
              <Button fullWidth variant="ghost" label={nextStep.secondaryLabel} onPress={() => runAction(nextStep.onSecondary)} />
            </Animated.View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
