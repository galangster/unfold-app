/**
 * BibleNoteSheet — bottom sheet for viewing / editing a scripture note.
 *
 * Opened from the "Note" action in the Bible reader's context menu when the
 * selected verse already has a note. Lets the user read, edit, or delete it.
 *
 * Uses a plain Modal + Animated.View instead of @gorhom/bottom-sheet to match
 * PremiumFeatureSheet and avoid the Reanimated v4 worklet freeze that library
 * causes in this project.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  Modal,
  Pressable,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { TrashIcon, PencilSimpleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import type { BibleHighlight } from '@/lib/store';

interface BibleNoteSheetProps {
  highlight: BibleHighlight | null;
  onClose: () => void;
  onSave: (id: string, note: string) => void;
  onDelete: (id: string) => void;
}

const DISMISS_THRESHOLD = 80;
const RUBBER_BAND_FACTOR = 0.3;

export function BibleNoteSheet({ highlight, onClose, onSave, onDelete }: BibleNoteSheetProps) {
  const { colors, isDark } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Keep last non-null highlight so the slide-out animation still has content.
  const [displayed, setDisplayed] = useState<BibleHighlight | null>(highlight);

  const visible = !!highlight;
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (highlight) {
      setDisplayed(highlight);
      setIsEditing(false);
      setDraft(highlight.note ?? '');
      translateY.value = 0;
    }
  }, [highlight?.id, highlight?.note, translateY]);

  const dismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      if (event.translationY < 0) {
        translateY.value = event.translationY * RUBBER_BAND_FACTOR;
      } else {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationY > DISMISS_THRESHOLD) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 300,
          mass: 0.5,
          overshootClamping: true,
        });
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const active = displayed;

  const handleSave = () => {
    if (!active) return;
    const trimmed = draft.trim();
    if (trimmed === (active.note ?? '').trim()) {
      setIsEditing(false);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(active.id, trimmed);
    setIsEditing(false);
    Keyboard.dismiss();
  };

  const handleDelete = () => {
    if (!active) return;
    Alert.alert(
      'Delete note?',
      'This will remove the note from this verse.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onDelete(active.id);
            onClose();
          },
        },
      ],
    );
  };

  if (!visible || !active) return null;

  const refStr = active.verseStart === active.verseEnd
    ? `${active.bookName} ${active.chapter}:${active.verseStart}`
    : `${active.bookName} ${active.chapter}:${active.verseStart}-${active.verseEnd}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(200)}
          style={styles.backdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            entering={SlideInDown.duration(350).damping(20).stiffness(200)}
            exiting={SlideOutDown.duration(250)}
            style={[
              styles.sheet,
              { backgroundColor: colors.backgroundElevated },
              sheetAnimatedStyle,
            ]}
          >
            <View style={styles.handleRow}>
              <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
            </View>

            <View style={styles.content}>
              <Text style={[styles.reference, { color: colors.accent }]}>
                {refStr} ({active.translation})
              </Text>
              <Text style={[styles.verseText, { color: colors.textSubtle }]} numberOfLines={3}>
                {active.text}
              </Text>

              {isEditing ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Write a note..."
                  placeholderTextColor={colors.textHint}
                  multiline
                  autoFocus
                  maxLength={1000}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    },
                  ]}
                />
              ) : (
                <Text style={[styles.noteBody, { color: colors.text }]}>
                  {active.note?.trim() || 'No note yet.'}
                </Text>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={handleDelete}
                  style={[styles.actionButton, { borderColor: colors.border }]}
                  activeOpacity={0.7}
                  accessibilityLabel="Delete note"
                >
                  <TrashIcon size={18} color={colors.error} weight="regular" />
                  <Text style={[styles.actionText, { color: colors.error }]}>Delete</Text>
                </TouchableOpacity>

                {isEditing ? (
                  <TouchableOpacity
                    onPress={handleSave}
                    style={[styles.saveButton, { backgroundColor: colors.accent }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.saveText, { color: '#FFFFFF' }]}>Save</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setIsEditing(true)}
                    style={[styles.actionButton, { borderColor: colors.border }]}
                    activeOpacity={0.7}
                    accessibilityLabel="Edit note"
                  >
                    <PencilSimpleIcon size={18} color={colors.text} weight="regular" />
                    <Text style={[styles.actionText, { color: colors.text }]}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingBottom: 34,
    maxHeight: '60%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
  },
  reference: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    marginBottom: 6,
  },
  verseText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing['4'],
    fontStyle: 'italic',
  },
  noteBody: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: 24,
    marginBottom: Spacing['6'],
    minHeight: 80,
  },
  input: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: 22,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing['3'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['3'],
    minHeight: 110,
    textAlignVertical: 'top',
    marginBottom: Spacing['4'],
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  actionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.card,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 14,
  },
});
