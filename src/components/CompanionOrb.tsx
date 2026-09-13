import { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CompanionAvatar, type CompanionIdleStyle } from '@/components/companion/CompanionAvatar';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { CompanionExpression } from '@/lib/companion-avatar-model';

export type { CompanionExpression };

export interface CompanionOrbProps {
  accentColor: string;
  size?: number;
  onPress?: () => void;
  /**
   * Retained for call-site compatibility. Onboarding and feature cards pass
   * this as a featured flag. It is not thinking and does not start the split.
   */
  isActive?: boolean;
  showBadge?: boolean;
  animated?: boolean;
  /**
   * Whether the orb is on screen. When false (tab hidden or caller paused)
   * looping pulses stop and the morph snaps to its target pose.
   */
  active?: boolean;
  /** Chat streaming lifecycle. Morphs the character into three pearl spheres. */
  thinking?: boolean;
  expression?: CompanionExpression;
  idleStyle?: CompanionIdleStyle;
}

export function CompanionOrb({
  accentColor,
  size = 48,
  onPress,
  showBadge = false,
  animated = true,
  active = true,
  thinking = false,
  expression = 'gentle',
  idleStyle = 'calm',
}: CompanionOrbProps) {
  const { reducedMotion } = useAccessibleAnimation();
  const tapScale = useSharedValue(1);

  useEffect(() => {
    if (!animated || !active || reducedMotion) {
      cancelAnimation(tapScale);
      tapScale.value = 1;
    }
    return () => {
      cancelAnimation(tapScale);
    };
  }, [active, animated, reducedMotion, tapScale]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tapScale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (animated && active && !reducedMotion) {
      tapScale.value = withSequence(
        withTiming(0.96, { duration: 90 }),
        withTiming(1, { duration: 140 }),
      );
    }
    onPress?.();
  };

  const face = (
    <CompanionAvatar
      size={size}
      thinking={thinking}
      expression={expression}
      idleStyle={idleStyle}
      animated={animated}
      active={active}
    />
  );

  return (
    <View style={{ width: size, height: size, overflow: 'visible' }}>
      {onPress ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handlePress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Companion"
          style={{ width: size, height: size }}
        >
          <Animated.View style={[{ width: size, height: size, overflow: 'visible' }, pressStyle]}>
            {face}
          </Animated.View>
        </TouchableOpacity>
      ) : (
        <View style={{ width: size, height: size }}>
          {face}
        </View>
      )}

      {showBadge && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: accentColor,
          }}
        />
      )}
    </View>
  );
}
