import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  name: string;
  colors: ColorTheme;
  onContinue: () => void;
}

export function DevotionalSegue({ name, colors, onContinue }: Props) {
  const insets = useSafeAreaInsets();

  // Pulsing glow behind the text
  const glow = useSharedValue(0.3);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [glow]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={{ flex: 1, paddingHorizontal: Spacing['6'] }}>
      {/* Ambient glow */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: '30%',
            left: '10%',
            right: '10%',
            height: 200,
            borderRadius: 100,
            backgroundColor: colors.accent,
          },
          glowStyle,
        ]}
        pointerEvents="none"
      />

      {/* Top spacer */}
      <View style={{ flex: 1 }} />

      {/* Content */}
      <View>
        <Animated.Text
          entering={FadeIn.duration(800).delay(200)}
          style={{
            fontFamily: FontFamily.display,
            fontSize: 32,
            color: colors.text,
            lineHeight: 40,
          }}
        >
          Something is being written for you right now.
        </Animated.Text>

        <Animated.Text
          entering={FadeIn.duration(600).delay(1200)}
          style={{
            fontFamily: FontFamily.body,
            fontSize: 16,
            color: colors.textMuted,
            lineHeight: 24,
            marginTop: Spacing['5'],
          }}
        >
          {name ? `${name}, your` : 'Your'} first devotional is being shaped by everything you just shared.
        </Animated.Text>

        <Animated.Text
          entering={FadeIn.duration(600).delay(2000)}
          style={{
            fontFamily: FontFamily.body,
            fontSize: 16,
            color: colors.textMuted,
            lineHeight: 24,
            marginTop: Spacing['1'],
          }}
        >
          No one else will ever read what you{'\u2019'}re about to read.
        </Animated.Text>
      </View>

      {/* Bottom spacer */}
      <View style={{ flex: 1 }} />

      {/* Continue button */}
      <Animated.View entering={FadeIn.duration(600).delay(3000)} style={{ paddingBottom: Math.max(insets.bottom, Spacing['4']) }}>
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
            Show me
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
