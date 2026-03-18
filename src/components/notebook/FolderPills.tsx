import { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PlusIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import type { NoteFolder } from '@/lib/store';

interface FolderPillsProps {
  folders: NoteFolder[];
  activeFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onFolderLongPress: (folder: NoteFolder) => void;
}

/**
 * Horizontal scrollable row of folder pills for the notebook.
 * "All Notes" pill is always first (selected when activeFolderId is null).
 * A "+" button at the end lets users create new folders.
 */
export function FolderPills({
  folders,
  activeFolderId,
  onSelect,
  onCreateFolder,
  onFolderLongPress,
}: FolderPillsProps) {
  const { colors } = useTheme();

  const handleAllPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(null);
  }, [onSelect]);

  const handleCreatePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCreateFolder();
  }, [onCreateFolder]);

  const isAllActive = activeFolderId === null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollContainer}
      >
        {/* "All Notes" pill — always first */}
        <TouchableOpacity
          onPress={handleAllPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Show all notes"
          accessibilityState={{ selected: isAllActive }}
        >
          <View
            style={[
              styles.pill,
              {
                backgroundColor: isAllActive ? colors.accent + '18' : colors.buttonBackground,
                borderColor: isAllActive ? colors.accent + '40' : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                {
                  fontFamily: isAllActive ? FontFamily.uiMedium : FontFamily.ui,
                  color: isAllActive ? colors.accent : colors.textMuted,
                },
              ]}
            >
              All Notes
            </Text>
          </View>
        </TouchableOpacity>

        {/* Folder pills */}
        {folders.map((folder) => (
          <FolderPill
            key={folder.id}
            folder={folder}
            isActive={activeFolderId === folder.id}
            onPress={onSelect}
            onLongPress={onFolderLongPress}
            colors={colors}
          />
        ))}

        {/* Create folder "+" button */}
        <TouchableOpacity
          onPress={handleCreatePress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Create new folder"
        >
          <View
            style={[
              styles.addPill,
              {
                backgroundColor: colors.buttonBackground,
                borderColor: colors.border,
              },
            ]}
          >
            <PlusIcon size={14} color={colors.textMuted} weight="light" />
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Individual folder pill
// ---------------------------------------------------------------------------

interface FolderPillProps {
  folder: NoteFolder;
  isActive: boolean;
  onPress: (folderId: string | null) => void;
  onLongPress: (folder: NoteFolder) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

function FolderPill({ folder, isActive, onPress, onLongPress, colors }: FolderPillProps) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(folder.id);
  }, [folder.id, onPress]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(folder);
  }, [folder, onLongPress]);

  const pillBg = isActive ? colors.accent + '18' : colors.buttonBackground;
  const pillBorder = isActive ? colors.accent + '40' : colors.border;
  const pillTextColor = isActive ? colors.accent : colors.textMuted;
  const pillFontFamily = isActive ? FontFamily.uiMedium : FontFamily.ui;

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Filter by folder ${folder.name}`}
      accessibilityState={{ selected: isActive }}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: pillBg,
            borderColor: pillBorder,
          },
        ]}
      >
        {folder.color && (
          <View
            style={[
              styles.colorDot,
              { backgroundColor: folder.color },
            ]}
          />
        )}
        <Text
          style={[
            styles.pillText,
            {
              fontFamily: pillFontFamily,
              color: pillTextColor,
            },
          ]}
        >
          {folder.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    height: 32,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  pillText: {
    fontSize: 13,
    lineHeight: 18,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
