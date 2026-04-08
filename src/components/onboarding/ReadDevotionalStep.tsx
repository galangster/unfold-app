/**
 * ReadDevotionalStep — Placeholder for the in-onboarding reading experience.
 *
 * In the full Mau Baron framework, this screen shows the actual generated
 * devotional during onboarding. Currently, generation happens after onboarding
 * completes (on the /generating screen). This step acts as a bridge:
 * it completes onboarding and triggers generation, which then leads to the
 * reveal → reading flow.
 *
 * TODO: In the future, trigger generation during the segue step and show
 * the reading experience inline here without leaving onboarding.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { BookOpenIcon } from 'phosphor-react-native';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onContinue: () => void;
}

export function ReadDevotionalStep({ colors, onContinue }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, paddingHorizontal: Spacing['6'] }}>
      <View style={{ flex: 1 }} />

      <View style={{ alignItems: 'center', gap: Spacing['5'] }}>
        <Animated.View entering={FadeIn.duration(600).delay(200)}>
          <BookOpenIcon size={48} color={colors.accent} weight="light" />
        </Animated.View>

        <Animated.Text
          entering={FadeIn.duration(600).delay(400)}
          style={{
            fontFamily: FontFamily.display,
            fontSize: 28,
            color: colors.text,
            textAlign: 'center',
            lineHeight: 36,
          }}
        >
          Your first devotional is ready.
        </Animated.Text>

        <Animated.Text
          entering={FadeIn.duration(500).delay(800)}
          style={{
            fontFamily: FontFamily.body,
            fontSize: 16,
            color: colors.textMuted,
            textAlign: 'center',
            lineHeight: 24,
            paddingHorizontal: Spacing['4'],
          }}
        >
          Written from your story, your struggles, and where you want to go. This is yours.
        </Animated.Text>
      </View>

      <View style={{ flex: 1 }} />

      <Animated.View entering={FadeIn.duration(600).delay(1400)} style={{ paddingBottom: Math.max(insets.bottom, Spacing['4']) }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onContinue();
          }}
          style={{
            backgroundColor: colors.accent,
            paddingVertical: Spacing['4'],
            borderRadius: Radius.md,
            alignItems: 'center',
          }}
        >
          <Text style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: FontSize.base,
            color: colors.background,
            letterSpacing: 0.3,
          }}>
            Begin reading
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
