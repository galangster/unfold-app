import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  clamp,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ArrowUpRightIcon,
  FolderSimpleIcon,
  TrashIcon,
} from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { NoteCard } from './NoteCard';
import type { Note } from '@/lib/store';

const ACTION_WIDTH = 56;

const EASE_OUT = Easing.out(Easing.cubic);
const TIMING_CONFIG = { duration: Duration.normal, easing: EASE_OUT };

interface SwipeableNoteCardProps {
  note: Note;
  index: number;
  onPress: (note: Note) => void;
  onShare: (note: Note) => void;
  onMove: (note: Note) => void;
  onDelete: (note: Note) => void;
}

// Memoized (WR-24): the notebook screen re-renders on scroll-direction
// changes (FAB visibility) and while typing in search — without memo every
// card re-rendered and rebuilt its pan gesture each time.
export const SwipeableNoteCard = memo(function SwipeableNoteCard({
  note,
  index,
  onPress,
  onShare,
  onMove,
  onDelete,
}: SwipeableNoteCardProps) {
  const { colors, isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState(0);
  // Match the global Dynamic Type ceiling in src/app/_layout.tsx (1.8).
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const preferredActionWidth = Math.round(ACTION_WIDTH * Math.max(1, Math.min(scale, 1.8)));
  const actionWidth = rowWidth > 0 ? Math.min(preferredActionWidth, rowWidth / 3) : preferredActionWidth;
  const totalActionsWidth = actionWidth * 3;
  const snapThreshold = totalActionsWidth * 0.35;
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  useEffect(() => {
    // An open tray must not retain the offset from the previous text or window size.
    translateX.value = 0;
    contextX.value = 0;
  }, [totalActionsWidth, translateX, contextX]);

  const close = useCallback(() => {
    translateX.value = withTiming(0, TIMING_CONFIG);
  }, [translateX]);

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    close();
    onShare(note);
  }, [note, onShare, close]);

  const handleMove = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    close();
    onMove(note);
  }, [note, onMove, close]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    close();
    onDelete(note);
  }, [note, onDelete, close]);

  const handlePress = useCallback(
    (pressedNote: Note) => {
      onPress(pressedNote);
    },
    [onPress],
  );

  const onAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      switch (event.nativeEvent.actionName) {
        case 'activate':
          handlePress(note);
          break;
        case 'share':
          handleShare();
          break;
        case 'move':
          handleMove();
          break;
        case 'delete':
          handleDelete();
          break;
      }
    },
    [handlePress, note, handleShare, handleMove, handleDelete],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .onStart(() => {
          contextX.value = translateX.value;
        })
        .onUpdate((e) => {
          const raw = contextX.value + e.translationX;
          translateX.value = clamp(raw, -totalActionsWidth, 0);
        })
        .onEnd((e) => {
          const isOpen = translateX.value < -snapThreshold;
          const isFlick = e.velocityX < -500;

          if (isOpen || isFlick) {
            translateX.value = withTiming(-totalActionsWidth, TIMING_CONFIG);
          } else {
            translateX.value = withTiming(0, TIMING_CONFIG);
          }
        }),
    [contextX, translateX, snapThreshold, totalActionsWidth],
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, totalActionsWidth * 0.4, totalActionsWidth],
      [0, 0.7, 1],
    ),
  }));

  return (
    <View style={styles.outerContainer} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
      {/* Action buttons — positioned inside the card area only */}
      <View style={styles.cardArea}>
        <Animated.View style={[styles.actionsContainer, { width: totalActionsWidth }, actionsStyle]}>
          <TouchableOpacity
            onPress={handleShare}
            activeOpacity={0.7}
            style={[styles.actionButton, { width: actionWidth }]}
            accessibilityRole="button"
            accessibilityLabel={`Share note ${note.title}`}
          >
            <View style={[styles.actionCircle, { backgroundColor: colors.accent }]}>
              <ArrowUpRightIcon size={17} color={isDark ? '#FFFFFF' : colors.backgroundPure} weight="regular" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSubtle }]}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleMove}
            activeOpacity={0.7}
            style={[styles.actionButton, { width: actionWidth }]}
            accessibilityRole="button"
            accessibilityLabel={`Move note ${note.title} to folder`}
          >
            <View style={[styles.actionCircle, { backgroundColor: alpha(colors.text, 0.18) }]}>
              <FolderSimpleIcon size={17} color={colors.text} weight="regular" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSubtle }]}>Move</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDelete}
            activeOpacity={0.7}
            style={[styles.actionButton, { width: actionWidth }]}
            accessibilityRole="button"
            accessibilityLabel={`Delete note ${note.title}`}
          >
            <View style={[styles.actionCircle, { backgroundColor: colors.error }]}>
              <TrashIcon size={17} color={isDark ? '#FFFFFF' : colors.backgroundPure} weight="regular" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textSubtle }]}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Sliding card content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={contentStyle}
          accessible
          accessibilityRole="button"
          accessibilityLabel={note.title.trim() || 'Untitled note'}
          accessibilityActions={[
            { name: 'activate', label: 'Open note' },
            { name: 'share', label: 'Share note' },
            { name: 'move', label: 'Move note to folder' },
            { name: 'delete', label: 'Delete note' },
          ]}
          onAccessibilityAction={onAccessibilityAction}
        >
          <NoteCard note={note} onPress={handlePress} index={index} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
  },
  cardArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 10, // match NoteCard's marginBottom
    overflow: 'hidden',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  actionsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    flexShrink: 1,
  },
});
