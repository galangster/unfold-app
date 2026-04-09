import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import type { ColorTheme } from '@/constants/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  step: 'choose' | 'affirm';
  commitmentLevel?: string;
  onSelect: (level: string) => void;
  onContinue: () => void;
  colors: ColorTheme;
}

// ─── Commitment options ───────────────────────────────────────────────────────

const COMMITMENT_OPTIONS = [
  { label: 'All in — I\'m doing this every day', value: 'all_in' },
  { label: 'I\'ll try — a few times a week', value: 'try' },
  { label: 'Curious — let me see how it goes', value: 'curious' },
] as const;

// ─── Affirmation copy ─────────────────────────────────────────────────────────

function getAffirmation(commitmentLevel?: string): string {
  switch (commitmentLevel) {
    case 'all_in':
      return "That's how it starts. One day at a time, and you've already begun.";
    case 'try':
      return 'Showing up when you can is enough. God meets you where you are.';
    case 'curious':
      return "Curiosity is how every good thing starts. You're already here.";
    default:
      return "You're already here. That's what matters.";
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommitmentStep({ step, commitmentLevel, onSelect, onContinue, colors }: Props) {
  const insets = useSafeAreaInsets();

  if (step === 'choose') {
    return (
      <View style={{ flex: 1, paddingHorizontal: Spacing['6'] }}>
        {/* Top spacer */}
        <View style={{ flex: 1 }} />

        {/* Question */}
        <Text
          style={{
            fontFamily: FontFamily.display,
            fontSize: 28,
            color: colors.text,
            lineHeight: Math.round(28 * 1.3),
            marginBottom: Spacing['6'],
          }}
        >
          How committed are you to making space for this?
        </Text>

        {/* Choice rows */}
        <View style={{ gap: Spacing['3'] }}>
          {COMMITMENT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(option.value);
              }}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              style={{
                backgroundColor: colors.inputBackground,
                paddingHorizontal: Spacing['5'],
                paddingVertical: 18,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.base,
                  color: colors.text,
                  lineHeight: 22,
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bottom spacer */}
        <View style={{ flex: 1 }} />
      </View>
    );
  }

  // 'affirm' mode
  return (
    <View style={{ flex: 1, paddingHorizontal: Spacing['6'] }}>
      {/* Top spacer */}
      <View style={{ flex: 1 }} />

      {/* Affirmation */}
      <Animated.Text
        entering={FadeIn.duration(600).delay(200)}
        style={{
          fontFamily: FontFamily.display,
          fontSize: 24,
          color: colors.text,
          lineHeight: Math.round(24 * 1.4),
          textAlign: 'left',
        }}
      >
        {getAffirmation(commitmentLevel)}
      </Animated.Text>

      {/* Bottom spacer */}
      <View style={{ flex: 1 }} />

      {/* Continue button */}
      <Animated.View
        entering={FadeIn.duration(400).delay(800)}
        style={{ paddingTop: Spacing['6'], paddingBottom: Math.max(insets.bottom, Spacing['4']) }}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onContinue();
          }}
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
            Continue
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
