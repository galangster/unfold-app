/**
 * CreateFolderSheet — Modal bottom sheet for creating a new notebook folder.
 *
 * Uses React Native Modal for reliability across all screen contexts.
 * TextInput for folder name, optional color selection, Create button.
 * Sheet is fully opaque and renders above all other UI elements.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   Modal mounts, sheet starts at translateY = OFFSCREEN
 *   16ms   Sheet springs up to rest position (spring: damping 22, stiffness 220)
 *  ~350ms  Sheet settled, input auto-focuses
 *
 *  DISMISS (swipe or tap):
 *    0ms   Sheet slides down (withTiming 180ms)
 *  180ms   onClose() fires, Modal unmounts
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
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
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FolderSimplePlusIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Shadow } from '@/constants/shadows';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Button, alpha } from '@/components/ui';

// ---------------------------------------------------------------------------
// Animation config
// ---------------------------------------------------------------------------

const OFFSCREEN = 500;
const SLIDE_IN = { duration: Duration.slow, easing: Easing.out(Easing.cubic) };
const DISMISS_DURATION = 180;
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;

// ---------------------------------------------------------------------------
// Preset color options
// ---------------------------------------------------------------------------

const FOLDER_COLORS = [
  '#5B9BD5', // Ocean blue
  '#6DAF7B', // Forest green
  '#D4828F', // Rose
  '#D4895C', // Ember
  '#9B8EC4', // Lavender
  '#C8A55C', // Gold
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateFolderSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, color?: string, parentId?: string) => void;
  /** When set, creates a subfolder inside this parent */
  parentFolderId?: string;
  /** Display name of parent folder (shown as context in header) */
  parentFolderName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateFolderSheet({ visible, onClose, onSubmit, parentFolderId, parentFolderName }: CreateFolderSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(OFFSCREEN);
  const dismissing = useRef(false);

  const [folderName, setFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  const isCreateEnabled = folderName.trim().length > 0;

  // Spring in when sheet opens, reset state
  useEffect(() => {
    if (visible) {
      dismissing.current = false;
      setFolderName('');
      setSelectedColor(undefined);
      translateY.value = OFFSCREEN;
      translateY.value = withTiming(0, SLIDE_IN);
      const focusTimer = setTimeout(() => {
        inputRef.current?.focus();
      }, 350);
      return () => clearTimeout(focusTimer);
    }
  }, [visible, translateY]);

  const dismissSheet = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
    setTimeout(onClose, DISMISS_DURATION);
  }, [onClose, translateY]);

  const handleCreate = useCallback(() => {
    if (!isCreateEnabled || dismissing.current) return;
    dismissing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSubmit(folderName.trim(), selectedColor, parentFolderId);
    translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
    setTimeout(onClose, DISMISS_DURATION);
  }, [folderName, selectedColor, isCreateEnabled, onSubmit, onClose, translateY]);

  const handleColorSelect = useCallback((color: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedColor((prev) => (prev === color ? undefined : color));
  }, []);

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
            runOnJS(dismissSheet)();
          } else {
            translateY.value = withTiming(0, SLIDE_IN);
          }
        }),
    [dismissSheet, translateY],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
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
          {/* Transparent dismiss area (tap above sheet to close) */}
          <TouchableOpacity
            style={styles.dismissArea}
            activeOpacity={1}
            onPress={dismissSheet}
          />

          {/* Sheet — single unified surface, slides up from bottom */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.sheet,
                sheetAnimatedStyle,
                {
                  backgroundColor: colors.backgroundElevated,
                  paddingBottom: insets.bottom + 200,
                },
              ]}
            >
              {/* Handle indicator */}
              <View style={styles.handleRow}>
                <View style={[styles.handleBar, { backgroundColor: colors.borderStrong }]} />
              </View>

              <View style={styles.content}>
                {/* Header */}
                <View style={styles.headerRow}>
                  <FolderSimplePlusIcon size={20} color={colors.accent} weight="light" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: colors.text }]}>
                      {parentFolderName ? 'New Subfolder' : 'New Folder'}
                    </Text>
                    {parentFolderName && (
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                        Inside "{parentFolderName}"
                      </Text>
                    )}
                  </View>
                </View>

                {/* Folder name input */}
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.background,
                      borderColor: folderName.trim() ? alpha(colors.accent, 0.25) : colors.border,
                      borderWidth: 1,
                    },
                  ]}
                  placeholder="Folder name"
                  placeholderTextColor={colors.textHint}
                  value={folderName}
                  onChangeText={setFolderName}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                  maxLength={40}
                />

                {/* Color selection */}
                <View style={styles.colorSection}>
                  <Text style={[styles.colorLabel, { color: colors.textSubtle }]}>
                    COLOR (OPTIONAL)
                  </Text>
                  <View style={styles.colorRow}>
                    {FOLDER_COLORS.map((color) => {
                      const isSelected = selectedColor === color;
                      return (
                        <TouchableOpacity
                          key={color}
                          onPress={() => handleColorSelect(color)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Select color`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View
                            style={[
                              styles.colorCircle,
                              {
                                backgroundColor: color,
                                borderColor: isSelected ? colors.text : 'transparent',
                                borderWidth: isSelected ? 2 : 0,
                                transform: [{ scale: isSelected ? 1.15 : 1 }],
                              },
                            ]}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Create button */}
                <Button
                  variant="primary"
                  size="lg"
                  label="Create"
                  fullWidth
                  disabled={!isCreateEnabled}
                  onPress={handleCreate}
                  haptic={false}
                />
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
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  handleBar: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
  content: {
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['2'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing['5'],
  },
  title: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
  },
  input: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.base,
    paddingHorizontal: Spacing['4'],
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginBottom: Spacing['4'],
  },
  colorSection: {
    marginBottom: Spacing['5'],
  },
  colorLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 10,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 14,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.card,
  },
});
