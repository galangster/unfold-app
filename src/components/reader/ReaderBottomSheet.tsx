import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';

export interface ReaderBottomSheetProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxHeightRatio?: number;
  bottomInset?: number;
  testID?: string;
  accessibilityLabel?: string;
}

const DISMISS_TRANSLATE_Y = 520;
const DISMISS_DISTANCE = 72;
const DISMISS_VELOCITY = 700;
const ENTER_OFFSET = 36;
const EXIT_DURATION = 180;
const SHEET_TIMING = {
  duration: Duration.normal,
  easing: Easing.out(Easing.cubic),
};

export function ReaderBottomSheet({
  visible,
  onClose,
  children,
  footer,
  maxHeightRatio = 0.62,
  bottomInset = 0,
  testID,
  accessibilityLabel = 'Reader preferences',
}: ReaderBottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(reducedMotion ? 0 : ENTER_OFFSET);

  useEffect(() => {
    if (!visible) return;
    translateY.value = reducedMotion ? 0 : ENTER_OFFSET;
    translateY.value = withTiming(0, SHEET_TIMING);
  }, [visible, reducedMotion, translateY]);

  const closeSheet = useCallback(() => {
    if (reducedMotion) {
      onClose();
      return;
    }

    translateY.value = withTiming(
      DISMISS_TRANSLATE_Y,
      { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) },
      () => {
        runOnJS(onClose)();
      },
    );
  }, [onClose, reducedMotion, translateY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-28, 28])
        .onUpdate((event) => {
          // Down-drag tracks 1:1 toward dismissal; up-drag past the rest
          // position gets rubber-band resistance so the sheet feels elastic
          // instead of stiff/locked (matches the app's standard Sheet).
          translateY.value =
            event.translationY > 0 ? event.translationY : event.translationY * 0.2;
        })
        .onEnd((event) => {
          if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
            runOnJS(closeSheet)();
            return;
          }

          translateY.value = withTiming(0, SHEET_TIMING);
        }),
    [closeSheet, translateY],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  // Sheet is anchored flush to the screen bottom; the caller's bottomInset is
  // folded into the content padding (with the home-indicator inset) so the last
  // row clears the bottom edge instead of the whole sheet floating above it.
  const contentBottomPadding = insets.bottom + bottomInset + Spacing['5'];
  const maxHeight = Math.max(320, Math.round(windowHeight * maxHeightRatio));
  const sheetBackground = colors.backgroundElevated;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={styles.root}>
        <TouchableOpacity
          testID="reader-bottom-sheet-backdrop"
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeSheet}
          accessibilityRole="button"
          accessibilityLabel="Close reader preferences"
        />

        <Animated.View
          testID="reader-bottom-sheet-surface"
          accessibilityLabel={accessibilityLabel}
          accessibilityViewIsModal
          onAccessibilityEscape={closeSheet}
          style={[
            styles.surface,
            sheetAnimatedStyle,
            {
              maxHeight,
              bottom: 0,
              backgroundColor: sheetBackground,
              borderColor: colors.border,
              shadowColor: '#000',
            },
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <View
              style={styles.dragRegion}
              accessibilityRole="button"
              accessibilityLabel="Swipe down to close reader preferences"
            >
              <View style={styles.grabberRow}>
                <View
                  testID="reader-bottom-sheet-grabber"
                  style={[styles.grabber, { backgroundColor: colors.borderStrong }]}
                />
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            testID={testID}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
            bounces
            alwaysBounceVertical
          >
            {children}
          </ScrollView>

          {footer ? <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View> : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
  },
  surface: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 18,
  },
  dragRegion: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  grabberRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
  },
  content: {
    paddingHorizontal: Spacing['5'],
    paddingBottom: Spacing['5'],
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['4'],
  },
});
