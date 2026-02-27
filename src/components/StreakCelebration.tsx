import { useEffect, useRef } from 'react';
import { View, Animated as RNAnimated } from 'react-native';
import Animated, { 
  FadeIn, 
  FadeOut, 
  withSpring, 
  withSequence, 
  withTiming,
  runOnJS 
} from 'react-native-reanimated';
import { Flame, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';

interface StreakCelebrationProps {
  streak: number;
  onComplete?: () => void;
}

export function StreakCelebration({ streak, onComplete }: StreakCelebrationProps) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new RNAnimated.Value(0)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    // Animate in
    RNAnimated.sequence([
      RNAnimated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      RNAnimated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      RNAnimated.delay(1500),
      RNAnimated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete?.();
    });
  }, []);

  const isMilestone = [7, 14, 30, 60, 100].includes(streak);

  return (
    <RNAnimated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: opacityAnim,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <RNAnimated.View
        style={{
          transform: [{ scale: scaleAnim }],
          alignItems: 'center',
        }}
      >
        {isMilestone ? (
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Sparkles size={40} color={colors.accent} />
              <Flame size={60} color={colors.accent} fill={colors.accent} />
              <Sparkles size={40} color={colors.accent} />
            </View>
            <Animated.Text
              entering={FadeIn.delay(200)}
              style={{
                fontFamily: 'System',
                fontSize: 28,
                fontWeight: 'bold',
                color: colors.accent,
                marginTop: 16,
              }}
            >
              {streak} Days!
            </Animated.Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Flame size={50} color={colors.accent} fill={colors.accent} />
            <RNAnimated.Text
              style={{
                fontFamily: 'System',
                fontSize: 24,
                fontWeight: '600',
                color: colors.accent,
                marginTop: 12,
              }}
            >
              +1
            </RNAnimated.Text>
          </View>
        )}
      </RNAnimated.View>
    </RNAnimated.View>
  );
}
