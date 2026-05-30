import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
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
import { XIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, FontSize } from '@/constants/fonts';
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
  title = 'Reader preferences',
  onClose,
  children,
  footer,
  maxHeightRatio = 0.62,
  bottomInset = 0,
  testID,
  accessibilityLabel = 'Reader preferences',
}: ReaderBottomSheetProps) {
  const { colors, isDark } = useTheme();
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
          if (event.translationY > 0) {
            translateY.value = event.translationY;
          }
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

  const bottomOffset = bottomInset + insets.bottom;
  const maxHeight = Math.max(320, Math.round(windowHeight * maxHeightRatio));
  const sheetBackground = isDark ? colors.backgroundElevated : colors.backgroundElevated;
  const closeBackground = isDark ? 'rgba(245, 240, 235, 0.08)' : 'rgba(28, 23, 16, 0.06)';

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
              bottom: bottomOffset,
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
              <View style={styles.headerRow}>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <TouchableOpacity
                  testID="reader-bottom-sheet-close"
                  style={[styles.closeButton, { backgroundColor: closeBackground }]}
                  onPress={closeSheet}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel="Close reader preferences"
                >
                  <XIcon size={15} color={colors.textMuted} weight="bold" />
                </TouchableOpacity>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            testID={testID}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            bounces={false}
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
    left: 8,
    right: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 18,
  },
  dragRegion: {
    minHeight: 72,
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['2'],
  },
  grabberRow: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: Radius.full,
  },
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing['3'],
  },
  title: {
    flex: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
