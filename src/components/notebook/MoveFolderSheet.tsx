/**
 * MoveFolderSheet — Modal bottom sheet for moving a note to a folder.
 *
 * Uses React Native Modal for reliable rendering across all screen contexts.
 * Lists all folders plus an "Unfiled" option. A check mark indicates
 * the currently assigned folder. Tapping a folder calls onSelect
 * and dismisses the sheet.
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, SlideInDown, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  FolderSimpleIcon,
  FolderSimplePlusIcon,
  TrayIcon,
  CheckIcon,
  NoteIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import type { NoteFolder } from '@/lib/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MoveFolderSheetProps {
  visible: boolean;
  onClose: () => void;
  folders: NoteFolder[];
  currentFolderId?: string;
  onSelect: (folderId: string | null) => void;
  /** Override sheet title (default: "Move to Folder") */
  title?: string;
  /** Show "All Notes" option at top (for folder picker/filter mode) */
  showAllNotes?: boolean;
  /** Show "Create New Folder" button at bottom */
  onCreateFolder?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MoveFolderSheet({
  visible,
  onClose,
  folders,
  currentFolderId,
  onSelect,
  title = 'Move to Folder',
  showAllNotes = false,
  onCreateFolder,
}: MoveFolderSheetProps) {
  const { colors } = useTheme();

  const handleSelect = useCallback(
    (folderId: string | null) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(folderId);
      onClose();
    },
    [onSelect, onClose],
  );

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
      <View style={styles.modalContainer}>
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
            <Text style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {/* "All Notes" option — only in filter/picker mode */}
              {showAllNotes && (
                <TouchableOpacity
                  onPress={() => handleSelect(null)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Show all notes"
                  accessibilityState={{ selected: currentFolderId === undefined || currentFolderId === null }}
                  style={[
                    styles.folderRow,
                    {
                      backgroundColor: !currentFolderId ? colors.accent + '0A' : 'transparent',
                    },
                  ]}
                >
                  <NoteIcon
                    size={18}
                    color={!currentFolderId ? colors.accent : colors.textMuted}
                    weight="light"
                  />
                  <Text
                    style={[
                      styles.folderName,
                      {
                        color: !currentFolderId ? colors.accent : colors.text,
                        fontFamily: !currentFolderId ? FontFamily.uiMedium : FontFamily.ui,
                      },
                    ]}
                  >
                    All Notes
                  </Text>
                  {!currentFolderId && (
                    <CheckIcon size={16} color={colors.accent} weight="bold" />
                  )}
                </TouchableOpacity>
              )}

              {/* Unfiled option — only in move-note mode (not filter mode) */}
              {!showAllNotes && (
                <TouchableOpacity
                  onPress={() => handleSelect(null)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Move to unfiled"
                  accessibilityState={{ selected: !currentFolderId }}
                  style={[
                    styles.folderRow,
                    {
                      backgroundColor: !currentFolderId ? colors.accent + '0A' : 'transparent',
                    },
                  ]}
                >
                  <TrayIcon
                    size={18}
                    color={!currentFolderId ? colors.accent : colors.textMuted}
                    weight="light"
                  />
                  <Text
                    style={[
                      styles.folderName,
                      {
                        color: !currentFolderId ? colors.accent : colors.text,
                        fontFamily: !currentFolderId ? FontFamily.uiMedium : FontFamily.ui,
                      },
                    ]}
                  >
                    Unfiled
                  </Text>
                  {!currentFolderId && (
                    <CheckIcon size={16} color={colors.accent} weight="bold" />
                  )}
                </TouchableOpacity>
              )}

              {/* Divider */}
              {folders.length > 0 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}

              {/* Folder list */}
              {folders.map((folder) => {
                const isSelected = currentFolderId === folder.id;
                return (
                  <TouchableOpacity
                    key={folder.id}
                    onPress={() => handleSelect(folder.id)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`${showAllNotes ? 'Filter by' : 'Move to'} ${folder.name}`}
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.folderRow,
                      {
                        backgroundColor: isSelected ? colors.accent + '0A' : 'transparent',
                      },
                    ]}
                  >
                    {folder.color ? (
                      <View style={[styles.folderColorDot, { backgroundColor: folder.color }]} />
                    ) : (
                      <FolderSimpleIcon
                        size={18}
                        color={isSelected ? colors.accent : colors.textMuted}
                        weight="light"
                      />
                    )}
                    <Text
                      style={[
                        styles.folderName,
                        {
                          color: isSelected ? colors.accent : colors.text,
                          fontFamily: isSelected ? FontFamily.uiMedium : FontFamily.ui,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {folder.name}
                    </Text>
                    {isSelected && (
                      <CheckIcon size={16} color={colors.accent} weight="bold" />
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Create New Folder option */}
              {onCreateFolder && (
                <>
                  {folders.length > 0 && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onClose();
                      onCreateFolder();
                    }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel="Create new folder"
                    style={styles.folderRow}
                  >
                    <FolderSimplePlusIcon
                      size={18}
                      color={colors.textMuted}
                      weight="light"
                    />
                    <Text
                      style={[
                        styles.folderName,
                        {
                          color: colors.textMuted,
                          fontFamily: FontFamily.ui,
                        },
                      ]}
                    >
                      New Folder
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {folders.length === 0 && !onCreateFolder && (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    No folders yet.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>
      </View>
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
    paddingBottom: 40,
    maxHeight: '60%',
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
    paddingTop: 8,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    letterSpacing: -0.3,
    paddingHorizontal: 28,
    marginBottom: 16,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
  folderName: {
    fontSize: 15,
    flex: 1,
  },
  folderColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    textAlign: 'center',
  },
});
