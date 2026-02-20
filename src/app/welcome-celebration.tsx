import React, { useEffect, useCallback } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { GoldEmberField } from '@/components/GoldEmberField';
import { useUnfoldStore } from '@/lib/store';
import { Check, Sparkles, Heart, BookOpen, ArrowRight } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Confetti particle
interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  horizontalDrift: number;
  fallDuration: number;
  delay: number;
}

// Generate random confetti particles
function generateParticles(count: number, colors: string[]): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: -20 - Math.random() * 100, // Start above screen
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
    horizontalDrift: (Math.random() - 0.5) * 100,
    fallDuration: 2000 + Math.random() * 2000,
    delay: Math.random() * 600,
  }));
}

function ConfettiParticle({ particle }: { particle: Particle }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(particle.rotation);

  useEffect(() => {
    progress.value = withDelay(
      particle.delay,
      withTiming(1, {
        duration: particle.fallDuration,
        easing: Easing.out(Easing.quad),
      })
    );

    opacity.value = withDelay(
      particle.delay,
      withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(1, { duration: particle.fallDuration * 0.6 }),
        withTiming(0, { duration: 400 })
      )
    );

    rotation.value = withDelay(
      particle.delay,
      withTiming(particle.rotation + 360 + Math.random() * 360, {
        duration: particle.fallDuration,
        easing: Easing.linear,
      })
    );

    return () => {
      cancelAnimation(progress);
      cancelAnimation(opacity);
      cancelAnimation(rotation);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: particle.x + particle.horizontalDrift * progress.value },
      { translateY: interpolate(progress.value, [0, 1], [particle.y, SCREEN_HEIGHT + 50]) },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: particle.size,
          height: particle.size * 0.6,
          backgroundColor: particle.color,
          borderRadius: 1,
        },
        animatedStyle,
      ]}
    />
  );
}

// Animated checkmark that draws itself
function AnimatedCheckmark({ color, size = 80 }: { color: string; size?: number }) {
  const circleScale = useSharedValue(0);
  const circleOpacity = useSharedValue(0);
  const checkProgress = useSharedValue(0);

  useEffect(() => {
    circleScale.value = withDelay(
      200,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    circleOpacity.value = withDelay(
      200,
      withTiming(1, { duration: 300 })
    );
    checkProgress.value = withDelay(
      600,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
    opacity: circleOpacity.value,
  }));

  return (
    <View style={{ width: size, height: size }}>
      {/* Circle background */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            justifyContent: 'center',
            alignItems: 'center',
          },
          circleStyle,
        ]}
      >
        <Check size={size * 0.5} color="#fff" strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

// Floating icon that bobs gently
function FloatingIcon({ 
  children, 
  delay = 0,
  style 
}: { 
  children: React.ReactNode; 
  delay?: number;
  style?: any;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 600 }));
    
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 2000, easing: Easing.inOut(Easing.sine) }),
          withTiming(8, { duration: 2000, easing: Easing.inOut(Easing.sine) })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

export default function WelcomeCelebrationScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  
  const [showContent, setShowContent] = React.useState(false);
  const [showButton, setShowButton] = React.useState(false);
  
  // Animation values
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  
  // Confetti colors - golds, ambers, soft whites
  const confettiColors = isDark 
    ? ['#C8A55C', '#D4A85C', '#E8C880', '#F5E6C8', '#8B7355']
    : ['#9A7B3C', '#B8954C', '#D4A85C', '#E8C880', '#F5E6C8'];
  
  const particles = React.useMemo(() => generateParticles(40, confettiColors), [confettiColors]);
  
  const name = user?.name || 'Friend';
  
  useEffect(() => {
    // Trigger haptic celebration
    const hapticTimer = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 400);
    
    // Staggered content reveal
    const contentTimer = setTimeout(() => {
      setShowContent(true);
      titleOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      titleTranslateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    }, 800);
    
    const subtitleTimer = setTimeout(() => {
      subtitleOpacity.value = withTiming(1, { duration: 500 });
    }, 1400);
    
    const cardTimer = setTimeout(() => {
      cardScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
      cardOpacity.value = withTiming(1, { duration: 400 });
    }, 1800);
    
    const buttonTimer = setTimeout(() => {
      setShowButton(true);
    }, 2800);
    
    return () => {
      clearTimeout(hapticTimer);
      clearTimeout(contentTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(cardTimer);
      clearTimeout(buttonTimer);
    };
  }, []);
  
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));
  
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));
  
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  
  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/generating');
  }, [router]);
  
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Confetti burst */}
      {particles.map((particle) => (
        <ConfettiParticle key={particle.id} particle={particle} />
      ))}
      
      {/* Subtle embers in background */}
      <GoldEmberField density="low" active={true} style={{ opacity: 0.3 }} />
      
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          
          {/* Animated checkmark */}
          <AnimatedCheckmark color={colors.accent} size={90} />
          
          {/* Floating icons around the checkmark */}
          <FloatingIcon delay={1000} style={{ position: 'absolute', top: '25%', left: '15%' }}>
            <View style={{ 
              width: 44, 
              height: 44, 
              borderRadius: 22, 
              backgroundColor: colors.inputBackground,
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            }}>
              <BookOpen size={22} color={colors.accent} />
            </View>
          </FloatingIcon>
          
          <FloatingIcon delay={1200} style={{ position: 'absolute', top: '30%', right: '12%' }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 20, 
              backgroundColor: colors.inputBackground,
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            }}>
              <Heart size={20} color={colors.accent} />
            </View>
          </FloatingIcon>
          
          <FloatingIcon delay={1400} style={{ position: 'absolute', top: '40%', left: '8%' }}>
            <View style={{ 
              width: 36, 
              height: 36, 
              borderRadius: 18, 
              backgroundColor: colors.inputBackground,
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            }}>
              <Sparkles size={18} color={colors.accent} />
            </View>
          </FloatingIcon>
          
          {/* Title */}
          <Animated.View style={[{ marginTop: 40, alignItems: 'center' }, titleStyle]}>
            <Text style={{ 
              fontFamily: FontFamily.display, 
              fontSize: 36, 
              color: colors.text,
              textAlign: 'center',
              letterSpacing: -0.5,
            }}>
              Welcome, {name}
            </Text>
          </Animated.View>
          
          {/* Subtitle */}
          <Animated.View style={[{ marginTop: 16, alignItems: 'center' }, subtitleStyle]}>
            <Text style={{ 
              fontFamily: FontFamily.body, 
              fontSize: 16, 
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 24,
            }}>
              Your journey begins today.
            </Text>
          </Animated.View>
          
          {/* What happens next card */}
          <Animated.View 
            style={[
              {
                width: '100%',
                marginTop: 40,
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                padding: 24,
                borderWidth: 1,
                borderColor: colors.border,
              },
              cardStyle,
            ]}
          >
            <Text style={{ 
              fontFamily: FontFamily.uiMedium, 
              fontSize: 13, 
              color: colors.accent,
              letterSpacing: 0.5,
              marginBottom: 16,
            }}>
              WHAT HAPPENS NEXT
            </Text>
            
            {[
              { icon: <Sparkles size={18} color={colors.accent} />, text: 'We\'re crafting your first devotional' },
              { icon: <BookOpen size={18} color={colors.accent} />, text: 'It will be ready in just a moment' },
              { icon: <Heart size={18} color={colors.accent} />, text: 'Written just for you, based on what you shared' },
            ].map((item, index) => (
              <View 
                key={index}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  gap: 12,
                  marginBottom: index < 2 ? 14 : 0,
                }}
              >
                <View style={{ 
                  width: 32, 
                  height: 32, 
                  borderRadius: 16,
                  backgroundColor: isDark ? 'rgba(200, 165, 92, 0.12)' : 'rgba(154, 123, 60, 0.08)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  {item.icon}
                </View>
                <Text style={{ 
                  fontFamily: FontFamily.body, 
                  fontSize: 15, 
                  color: colors.text,
                  flex: 1,
                }}>
                  {item.text}
                </Text>
              </View>
            ))}
          </Animated.View>
          
          {/* Continue button */}
          {showButton && (
            <Animated.View 
              entering={Animated.FadeIn.duration(400)}
              style={{ width: '100%', marginTop: 32 }}
            >
              <Pressable onPress={handleContinue}>
                {({ pressed }) => (
                  <View
                    style={{
                      backgroundColor: colors.accent,
                      paddingVertical: 18,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      opacity: pressed ? 0.9 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      shadowColor: colors.accent,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    <Text style={{ 
                      fontFamily: FontFamily.uiMedium, 
                      fontSize: 17, 
                      color: colors.background,
                      letterSpacing: 0.3,
                    }}>
                      Begin Your Journey
                    </Text>
                    <ArrowRight size={20} color={colors.background} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
