/**
 * CreateFolderSheet — Modal bottom sheet for creating a new notebook folder.
 *
 * Uses React Native Modal instead of @gorhom/bottom-sheet for reliability
 * across all screen contexts. TextInput for folder name, optional color
 * selection, Create button.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
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
import Animated, { FadeIn, SlideInDown, SlideOutDown, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FolderSimplePlusIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

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
  onSubmit: (name: string, color?: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateFolderSheet({ visible, onClose, onSubmit }: CreateFolderSheetProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const [folderName, setFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  const isCreateEnabled = folderName.trim().length > 0;

  // Reset state and focus input when sheet opens
  useEffect(() => {
    if (visible) {
      setFolderName('');
      setSelectedColor(undefined);
      const focusTimer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(focusTimer);
    }
  }, [visible]);

  const handleCreate = useCallback(() => {
    if (!isCreateEnabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSubmit(folderName.trim(), selectedColor);
    onClose();
  }, [folderName, selectedColor, isCreateEnabled, onSubmit, onClose]);

  const handleColorSelect = useCallback((color: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedColor((prev) => (prev === color ? undefined : color));
  }, []);

  const handleBackdropPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleBackdropPress}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.backdropFill}
          />
        </TouchableOpacity>

        {/* Sheet content */}
        <Animated.View
          entering={SlideInDown.duration(300)}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.inputBackground,
            },
          ]}
        >
          {/* Handle indicator */}
          <View style={styles.handleRow}>
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.content}>
            {/* Header */}
            <View style={styles.headerRow}>
              <FolderSimplePlusIcon size={20} color={colors.accent} weight="light" />
              <Text style={[styles.title, { color: colors.text }]}>
                New Folder
              </Text>
            </View>

            {/* Folder name input */}
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: folderName.trim() ? colors.accent + '40' : colors.border,
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
            <TouchableOpacity
              onPress={handleCreate}
              disabled={!isCreateEnabled}
              activeOpacity={0.7}
              style={[
                styles.createButton,
                {
                  backgroundColor: isCreateEnabled ? colors.accent : colors.border,
                  opacity: isCreateEnabled ? 1 : 0.5,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create folder"
              accessibilityState={{ disabled: !isCreateEnabled }}
            >
              <Text style={[styles.createButtonText, { color: colors.background }]}>
                Create
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 56,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  input: {
    fontFamily: FontFamily.ui,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  colorSection: {
    marginBottom: 20,
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
    borderRadius: 14,
  },
  createButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  createButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
