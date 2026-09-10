import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { MicrophoneIcon } from '@/components/icons';
import { alpha } from '@/components/ui';
import type { ColorTheme } from '@/constants/colors';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';

export function VoiceAnswerButton({ colors, onPress }: { colors: ColorTheme; onPress: () => void }) {
  const reducedMotion = useReducedMotion();
  const shine = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      shine.value = 0;
      return;
    }
    // Two quiet sweeps draw attention to this optional input, then leave the reader alone.
    shine.value = withDelay(700, withSequence(
      withTiming(1, { duration: 1100, easing: Easing.linear }),
      withDelay(4300, withTiming(0, { duration: 0 })),
      withTiming(1, { duration: 1100, easing: Easing.linear }),
    ));
    return () => cancelAnimation(shine);
  }, [reducedMotion, shine]);
  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -25 + shine.value * 100 }, { rotate: '-18deg' }],
  }));
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Record your answer"
      accessibilityHint="Record a short answer, then review the text before using it."
      activeOpacity={0.76}
      onPress={() => { cancelAnimation(shine); shine.value = 1; onPress(); }}
      style={[styles.button, { borderColor: alpha(colors.accent, 0.3), backgroundColor: alpha(colors.accent, 0.055) }]}
    >
      <View style={[styles.microphone, { backgroundColor: alpha(colors.accent, 0.15) }]}>
        <MicrophoneIcon size={23} color={colors.accent} weight="regular" />
        {!reducedMotion && (
          <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.shine, shineStyle]}>
            <LinearGradient colors={['transparent', alpha(colors.accent, 0.55), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: colors.text }]}>Record your answer</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>Up to 2 minutes. Your words, at your pace.</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, padding: 12, borderWidth: 1, borderRadius: Radius.lg, borderCurve: 'continuous', marginTop: 12 },
  microphone: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  shine: { position: 'absolute', width: 16, top: -8, bottom: -8, left: 0 },
  copy: { flex: 1, gap: 3 },
  label: { fontFamily: FontFamily.uiSemiBold, fontSize: 15 },
  hint: { fontFamily: FontFamily.ui, fontSize: 12, lineHeight: 17 },
});
