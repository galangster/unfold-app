import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  FadeIn,
  FadeInUp,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useUnfoldStore } from '@/lib/store';

export default function WelcomeCelebrationScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const bgColor = isDark ? '#0A0A0A' : colors.background;
  const cardColor = isDark ? '#111214' : colors.backgroundElevated;
  const borderColor = isDark ? '#24262B' : colors.border;
  const textColor = isDark ? '#F5F5F7' : colors.text;
  const mutedColor = isDark ? '#9DA3AE' : colors.textMuted;
  const user = useUnfoldStore((s) => s.user);

  const name = user?.name || 'Friend';

  const handleContinue = () => {
    router.replace('/generating');
  };

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'] }}>
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.accent,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: Spacing['8'],
              }}
            >
              <Text style={{ fontSize: 40 }}>✓</Text>
            </View>
          </Animated.View>

          <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(Duration.normal).delay(200).easing(Ease.out)} style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: FontFamily.display, fontSize: 32, color: textColor, marginBottom: Spacing['2'] }}>
              Welcome, {name}
            </Text>
          </Animated.View>

          <Animated.View
            entering={reducedMotion ? undefined : FadeInUp.duration(Duration.normal).delay(400).easing(Ease.out)}
            style={{
              width: '100%',
              marginTop: 48,
              backgroundColor: cardColor,
              borderRadius: Radius.lg,
              padding: Spacing['6'],
              borderWidth: 1,
              borderColor: borderColor,
            }}
          >
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent, marginBottom: Spacing['4'] }}>
              WHAT HAPPENS NEXT
            </Text>

            {[ 
              'Your first devotional is being uniquely crafted', 
              'Every morning, fresh words for exactly where you are', 
              'Build a transformative habit, one day at a time', 
            ].map((text) => (
              <View key={text} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['3'] }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.accent,
                    marginRight: Spacing['3'],
                  }}
                />
                <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: textColor }}>
                  {text}
                </Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(Duration.normal).delay(600).easing(Ease.out)} style={{ width: '100%', marginTop: Spacing['8'] }}>
            <TouchableOpacity activeOpacity={0.7} onPress={handleContinue}>
                <View
                  style={{
                    backgroundColor: colors.accent,
                    paddingVertical: 18,
                    borderRadius: Radius.md,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: colors.contrastText ?? '#FFFFFF' }}>
                    Begin Your Journey
                  </Text>
                </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
