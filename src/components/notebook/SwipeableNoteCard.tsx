import { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { NoteCard } from './NoteCard';
import type { Note } from '@/lib/store';

const ACTION_WIDTH = 56;
const TOTAL_ACTIONS_WIDTH = ACTION_WIDTH * 3;
const SNAP_THRESHOLD = TOTAL_ACTIONS_WIDTH * 0.35;

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
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

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
          translateX.value = clamp(raw, -TOTAL_ACTIONS_WIDTH, 0);
        })
        .onEnd((e) => {
          const isOpen = translateX.value < -SNAP_THRESHOLD;
          const isFlick = e.velocityX < -500;

          if (isOpen || isFlick) {
            translateX.value = withTiming(-TOTAL_ACTIONS_WIDTH, TIMING_CONFIG);
          } else {
            translateX.value = withTiming(0, TIMING_CONFIG);
          }
        }),
    [contextX, translateX],
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, TOTAL_ACTIONS_WIDTH * 0.4, TOTAL_ACTIONS_WIDTH],
      [0, 0.7, 1],
    ),
  }));

  return (
    <View style={styles.outerContainer}>
      {/* Action buttons — positioned inside the card area only */}
      <View style={styles.cardArea}>
        <Animated.View style={[styles.actionsContainer, actionsStyle]}>
          <TouchableOpacity
            onPress={handleShare}
            activeOpacity={0.7}
            style={styles.actionButton}
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
            style={styles.actionButton}
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
            style={styles.actionButton}
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
        <Animated.View style={contentStyle}>
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
    width: TOTAL_ACTIONS_WIDTH,
    paddingRight: 4,
  },
  actionButton: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
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
  },
});
