/**
 * MoveFolderSheet — Modal bottom sheet for moving a note to a folder.
 *
 * Uses React Native Modal for reliable rendering across all screen contexts.
 * Lists all folders plus an "Unfiled" option. A check mark indicates
 * the currently assigned folder. Tapping a folder calls onSelect
 * and dismisses the sheet.
 *
 * When `onReorder` is provided, drag handles appear on each folder row.
 * Long-press the handle to start dragging, release to commit the new order.
 *
 * ANIMATION STORYBOARD
 *
 *    0ms   Modal mounts, sheet starts at translateY = OFFSCREEN
 *   16ms   Sheet springs up to rest position (spring: damping 22, stiffness 220)
 *  ~350ms  Sheet settled
 *
 *  DISMISS (swipe or tap):
 *    0ms   Sheet slides down (withTiming 180ms)
 *  180ms   onClose() fires, Modal unmounts
 *
 *  DRAG REORDER:
 *    0ms   Long-press on grip dots — row lifts (scale 1.02, shadow)
 *   ∞ms   Pan moves row, crossing ROW_HEIGHT threshold swaps positions
 *   end   Row settles, reorderFolders called
 */

import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  FolderSimpleIcon,
  FolderSimplePlusIcon,
  TrayIcon,
  CheckIcon,
  NoteIcon,
  DotsSixVerticalIcon,
  TrashIcon,
  CaretRightIcon,
  CaretLeftIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Shadow } from '@/constants/shadows';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import type { NoteFolder } from '@/lib/store';

// ---------------------------------------------------------------------------
// Animation config
// ---------------------------------------------------------------------------

const OFFSCREEN = 500;
// Critically-damped spring for sheet entrance and gesture snap-back.
// Callers on release paths MUST spread this and pass `velocity: e.velocityY`
// so remaining gesture momentum carries into the snap-back. No bounce
// (dampingRatio: 1).
const SLIDE_SPRING = { duration: Duration.slow, dampingRatio: 1 } as const;
const DISMISS_DURATION = 180;
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;
const ROW_HEIGHT = 46;

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
  /** When provided, enables drag-to-reorder with grip dots */
  onReorder?: (orderedIds: string[]) => void;
  /** When provided, shows a trash icon on each folder row */
  onDeleteFolder?: (folderId: string) => void;
  /** Current parent folder being viewed — filters to show only siblings at this level */
  currentParentId?: string | null;
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
  onReorder,
  onDeleteFolder,
  currentParentId: initialParentId = null,
}: MoveFolderSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(OFFSCREEN);
  const dismissing = useRef(false);

  // Local ordered copy of folders for drag-to-reorder
  const [orderedFolders, setOrderedFolders] = useState<NoteFolder[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Sheet-local navigation level for drilling into subfolders
  const [sheetParentId, setSheetParentId] = useState<string | null>(initialParentId ?? null);

  // Reset sheet parent when opening
  useEffect(() => {
    if (visible) {
      setSheetParentId(initialParentId ?? null);
    }
  }, [visible, initialParentId]);

  // Filter folders to only show siblings at the current sheet level
  const levelFolders = useMemo(() => {
    return [...folders]
      .filter((f) => (f.parentId ?? null) === sheetParentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [folders, sheetParentId]);

  // Check if a folder has children
  const hasChildren = useCallback(
    (folderId: string) => folders.some((f) => f.parentId === folderId),
    [folders],
  );

  // Build breadcrumb for current sheet level
  const sheetBreadcrumbs = useMemo(() => {
    if (!sheetParentId) return [];
    const crumbs: NoteFolder[] = [];
    let current = folders.find((f) => f.id === sheetParentId);
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find((f) => f.id === current!.parentId) : undefined;
    }
    return crumbs;
  }, [sheetParentId, folders]);

  // Sync local order when folders prop changes or sheet opens — use level-filtered folders
  useEffect(() => {
    if (visible) {
      setOrderedFolders(levelFolders);
    }
  }, [visible, levelFolders]);

  // Spring in when sheet opens, reset when it closes
  useEffect(() => {
    if (visible) {
      dismissing.current = false;
      translateY.value = OFFSCREEN;
      translateY.value = withSpring(0, SLIDE_SPRING);
    }
  }, [visible, translateY]);

  const dismissSheet = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Commit any reorder on dismiss
    if (onReorder && orderedFolders.length > 0) {
      onReorder(orderedFolders.map((f) => f.id));
    }
    translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
    setTimeout(onClose, DISMISS_DURATION);
  }, [onClose, translateY, onReorder, orderedFolders]);

  const handleSelect = useCallback(
    (folderId: string | null) => {
      if (dismissing.current) return;
      dismissing.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(folderId);
      // Commit any reorder on select
      if (onReorder && orderedFolders.length > 0) {
        onReorder(orderedFolders.map((f) => f.id));
      }
      translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
      setTimeout(onClose, DISMISS_DURATION);
    },
    [onSelect, onClose, translateY, onReorder, orderedFolders],
  );

  const handleSwapFolders = useCallback(
    (fromId: string, direction: 'up' | 'down') => {
      setOrderedFolders((prev) => {
        const idx = prev.findIndex((f) => f.id === fromId);
        if (idx < 0) return prev;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
        return next;
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [],
  );

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
            // Spring handoff: feed remaining gesture velocity into the snap-back
            translateY.value = withSpring(0, { ...SLIDE_SPRING, velocity: e.velocityY });
          }
        }),
    [dismissSheet, translateY],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const displayFolders = onReorder ? orderedFolders : levelFolders;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissSheet}
    >
      <GestureHandlerRootView style={styles.modalContainer}>
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
              <Text style={[styles.title, { color: colors.text }]}>
                {title}
              </Text>

              {/* Breadcrumb navigation when drilled into a subfolder */}
              {sheetBreadcrumbs.length > 0 && (
                <View style={styles.breadcrumbRow}>
                  <TouchableOpacity
                    onPress={() => {
                      const parentFolder = sheetBreadcrumbs.length > 1
                        ? sheetBreadcrumbs[sheetBreadcrumbs.length - 2]
                        : null;
                      setSheetParentId(parentFolder?.id ?? null);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.6}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel="Go back to parent folder"
                  >
                    <CaretLeftIcon size={14} color={colors.accent} weight="bold" />
                    <Text style={[styles.breadcrumbText, { color: colors.accent }]}>
                      {sheetBreadcrumbs.length > 1
                        ? sheetBreadcrumbs[sheetBreadcrumbs.length - 2].name
                        : 'All Folders'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                scrollEnabled={!draggingId}
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
                        backgroundColor: !currentFolderId ? alpha(colors.accent, 0.04) : 'transparent',
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
                        backgroundColor: !currentFolderId ? alpha(colors.accent, 0.04) : 'transparent',
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
                {displayFolders.length > 0 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}

                {/* Folder list */}
                {displayFolders.map((folder) => {
                  const isSelected = currentFolderId === folder.id;
                  const isDragging = draggingId === folder.id;
                  const folderHasChildren = hasChildren(folder.id);
                  return (
                    <DraggableFolderRow
                      key={folder.id}
                      folder={folder}
                      isSelected={isSelected}
                      isDragging={isDragging}
                      showDragHandle={!!onReorder}
                      showDeleteButton={!!onDeleteFolder}
                      showAllNotes={showAllNotes}
                      hasChildren={folderHasChildren}
                      colors={colors}
                      onSelect={() => handleSelect(folder.id)}
                      onDrillIn={folderHasChildren ? () => {
                        setSheetParentId(folder.id);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } : undefined}
                      onSwap={handleSwapFolders}
                      onDragStart={() => setDraggingId(folder.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onDelete={onDeleteFolder ? () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        // Optimistically remove from local list
                        setOrderedFolders((prev) => prev.filter((f) => f.id !== folder.id));
                        onDeleteFolder(folder.id);
                      } : undefined}
                    />
                  );
                })}

                {/* Create New Folder option */}
                {onCreateFolder && (
                  <>
                    {displayFolders.length > 0 && (
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

                {displayFolders.length === 0 && !onCreateFolder && (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                      No folders yet.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Draggable folder row
// ---------------------------------------------------------------------------

interface DraggableFolderRowProps {
  folder: NoteFolder;
  isSelected: boolean;
  isDragging: boolean;
  showDragHandle: boolean;
  showDeleteButton: boolean;
  showAllNotes: boolean;
  hasChildren?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onSelect: () => void;
  onDrillIn?: () => void;
  onSwap: (folderId: string, direction: 'up' | 'down') => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete?: () => void;
}

function DraggableFolderRow({
  folder,
  isSelected,
  isDragging,
  showDragHandle,
  showDeleteButton,
  showAllNotes,
  hasChildren,
  colors,
  onSelect,
  onDrillIn,
  onSwap,
  onDragStart,
  onDragEnd,
  onDelete,
}: DraggableFolderRowProps) {
  const dragOffsetY = useSharedValue(0);
  const rowScale = useSharedValue(1);
  const cumulativeSwap = useRef(0);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(200)
        .onStart(() => {
          cumulativeSwap.current = 0;
          rowScale.value = withTiming(1.02, { duration: 120 });
          runOnJS(onDragStart)();
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        })
        .onUpdate((e) => {
          dragOffsetY.value = e.translationY;
          // Check if we've crossed a row threshold
          const swapCount = Math.round(e.translationY / ROW_HEIGHT);
          if (swapCount !== cumulativeSwap.current) {
            const direction = swapCount > cumulativeSwap.current ? 'down' : 'up';
            cumulativeSwap.current = swapCount;
            runOnJS(onSwap)(folder.id, direction);
          }
        })
        .onEnd(() => {
          dragOffsetY.value = withTiming(0, { duration: Duration.fast });
          rowScale.value = withTiming(1, { duration: Duration.fast });
          runOnJS(onDragEnd)();
        }),
    [folder.id, onSwap, onDragStart, onDragEnd, dragOffsetY, rowScale],
  );

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dragOffsetY.value },
      { scale: rowScale.value },
    ],
    zIndex: rowScale.value > 1 ? 10 : 0,
  }));

  return (
    <Animated.View style={animatedRowStyle}>
      <TouchableOpacity
        onPress={onSelect}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`${showAllNotes ? 'Filter by' : 'Move to'} ${folder.name}`}
        accessibilityState={{ selected: isSelected }}
        style={[
          styles.folderRow,
          {
            backgroundColor: isDragging
              ? colors.backgroundElevated
              : isSelected
                ? alpha(colors.accent, 0.04)
                : 'transparent',
            shadowColor: isDragging ? '#000' : 'transparent',
            shadowOffset: { width: 0, height: isDragging ? 2 : 0 },
            shadowOpacity: isDragging ? 0.15 : 0,
            shadowRadius: isDragging ? 8 : 0,
            elevation: isDragging ? 8 : 0,
          },
        ]}
      >
        {/* Drag handle — only shown when reorder is enabled */}
        {showDragHandle && (
          <GestureDetector gesture={dragGesture}>
            <Animated.View
              style={styles.dragHandle}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <DotsSixVerticalIcon
                size={16}
                color={colors.textSubtle}
                weight="bold"
              />
            </Animated.View>
          </GestureDetector>
        )}

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
        {/* Drill-in chevron for folders with subfolders */}
        {hasChildren && onDrillIn && !showDeleteButton && (
          <TouchableOpacity
            onPress={onDrillIn}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`View subfolders of ${folder.name}`}
            style={styles.drillInButton}
          >
            <CaretRightIcon size={14} color={colors.textSubtle} weight="bold" />
          </TouchableOpacity>
        )}
        {isSelected && !showDeleteButton && (
          <CheckIcon size={16} color={colors.accent} weight="bold" />
        )}
        {showDeleteButton && onDelete && (
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${folder.name}`}
            style={styles.deleteButton}
          >
            <TrashIcon size={16} color={colors.error} weight="light" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </Animated.View>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    ...Shadow.sheet,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingTop: Spacing['2'],
  },
  title: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
    paddingHorizontal: Spacing['7'],
    marginBottom: Spacing['4'],
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['4'],
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
  dragHandle: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginLeft: -8,
    marginRight: -4,
  },
  deleteButton: {
    padding: 6,
    marginRight: -6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing['4'],
    marginVertical: 4,
  },
  emptyState: {
    paddingVertical: Spacing['6'],
    paddingHorizontal: Spacing['4'],
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['7'],
    paddingBottom: Spacing['3'],
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breadcrumbText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
  },
  drillInButton: {
    padding: 6,
    marginRight: -6,
  },
});
