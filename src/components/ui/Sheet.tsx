/**
 * Unfold Design System — Sheet
 * Bottom sheet wrapper with consistent styling, animation, and gestures.
 * Handles backdrop, handle bar, slide animation, swipe-to-dismiss,
 * keyboard avoidance, and safe area insets.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   Modal mounts, sheet at translateY = OFFSCREEN (500)
 *   16ms   Sheet slides up (340ms, ease-out cubic)
 *  340ms   Sheet settled at rest position
 *
 *  DISMISS (swipe > 80px or tap backdrop):
 *    0ms   Sheet slides down (180ms)
 *  180ms   onClose() fires, Modal unmounts
 */

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { Radius } from '@/constants/radius';

// ---------------------------------------------------------------------------
// Animation config
// ---------------------------------------------------------------------------

const OFFSCREEN = 500;
const SLIDE_IN = { duration: Duration.slow, easing: Ease.out };
const DISMISS_DURATION = Duration.fast;
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Content horizontal padding. Default: 28 */
  contentPadding?: number;
  /** Extra bottom padding beyond safe area. Default: 200 (for keyboard clearance) */
  bottomPadding?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Sheet({
  visible,
  onClose,
  children,
  contentPadding = 28,
  bottomPadding = 200,
}: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(OFFSCREEN);
  const backdropOpacity = useSharedValue(0);
  const dismissing = useRef(false);

  // Slide in when sheet opens
  useEffect(() => {
    if (visible) {
      dismissing.current = false;
      translateY.value = OFFSCREEN;
      backdropOpacity.value = 0;
      translateY.value = withTiming(0, SLIDE_IN);
      backdropOpacity.value = withTiming(0.4, SLIDE_IN);
    }
  }, [visible, translateY, backdropOpacity]);

  const dismissSheet = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
    backdropOpacity.value = withTiming(0, { duration: DISMISS_DURATION });
    setTimeout(onClose, DISMISS_DURATION);
  }, [onClose, translateY, backdropOpacity]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationY > 0) {
            translateY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (e.translationY > SWIPE_THRESHOLD || e.velocityY > VELOCITY_THRESHOLD) {
            translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
            backdropOpacity.value = withTiming(0, { duration: DISMISS_DURATION });
            runOnJS(dismissSheet)();
          } else {
            translateY.value = withTiming(0, SLIDE_IN);
            backdropOpacity.value = withTiming(0.4, SLIDE_IN);
          }
        }),
    [dismissSheet, translateY, backdropOpacity],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0, 0, 0, ${backdropOpacity.value})`,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissSheet}
    >
      <GestureHandlerRootView style={styles.modalContainer}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Backdrop — tap to dismiss */}
          <Animated.View style={[styles.dismissArea, backdropAnimatedStyle]}>
            <TouchableOpacity
              style={styles.dismissArea}
              activeOpacity={1}
              onPress={dismissSheet}
            />
          </Animated.View>

          {/* Sheet surface */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.sheet,
                sheetAnimatedStyle,
                {
                  backgroundColor: colors.backgroundElevated,
                  paddingBottom: insets.bottom + bottomPadding,
                },
              ]}
            >
              {/* Handle bar */}
              <View style={styles.handleRow}>
                <View style={[styles.handleBar, { backgroundColor: colors.borderStrong }]} />
              </View>

              {/* Content */}
              <View style={[styles.content, { paddingHorizontal: contentPadding }]}>
                {children}
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    ...Shadow.sheet,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handleBar: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
  content: {
    paddingTop: 8,
  },
});
