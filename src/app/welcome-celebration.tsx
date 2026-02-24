import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';

export default function WelcomeCelebrationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);

  const name = user?.name || 'Friend';

  const handleContinue = () => {
    router.replace('/generating');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.accent,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 32,
              }}
            >
              <Text style={{ fontSize: 40 }}>✓</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(500).delay(200)} style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: FontFamily.display, fontSize: 32, color: colors.text, marginBottom: 12 }}>
              Welcome, {name}
            </Text>
            
            <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: colors.textMuted, textAlign: 'center' }}>
              Your personalized devotional journey begins now.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.duration(500).delay(400)}
            style={{
              width: '100%',
              marginTop: 48,
              backgroundColor: colors.inputBackground,
              borderRadius: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent, marginBottom: 16 }}>
              WHAT HAPPENS NEXT
            </Text>

            {[ 
              'Your first devotional is being uniquely crafted', 
              'Every morning, fresh words for exactly where you are', 
              'Build a transformative habit, one day at a time', 
            ].map((text, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.accent,
                    marginRight: 12,
                  }}
                />
                <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.text }}>
                  {text}
                </Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(500).delay(600)} style={{ width: '100%', marginTop: 32 }}>
            <Pressable onPress={handleContinue}>
              {({ pressed }) => (
                <View
                  style={{
                    backgroundColor: colors.accent,
                    paddingVertical: 18,
                    borderRadius: 12,
                    alignItems: 'center',
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  }}
                >
                  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: colors.background }}>
                    Begin Your Journey
                  </Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
