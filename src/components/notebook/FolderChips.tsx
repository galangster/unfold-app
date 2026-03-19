/**
 * FolderChips — Horizontal scrollable folder filter pills.
 *
 * Replaces the old hardcoded CategoryPills with user-created folders.
 * "All" chip first, then each folder as a color-coded chip.
 * Active chip gets accent-tinted background; inactive is subtle.
 */

import { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PlusIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import type { NoteFolder } from '@/lib/store';

interface FolderChipsProps {
  folders: NoteFolder[];
  activeFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  /** Called when user taps the "+" chip to create a new folder */
  onCreateFolder?: () => void;
  /** Called on long-press of a folder chip (for rename/delete menu) */
  onFolderLongPress?: (folder: NoteFolder) => void;
  /** Remove left padding when used inline alongside other elements */
  compact?: boolean;
}

export function FolderChips({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onFolderLongPress,
  compact = false,
}: FolderChipsProps) {
  const { colors } = useTheme();

  const sortedFolders = [...folders].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          compact && { paddingHorizontal: 0, paddingRight: 24 },
        ]}
        style={styles.scrollContainer}
      >
        {/* "All" chip */}
        <FolderChip
          folderId={null}
          label="All"
          color={null}
          isActive={activeFolderId === null}
          onPress={onSelectFolder}
          colors={colors}
        />

        {/* User folders */}
        {sortedFolders.map((folder) => (
          <FolderChip
            key={folder.id}
            folderId={folder.id}
            folder={folder}
            label={folder.name}
            color={folder.color ?? null}
            isActive={activeFolderId === folder.id}
            onPress={onSelectFolder}
            onLongPress={onFolderLongPress}
            colors={colors}
          />
        ))}

        {/* Add folder chip */}
        {onCreateFolder && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCreateFolder();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Create new folder"
          >
            <View
              style={[
                styles.pill,
                styles.addPill,
                {
                  borderColor: colors.border,
                  borderStyle: 'dashed',
                },
              ]}
            >
              <PlusIcon size={14} color={colors.textMuted} weight="bold" />
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

interface FolderChipProps {
  folderId: string | null;
  folder?: NoteFolder;
  label: string;
  color: string | null;
  isActive: boolean;
  onPress: (folderId: string | null) => void;
  onLongPress?: (folder: NoteFolder) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

function FolderChip({ folderId, folder, label, color, isActive, onPress, onLongPress, colors }: FolderChipProps) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(folderId);
  }, [folderId, onPress]);

  const handleLongPress = useCallback(() => {
    if (folder && onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress(folder);
    }
  }, [folder, onLongPress]);

  const pillBg = isActive
    ? colors.accent + '18'
    : colors.buttonBackground;

  const pillBorder = isActive
    ? colors.accent + '40'
    : colors.border;

  const pillTextColor = isActive ? colors.accent : colors.textMuted;
  const pillFontFamily = isActive ? FontFamily.uiMedium : FontFamily.ui;

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={folder ? handleLongPress : undefined}
      delayLongPress={400}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${label}`}
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
        {/* Color dot for folders with a color */}
        {color && (
          <View style={[styles.colorDot, { backgroundColor: color }]} />
        )}
        <Text
          style={[
            styles.pillText,
            {
              fontFamily: pillFontFamily,
              color: pillTextColor,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 13,
    lineHeight: 18,
  },
  addPill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
  },
});
