import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  DotsThreeIcon,
  MicrophoneStageIcon,
  SunHorizonIcon,
  BookOpenIcon,
  HandsPrayingIcon,
  NoteIcon,
  TrashIcon,
  TagIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Note, type NoteCategory } from '@/lib/store';
import { NoteEditor } from '@/components/notebook/NoteEditor';
import { logger } from '@/lib/logger';

const CATEGORY_OPTIONS: { key: NoteCategory; label: string; Icon: typeof NoteIcon }[] = [
  { key: 'sermon', label: 'Sermon', Icon: MicrophoneStageIcon },
  { key: 'quiet-time', label: 'Quiet Time', Icon: SunHorizonIcon },
  { key: 'study', label: 'Study', Icon: BookOpenIcon },
  { key: 'prayer', label: 'Prayer', Icon: HandsPrayingIcon },
  { key: 'general', label: 'General', Icon: NoteIcon },
];

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    noteId?: string;
    devotionalId?: string;
    dayNumber?: string;
    bookId?: string;
    chapter?: string;
    verse?: string;
    verseEnd?: string;
    verseText?: string;
    reference?: string;
  }>();

  const { colors } = useTheme();
  const notes = useUnfoldStore((s) => s.notes);
  const addNote = useUnfoldStore((s) => s.addNote);
  const updateNote = useUnfoldStore((s) => s.updateNote);
  const deleteNote = useUnfoldStore((s) => s.deleteNote);

  // Find existing note if editing
  const existingNote = params.noteId
    ? notes.find((n) => n.id === params.noteId)
    : undefined;

  // Track the note ID (may be set after first auto-save for new notes)
  const [noteId, setNoteId] = useState<string | undefined>(params.noteId);
  const [category, setCategory] = useState<NoteCategory>(
    existingNote?.category ?? 'general'
  );
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Track the latest content so the Done button can persist on tap
  const latestContentRef = useRef<{ title: string; content: string }>({
    title: existingNote?.title ?? '',
    content: existingNote?.content ?? '',
  });

  // Clean up delete timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);

  /**
   * Persist the note and navigate back.
   * Called by the "Done" header button (no data param — reads from latestContentRef).
   */
  const handleDone = useCallback(() => {
    const { title, content } = latestContentRef.current;
    if (!title.trim() && !content.trim()) {
      router.back();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (noteId) {
      updateNote(noteId, { title, content, category });
    } else {
      const id = addNote({
        title,
        content,
        category,
        tags: [],
        isFavorite: false,
        scriptureRefs: [],
        devotionalId: params.devotionalId,
        dayNumber: params.dayNumber ? Number(params.dayNumber) : undefined,
        bibleBookId: params.bookId ? Number(params.bookId) : undefined,
        bibleChapter: params.chapter ? Number(params.chapter) : undefined,
      });
      setNoteId(id);
      logger.log('[NoteEditor] Created new note on Done:', id);
    }

    router.back();
  }, [noteId, category, params, addNote, updateNote, router]);

  /**
   * Called by NoteEditor's onSave (manual save).
   */
  const handleEditorSave = useCallback(
    (data: { title: string; content: string }) => {
      latestContentRef.current = data;
      handleDone();
    },
    [handleDone],
  );

  /**
   * Called by NoteEditor's onAutoSave (800ms debounce).
   * Persists to store and keeps latestContentRef in sync.
   */
  const handleAutoSave = useCallback(
    (data: { title: string; content: string }) => {
      latestContentRef.current = data;
      const isEmptyHtml = data.content === '<p></p>' || data.content === '';
      if (!data.title.trim() && isEmptyHtml) return;

      if (noteId) {
        updateNote(noteId, {
          title: data.title,
          content: data.content,
          category,
        });
      } else {
        const id = addNote({
          title: data.title,
          content: data.content,
          category,
          tags: [],
          isFavorite: false,
          scriptureRefs: [],
          devotionalId: params.devotionalId,
          dayNumber: params.dayNumber ? Number(params.dayNumber) : undefined,
          bibleBookId: params.bookId ? Number(params.bookId) : undefined,
          bibleChapter: params.chapter ? Number(params.chapter) : undefined,
        });
        setNoteId(id);
        logger.log('[NoteEditor] Auto-saved new note:', id);
      }
    },
    [noteId, category, params, addNote, updateNote]
  );

  const handleBack = useCallback(() => {
    // Auto-save fires via the NoteEditor's debounce, so just navigate back
    router.back();
  }, [router]);

  const handleDelete = useCallback(() => {
    if (!noteId) {
      router.back();
      return;
    }

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Reset after 3 seconds
      deleteTimeoutRef.current = setTimeout(() => {
        setDeleteConfirm(false);
      }, 3000);
      return;
    }

    // Second tap — actually delete
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteNote(noteId);
    setShowMoreMenu(false);
    router.back();
  }, [noteId, deleteConfirm, deleteNote, router]);

  const handleCategorySelect = useCallback(
    (cat: NoteCategory) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCategory(cat);
      setShowCategoryPicker(false);
      setShowMoreMenu(false);

      // Persist immediately if note already exists
      if (noteId) {
        updateNote(noteId, { category: cat });
      }
    },
    [noteId, updateNote]
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Header bar */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleDone}
              style={styles.doneButton}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Save and go back"
            >
              <Text style={[styles.doneText, { color: colors.accent }]}>
                Done
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowMoreMenu(!showMoreMenu);
                setShowCategoryPicker(false);
                setDeleteConfirm(false);
              }}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <DotsThreeIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          </View>
        </View>

        {/* More menu dropdown */}
        {showMoreMenu && (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={[
              styles.moreMenu,
              {
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.border,
                shadowColor: '#000',
              },
            ]}
          >
            {/* Category picker toggle */}
            <TouchableOpacity
              onPress={() => {
                setShowCategoryPicker(!showCategoryPicker);
                setDeleteConfirm(false);
              }}
              style={styles.menuItem}
              activeOpacity={0.6}
            >
              <TagIcon size={16} color={colors.textMuted} weight="light" />
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                Category: {CATEGORY_OPTIONS.find((c) => c.key === category)?.label ?? 'General'}
              </Text>
            </TouchableOpacity>

            {/* Inline category picker */}
            {showCategoryPicker && (
              <View style={styles.categoryPickerInline}>
                {CATEGORY_OPTIONS.map((cat) => {
                  const isActive = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      onPress={() => handleCategorySelect(cat.key)}
                      style={[
                        styles.categoryOption,
                        {
                          backgroundColor: isActive
                            ? colors.accent + '15'
                            : colors.buttonBackground,
                          borderColor: isActive
                            ? colors.accent + '33'
                            : colors.border,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <cat.Icon
                        size={14}
                        color={isActive ? colors.accent : colors.textMuted}
                        weight={isActive ? 'fill' : 'light'}
                      />
                      <Text
                        style={[
                          styles.categoryOptionText,
                          {
                            color: isActive ? colors.accent : colors.textMuted,
                            fontFamily: isActive ? FontFamily.uiMedium : FontFamily.ui,
                          },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Divider */}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {/* Delete */}
            {noteId && (
              <TouchableOpacity
                onPress={handleDelete}
                style={styles.menuItem}
                activeOpacity={0.6}
              >
                <TrashIcon
                  size={16}
                  color={colors.error}
                  weight="light"
                />
                <Text
                  style={[
                    styles.menuItemText,
                    { color: colors.error },
                  ]}
                >
                  {deleteConfirm ? 'Tap again to delete' : 'Delete note'}
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* Note editor */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.flex}>
          <NoteEditor
            initialNote={existingNote}
            onSave={handleEditorSave}
            onAutoSave={handleAutoSave}
          />
        </Animated.View>
      </SafeAreaView>

      {/* Backdrop for more menu */}
      {showMoreMenu && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            setShowMoreMenu(false);
            setShowCategoryPicker(false);
            setDeleteConfirm(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  doneButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  doneText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 16,
  },
  moreMenu: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 240,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    zIndex: 200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  categoryPickerInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryOptionText: {
    fontSize: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
});
