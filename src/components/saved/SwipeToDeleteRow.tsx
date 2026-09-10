import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  clamp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { TrashIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';

const ACTION_WIDTH = 72;
const TIMING_CONFIG = { duration: Duration.normal, easing: Easing.out(Easing.cubic) };

interface SwipeToDeleteRowProps {
  children: ReactNode;
  /** Spoken name of the row; the wrapper owns the accessibility element. */
  accessibilityLabel: string;
  /** Bottom inset of the child card (its marginBottom) so the tray matches the card, not the gap. */
  cardGap: number;
  cardRadius: number;
  onPress: () => void;
  onDelete: () => void;
}

/**
 * Left-swipe reveals a single Delete action. Same gesture envelope as
 * `SwipeableNoteCard` (activeOffsetX ±10, failOffsetY ±5) so it coexists with
 * the Journal hub's right-swipe segment gesture and vertical scroll.
 */
export const SwipeToDeleteRow = memo(function SwipeToDeleteRow({
  children,
  accessibilityLabel,
  cardGap,
  cardRadius,
  onPress,
  onDelete,
}: SwipeToDeleteRowProps) {
  const { colors, isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState(0);
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const preferredWidth = Math.round(ACTION_WIDTH * Math.max(1, Math.min(scale, 1.8)));
  const actionWidth = rowWidth > 0 ? Math.min(preferredWidth, rowWidth / 3) : preferredWidth;
  const snapThreshold = actionWidth * 0.5;
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  useEffect(() => {
    translateX.value = 0;
    contextX.value = 0;
  }, [actionWidth, translateX, contextX]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withTiming(0, TIMING_CONFIG);
    onDelete();
  }, [onDelete, translateX]);

  const onAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'activate') onPress();
      if (event.nativeEvent.actionName === 'delete') handleDelete();
    },
    [onPress, handleDelete],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Left only: a right drag fails here so the Journal hub's segment pan can take it.
        .activeOffsetX([-10, 100_000])
        .failOffsetY([-5, 5])
        .onStart(() => {
          contextX.value = translateX.value;
        })
        .onUpdate((e) => {
          translateX.value = clamp(contextX.value + e.translationX, -actionWidth, 0);
        })
        .onEnd((e) => {
          const open = translateX.value < -snapThreshold || e.velocityX < -500;
          translateX.value = withTiming(open ? -actionWidth : 0, TIMING_CONFIG);
        }),
    [contextX, translateX, snapThreshold, actionWidth],
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(translateX.value), [0, actionWidth * 0.4, actionWidth], [0, 0.7, 1]),
  }));

  return (
    <View style={styles.outer} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      {/* The row exposes Remove as a custom action, so the visual tray stays out of the a11y tree. */}
      <View
        style={[
          styles.tray,
          { bottom: cardGap, borderTopRightRadius: cardRadius, borderBottomRightRadius: cardRadius },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[styles.actions, { width: actionWidth }, actionStyle]}>
          <TouchableOpacity
            onPress={handleDelete}
            activeOpacity={0.7}
            style={[styles.actionButton, { width: actionWidth }]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${accessibilityLabel}`}
          >
            <View style={[styles.actionCircle, { backgroundColor: colors.error }]}>
              <TrashIcon size={17} color={isDark ? '#FFFFFF' : colors.backgroundPure} weight="regular" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSubtle }]}>Remove</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={contentStyle}
          accessible
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[
            { name: 'activate', label: 'Open' },
            { name: 'delete', label: 'Remove' },
          ]}
          onAccessibilityAction={onAccessibilityAction}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: { position: 'relative' },
  tray: {
    position: 'absolute',
    top: 0,
    right: 0,
    overflow: 'hidden',
  },
  actions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
});
