import { useEffect } from 'react';
import { Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';

const ENTERING = FadeIn.duration(Duration.normal).easing(Ease.out);

/** The avatar owns the animated typing spheres. This marks the pending reply. */
export function TypingIndicator() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    void Haptics.selectionAsync();
  }, []);

  return (
    <Animated.View
      entering={reducedMotion ? undefined : ENTERING}
      accessible
      accessibilityLabel="Companion is thinking"
      accessibilityLiveRegion="polite"
      style={{ paddingLeft: Spacing['4'] }}
    >
      <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.sm, color: colors.textMuted }}>
        Thinking…
      </Text>
    </Animated.View>
  );
}
