/**
 * FolderChips — Horizontal scrollable folder filter pills with subfolder support.
 *
 * Shows breadcrumb navigation when inside a subfolder.
 * "All" chip shows top-level. Tapping a folder with children drills in.
 * Tapping a breadcrumb navigates back up.
 */

import { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PlusIcon, CaretRightIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
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
  /** Current parent folder for subfolder navigation (null = top-level) */
  currentParentId?: string | null;
  /** Called when user drills into a folder to see its subfolders */
  onDrillInto?: (folderId: string | null) => void;
}

export function FolderChips({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onFolderLongPress,
  compact = false,
  currentParentId = null,
  onDrillInto,
}: FolderChipsProps) {
  const { colors } = useTheme();

  // Build breadcrumb trail from root to current parent
  const breadcrumbs = useMemo(() => {
    if (!currentParentId) return [];
    const crumbs: NoteFolder[] = [];
    let current = folders.find((f) => f.id === currentParentId);
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find((f) => f.id === current!.parentId) : undefined;
    }
    return crumbs;
  }, [currentParentId, folders]);

  // Show folders at the current level
  const visibleFolders = useMemo(() => {
    return [...folders]
      .filter((f) => (f.parentId ?? null) === currentParentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [folders, currentParentId]);

  // Check if a folder has children
  const hasChildren = useCallback(
    (folderId: string) => folders.some((f) => f.parentId === folderId),
    [folders],
  );

  const handleFolderPress = useCallback(
    (folderId: string | null) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelectFolder(folderId);
    },
    [onSelectFolder],
  );

  const handleDrillIn = useCallback(
    (folderId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (onDrillInto) {
        onDrillInto(folderId);
      }
    },
    [onDrillInto],
  );

  return (
    <View>
      {/* Breadcrumb trail when inside a subfolder */}
      {breadcrumbs.length > 0 && (
        <View style={[styles.breadcrumbRow, compact && { paddingHorizontal: 0 }]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDrillInto?.(null);
              onSelectFolder(null);
            }}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.breadcrumbText, { color: colors.textMuted }]}>All</Text>
          </TouchableOpacity>
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <View key={crumb.id} style={styles.breadcrumbSegment}>
                <CaretRightIcon size={10} color={colors.textSubtle} weight="bold" />
                <TouchableOpacity
                  onPress={() => {
                    if (!isLast) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onDrillInto?.(crumb.id);
                      onSelectFolder(crumb.id);
                    }
                  }}
                  activeOpacity={isLast ? 1 : 0.6}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text
                    style={[
                      styles.breadcrumbText,
                      { color: isLast ? colors.text : colors.textMuted },
                      isLast && { fontFamily: FontFamily.uiMedium },
                    ]}
                    numberOfLines={1}
                  >
                    {crumb.name}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          compact && { paddingHorizontal: 0, paddingRight: 24 },
        ]}
        style={styles.scrollContainer}
      >
        {/* "All" chip — only at top level */}
        {!currentParentId && (
          <FolderChip
            folderId={null}
            label="All"
            color={null}
            isActive={activeFolderId === null}
            onPress={handleFolderPress}
            colors={colors}
          />
        )}

        {/* Folders at this level */}
        {visibleFolders.map((folder) => (
          <FolderChip
            key={folder.id}
            folderId={folder.id}
            folder={folder}
            label={folder.name}
            color={folder.color ?? null}
            isActive={activeFolderId === folder.id}
            hasChildren={hasChildren(folder.id)}
            onPress={handleFolderPress}
            onDrillIn={onDrillInto ? handleDrillIn : undefined}
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
  hasChildren?: boolean;
  onPress: (folderId: string | null) => void;
  onDrillIn?: (folderId: string) => void;
  onLongPress?: (folder: NoteFolder) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

function FolderChip({ folderId, folder, label, color, isActive, hasChildren, onPress, onDrillIn, onLongPress, colors }: FolderChipProps) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (folderId) {
      onPress(folderId);
    } else {
      onPress(null);
    }
  }, [folderId, onPress]);

  const handleLongPress = useCallback(() => {
    if (folder && onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress(folder);
    } else if (folder && hasChildren && onDrillIn) {
      // Long-press drills into subfolder
      onDrillIn(folder.id);
    }
  }, [folder, onLongPress, hasChildren, onDrillIn]);

  const pillBg = isActive
    ? alpha(colors.accent, 0.09)
    : colors.buttonBackground;

  const pillBorder = isActive
    ? alpha(colors.accent, 0.25)
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
        {/* Chevron indicator for folders with subfolders */}
        {hasChildren && folderId && onDrillIn && (
          <TouchableOpacity
            onPress={() => onDrillIn(folderId)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            activeOpacity={0.6}
          >
            <CaretRightIcon size={11} color={pillTextColor} weight="bold" style={{ marginLeft: -2 }} />
          </TouchableOpacity>
        )}
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
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 4,
  },
  breadcrumbSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breadcrumbText: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
  },
});
