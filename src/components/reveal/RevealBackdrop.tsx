import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRevealActivity } from '@/hooks/useRevealActivity';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui/utils/alpha';
import { RevealGradient, type RevealGradientProps, type RevealGradientVariant } from './RevealGradient';

export function RevealGradientSurface(props: RevealGradientProps) {
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <RevealGradient {...props} />
      <LinearGradient style={StyleSheet.absoluteFill}
        colors={[alpha(props.background, 0.08), alpha(props.background, 0.5), alpha(props.background, 0.5), alpha(props.background, 0.12)]}
        locations={[0, 0.3, 0.66, 1]} />
    </View>
  );
}

export function RevealBackdrop({ variant }: { variant: RevealGradientVariant }) {
  const { colors, isDark } = useTheme();
  const focused = useRevealActivity();
  const { reducedMotion } = useAccessibleAnimation();

  return (
      <RevealGradientSurface variant={variant} accent={colors.accent}
        background={colors.background} isDark={isDark}
        active={focused} reducedMotion={reducedMotion} soften={15} />
  );
}
