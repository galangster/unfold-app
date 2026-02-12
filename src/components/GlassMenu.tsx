import { useEffect } from 'react';
import { View, Text, Pressable, Dimensions, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

interface GlassMenuProps {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
}

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GlassMenu({ visible, onClose, items }: GlassMenuProps) {
  const { colors } = useTheme();
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      translateY.value = withSpring(0, {
        damping: 25,
        stiffness: 300,
      });
      backdropOpacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 20, stiffness: 300 });
    } else {
      translateY.value = withSpring(400, {
        damping: 25,
        stiffness: 300,
      });
      backdropOpacity.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(0.95, { duration: 200 });
    }
  }, [visible]);

  const menuStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 500) {
        translateY.value = withSpring(400, { damping: 25, stiffness: 300 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 25, stiffness: 300 });
      }
    });

  if (!visible) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <AnimatedPressable
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0, 0, 0, 0.6)' },
          backdropStyle,
        ]}
        onPress={handleClose}
      />

      {/* Menu */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: 40,
            },
            menuStyle,
          ]}
        >
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 24,
              overflow: 'hidden',
              backgroundColor: colors.glassBackground,
              borderWidth: 1,
              borderColor: colors.glassBorder,
            }}
          >
            <BlurView
              intensity={80}
              tint="dark"
              style={{
                padding: 8,
              }}
            >
              {/* Drag handle */}
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.textHint,
                  alignSelf: 'center',
                  marginTop: 8,
                  marginBottom: 16,
                }}
              />

              {/* Menu items */}
              {items.map((item, index) => (
                <Pressable
                  key={index}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    item.onPress();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 16,
                    paddingHorizontal: 20,
                    borderRadius: 12,
                    backgroundColor: pressed ? colors.buttonBackgroundPressed : 'transparent',
                    marginHorizontal: 4,
                  })}
                >
                  <View style={{ width: 24, alignItems: 'center' }}>
                    {item.icon}
                  </View>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 16,
                      color: colors.text,
                      marginLeft: 14,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </BlurView>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
