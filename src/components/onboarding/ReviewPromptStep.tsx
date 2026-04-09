import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as StoreReview from 'expo-store-review';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onContinue: () => void;
}

export function ReviewPromptStep({ colors, onContinue }: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function requestReview() {
      try {
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
        }
      } catch {
        // Review dialog unavailable — proceed silently
      }
    }

    requestReview();
  }, []);

  return (
    <View style={{ flex: 1, paddingHorizontal: Spacing['6'] }}>
      {/* Top spacer */}
      <View style={{ flex: 1 }} />

      {/* Content */}
      <View>
        <Text
          style={{
            fontFamily: FontFamily.display,
            fontSize: 24,
            color: colors.text,
            lineHeight: Math.round(24 * 1.35),
            textAlign: 'left',
          }}
        >
          If this moved you, a review helps others find us.
        </Text>

        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: 15,
            color: colors.textMuted,
            lineHeight: 22,
            textAlign: 'left',
            marginTop: Spacing['3'],
          }}
        >
          It takes 5 seconds and means everything.
        </Text>
      </View>

      {/* Bottom spacer */}
      <View style={{ flex: 1 }} />

      {/* Continue button — fades in after 2 seconds */}
      <Animated.View
        entering={FadeIn.duration(400).delay(2000)}
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
