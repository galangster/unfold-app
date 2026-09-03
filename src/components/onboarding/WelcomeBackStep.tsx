import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import type { ColorTheme } from '@/constants/colors';
import { getGreeting, getReassurance } from '@/lib/onboarding-welcome-back-copy';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  /** The name they already gave us, when they got that far. */
  name?: string;
  /** True once their first devotional has been generated and kept. */
  hasDevotional: boolean;
  /**
   * True when the step they return to asks them to decide about subscribing.
   * The reassurance must never promise the devotional opens next when the next
   * screen is actually the subscription pitch.
   */
  resumesOnDecision?: boolean;
  onContinue: () => void;
  colors: ColorTheme;
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * The warm re-entry for someone coming back to a walk-through they left.
 *
 * Shown only when they have been away a while (see ONBOARDING_WELCOME_BACK_MIN_AGE_MS
 * in onboarding.tsx) — someone who backgrounded the app for a moment returns with
 * no ceremony at all. Deliberately a single primary action: the whole point is
 * that nothing is asked of them twice.
 *
 * Shares the visual language of the other full-screen onboarding beats
 * (OnboardingCelebration, CommitmentStep): display face for the line that
 * carries feeling, body face underneath, one accent-filled button pinned above
 * the safe-area inset.
 */
export function WelcomeBackStep({ name, hasDevotional, resumesOnDecision, onContinue, colors }: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: Spacing['6'],
        backgroundColor: colors.background,
      }}
    >
      {/* Top spacer */}
      <View style={{ flex: 1 }} />

      <Animated.Text
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(200).easing(Ease.out)}
        accessibilityRole="header"
        style={{
          fontFamily: FontFamily.display,
          fontSize: 28,
          color: colors.text,
          lineHeight: Math.round(28 * 1.3),
          marginBottom: Spacing['4'],
        }}
      >
        {getGreeting(name)}
      </Animated.Text>

      <Animated.Text
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(500).easing(Ease.out)}
        style={{
          fontFamily: FontFamily.body,
          fontSize: FontSize.base,
          color: colors.textMuted,
          lineHeight: 24,
        }}
      >
        {getReassurance(hasDevotional, resumesOnDecision)}
      </Animated.Text>

      {/* Bottom spacer */}
      <View style={{ flex: 1 }} />

      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(800).easing(Ease.out)}
        style={{ paddingTop: Spacing['6'], paddingBottom: Math.max(insets.bottom, Spacing['4']) }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onContinue();
          }}
          accessibilityRole="button"
          accessibilityLabel="Pick up where I left off"
          style={{
            backgroundColor: colors.accent,
            paddingVertical: Spacing['4'],
            borderRadius: Radius.md,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.background,
              letterSpacing: 0.3,
            }}
          >
            Pick up where I left off
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
