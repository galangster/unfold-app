import { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Share,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  PencilLineIcon,
  BookOpenIcon,
  MagnifyingGlassIcon,
  ArrowBendDownRightIcon,
  CheckCircleIcon,
  XIcon,
  PlusIcon,
  NotepadIcon,
  FolderSimpleIcon,
  CaretDownIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Note, type NoteCategory, type NoteFolder } from '@/lib/store';
import { NoteCard } from '@/components/notebook/NoteCard';
import { SwipeableNoteCard } from '@/components/notebook/SwipeableNoteCard';
import { CategoryPills } from '@/components/notebook/CategoryPills';
// FolderPills replaced by compact folder dropdown + MoveFolderSheet picker
import { CreateFolderSheet } from '@/components/notebook/CreateFolderSheet';
import { MoveFolderSheet } from '@/components/notebook/MoveFolderSheet';
import { UndoToast } from '@/components/UndoToast';
import { stripHtml, isHtmlContent } from '@/components/notebook/NoteEditor';

type Segment = 'reflections' | 'notebook';
type CategoryFilter = NoteCategory | 'all';

// ============================================================================
// Segmented Control Component
// ============================================================================

interface SegmentedControlProps {
  activeSegment: Segment;
  onSegmentChange: (segment: Segment) => void;
}

function SegmentedControl({ activeSegment, onSegmentChange }: SegmentedControlProps) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);

  const activeIndex = activeSegment === 'reflections' ? 0 : 1;
  const segmentWidth = containerWidth > 0 ? (containerWidth - 4) / 2 : 0;

  const indicatorTranslateX = useSharedValue(activeIndex * segmentWidth);

  // Update animation when segment changes
  const prevIndex = useRef(activeIndex);
  if (prevIndex.current !== activeIndex && segmentWidth > 0) {
    indicatorTranslateX.value = withTiming(activeIndex * segmentWidth, {
      duration: 200,
    });
    prevIndex.current = activeIndex;
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorTranslateX.value }],
    width: segmentWidth,
  }));

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setContainerWidth(width);
  }, []);

  // When containerWidth changes and we know the index, set position without animation
  const containerWidthRef = useRef(0);
  if (containerWidth > 0 && containerWidthRef.current !== containerWidth) {
    containerWidthRef.current = containerWidth;
    indicatorTranslateX.value = activeIndex * ((containerWidth - 4) / 2);
  }

  const handlePress = useCallback(
    (segment: Segment) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSegmentChange(segment);
    },
    [onSegmentChange],
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        segStyles.container,
        {
          backgroundColor: colors.inputBackground,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Sliding indicator */}
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            segStyles.indicator,
            {
              backgroundColor: colors.backgroundElevated,
              borderColor: colors.border,
              shadowColor: '#000',
            },
            indicatorStyle,
          ]}
        />
      )}

      {/* Segments */}
      <TouchableOpacity
        onPress={() => handlePress('reflections')}
        style={segStyles.segment}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeSegment === 'reflections' }}
        accessibilityLabel="Reflections tab, 1 of 2"
      >
        <Text
          style={[
            segStyles.segmentText,
            {
              fontFamily:
                activeSegment === 'reflections'
                  ? FontFamily.uiMedium
                  : FontFamily.ui,
              color:
                activeSegment === 'reflections'
                  ? colors.text
                  : colors.textSubtle,
            },
          ]}
        >
          Reflections
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => handlePress('notebook')}
        style={segStyles.segment}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeSegment === 'notebook' }}
        accessibilityLabel="Notebook tab, 2 of 2"
      >
        <Text
          style={[
            segStyles.segmentText,
            {
              fontFamily:
                activeSegment === 'notebook'
                  ? FontFamily.uiMedium
                  : FontFamily.ui,
              color:
                activeSegment === 'notebook'
                  ? colors.text
                  : colors.textSubtle,
            },
          ]}
        >
          Notebook
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 2,
    left: 2,
    height: 30,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 1,
  },
  segmentText: {
    fontSize: 14,
  },
});

// ============================================================================
// Notebook Empty State
// ============================================================================

interface NotebookEmptyStateProps {
  onCreateNote: () => void;
}

function NotebookEmptyState({ onCreateNote }: NotebookEmptyStateProps) {
  const { colors } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(600).delay(100)}
      style={emptyStyles.container}
    >
      <NotepadIcon
        size={40}
        color={colors.accent}
        weight="light"
        style={{ opacity: 0.5 }}
      />

      <Text style={[emptyStyles.headline, { color: colors.text }]}>
        Your notebook awaits.
      </Text>

      <Text style={[emptyStyles.description, { color: colors.textMuted }]}>
        Sermon notes, study reflections, quiet time thoughts — capture it all in one place.
      </Text>

      {/* Ghost skeleton card */}
      <View
        style={[
          emptyStyles.ghostCard,
          {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.border,
            shadowColor: '#000',
          },
        ]}
      >
        <View
          style={[
            emptyStyles.ghostLine,
            { backgroundColor: colors.border, width: '70%' },
          ]}
        />
        <View
          style={[
            emptyStyles.ghostLine,
            { backgroundColor: colors.border, width: '90%' },
          ]}
        />
        <View
          style={[
            emptyStyles.ghostLine,
            { backgroundColor: colors.border, width: '50%' },
          ]}
        />
      </View>

      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onCreateNote();
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Write your first note"
        style={[
          emptyStyles.ctaButton,
          {
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
          },
        ]}
      >
        <Text style={emptyStyles.ctaText}>Write your first note</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  headline: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  description: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  ghostCard: {
    width: '100%',
    borderRadius: 14,
    padding: 18,
    opacity: 0.4,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  ghostLine: {
    height: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  ctaButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginTop: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    color: '#FFFFFF',
  },
});

// ============================================================================
// Floating Action Button
// ============================================================================

interface FABProps {
  onPress: () => void;
  visible: boolean;
  tabBarHeight: number;
}

function FloatingActionButton({ onPress, visible, tabBarHeight }: FABProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(visible ? 0 : 80);

  // Animate visibility
  const prevVisible = useRef(visible);
  if (prevVisible.current !== visible) {
    translateY.value = withTiming(visible ? 0 : 80, { duration: 200 });
    prevVisible.current = visible;
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.9, { duration: 120 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1.0, { duration: 180 });
  }, [scale]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }, [onPress]);

  return (
    <Animated.View
      entering={FadeIn.duration(200).delay(300)}
      style={[
        fabStyles.container,
        {
          bottom: tabBarHeight + 24,
          backgroundColor: colors.accent,
          shadowColor: colors.accent,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
        accessibilityRole="button"
        accessibilityLabel="Create new note"
        style={fabStyles.touchable}
      >
        <PlusIcon size={24} color="#FFFFFF" weight="bold" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const fabStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  touchable: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ============================================================================
// Main Journal Hub Screen
// ============================================================================

export default function JournalHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const notes = useUnfoldStore((s) => s.notes);
  const deleteNote = useUnfoldStore((s) => s.deleteNote);

  const folders = useUnfoldStore((s) => s.folders);
  const addFolder = useUnfoldStore((s) => s.addFolder);
  const updateFolder = useUnfoldStore((s) => s.updateFolder);
  const storeDeleteFolder = useUnfoldStore((s) => s.deleteFolder);
  const moveNoteToFolder = useUnfoldStore((s) => s.moveNoteToFolder);

  const [activeSegment, setActiveSegment] = useState<Segment>('reflections');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);

  const [deletedNote, setDeletedNote] = useState<Note | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Folder sheet state
  const [showCreateFolderSheet, setShowCreateFolderSheet] = useState(false);
  const [showMoveFolderSheet, setShowMoveFolderSheet] = useState(false);
  const [showFolderPickerSheet, setShowFolderPickerSheet] = useState(false);
  const [noteToMove, setNoteToMove] = useState<Note | null>(null);

  const lastScrollY = useRef(0);
  const tabBarHeight = 56 + insets.bottom;

  const currentDevotional = devotionals.find((d) => d.id === currentDevotionalId);

  // ---- Reflections data (existing logic, unchanged) ----
  const entriesByDevotional = useMemo(() => {
    const grouped = new Map<string, typeof journalEntries>();
    for (const entry of journalEntries) {
      const existing = grouped.get(entry.devotionalId) ?? [];
      existing.push(entry);
      grouped.set(entry.devotionalId, existing);
    }
    return grouped;
  }, [journalEntries]);

  const currentDayData = useMemo(() => {
    if (!currentDevotional) return null;
    return (
      currentDevotional.days.find(
        (d) => d.dayNumber === currentDevotional.currentDay,
      ) ?? null
    );
  }, [currentDevotional]);

  const todayQuestion = useMemo(() => {
    if (!currentDayData) return null;
    if (!currentDayData.reflectionQuestions?.length) return null;
    return {
      question: currentDayData.reflectionQuestions[0],
      dayNumber: currentDayData.dayNumber,
      dayTitle: currentDayData.title,
    };
  }, [currentDayData]);

  const reflectionQuestions = useMemo(() => {
    if (!currentDayData?.reflectionQuestions?.length) return [];
    return currentDayData.reflectionQuestions;
  }, [currentDayData]);

  const todayEntry = useMemo(() => {
    if (!currentDevotional) return null;
    return (
      journalEntries.find(
        (e) =>
          e.devotionalId === currentDevotional.id &&
          e.dayNumber === currentDevotional.currentDay,
      ) ?? null
    );
  }, [currentDevotional, journalEntries]);

  const answeredQuestions = useMemo(() => {
    if (!todayEntry?.questionResponses) return new Set<string>();
    return new Set(
      todayEntry.questionResponses
        .filter((qr) => qr.response.trim().length > 0)
        .map((qr) => qr.question),
    );
  }, [todayEntry]);

  const hasExistingEntry = useMemo(() => {
    if (!currentDevotional) return false;
    return journalEntries.some(
      (e) =>
        e.devotionalId === currentDevotional.id &&
        e.dayNumber === currentDevotional.currentDay,
    );
  }, [currentDevotional, journalEntries]);

  const firstUnansweredQuestion = useMemo(() => {
    if (!reflectionQuestions.length) return null;
    for (let i = 0; i < reflectionQuestions.length; i++) {
      if (!answeredQuestions.has(reflectionQuestions[i])) {
        return { question: reflectionQuestions[i], index: i };
      }
    }
    return null;
  }, [reflectionQuestions, answeredQuestions]);

  // ---- Notebook data ----
  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    // Folder filter
    if (activeFolderId !== null) {
      filtered = filtered.filter((n) => n.folderId === activeFolderId);
    }

    // Category filter
    if (activeCategory !== 'all') {
      filtered = filtered.filter((n) => n.category === activeCategory);
    }

    // Search filter (applies to both segments when active)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((n) => {
        const searchText = [
          n.title,
          n.content,
          ...n.tags,
          ...n.scriptureRefs.map((r) => r.reference),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(query);
      });
    }

    // Sort by updatedAt descending
    filtered.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return filtered;
  }, [notes, activeFolderId, activeCategory, searchQuery]);

  // ---- Reflections filtered entries ----
  const filteredEntries = useMemo(() => {
    const sorted = [...journalEntries].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase().trim();
    return sorted.filter((entry) => {
      const devotional = devotionals.find((d) => d.id === entry.devotionalId);
      const day = devotional?.days.find(
        (d) => d.dayNumber === entry.dayNumber,
      );
      const searchableText = [
        entry.content,
        day?.title,
        devotional?.title,
        ...(entry.questionResponses?.map(
          (qr) => `${qr.question} ${qr.response}`,
        ) ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [journalEntries, searchQuery, devotionals]);

  // ---- Relative date formatting ----
  const formatRelativeDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }, []);

  // ---- Handlers ----
  const handleWriteToday = useCallback(() => {
    if (!currentDevotional) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/(tabs)/(today)/journal',
      params: {
        devotionalId: currentDevotional.id,
        dayNumber: String(currentDevotional.currentDay),
      },
    });
  }, [currentDevotional, router]);

  const handleQuestionTap = useCallback(
    (questionIndex: number) => {
      if (!currentDevotional) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/(tabs)/(today)/journal',
        params: {
          devotionalId: currentDevotional.id,
          dayNumber: String(currentDevotional.currentDay),
          focusQuestion: String(questionIndex),
        },
      });
    },
    [currentDevotional, router],
  );

  const handleCreateNote = useCallback(() => {
    router.push('/(tabs)/(journal)/note');
  }, [router]);

  const handleNotePress = useCallback(
    (note: Note) => {
      router.push({
        pathname: '/(tabs)/(journal)/note-detail',
        params: { noteId: note.id },
      });
    },
    [router],
  );

  const handleNoteShare = useCallback(async (note: Note) => {
    const plainContent = isHtmlContent(note.content)
      ? stripHtml(note.content)
      : note.content;
    const shareTitle = note.title.trim() || 'Note';
    const shareMessage = note.title.trim()
      ? `${note.title}\n\n${plainContent}`
      : plainContent;

    try {
      await Share.share({ title: shareTitle, message: shareMessage });
    } catch {
      // User cancelled or share failed — no action needed
    }
  }, []);

  const handleNoteMove = useCallback((note: Note) => {
    setNoteToMove(note);
    setShowMoveFolderSheet(true);
  }, []);

  const handleMoveFolderSelect = useCallback(
    (folderId: string | null) => {
      if (!noteToMove) return;
      moveNoteToFolder(noteToMove.id, folderId);
      setNoteToMove(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [noteToMove, moveNoteToFolder],
  );

  const handleCreateFolderSubmit = useCallback(
    (name: string, color?: string) => {
      addFolder(name, color);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [addFolder],
  );

  const handleFolderLongPress = useCallback(
    (folder: NoteFolder) => {
      Alert.alert(folder.name, undefined, [
        {
          text: 'Rename',
          onPress: () => {
            Alert.prompt(
              'Rename Folder',
              undefined,
              (newName: string) => {
                if (newName.trim()) {
                  updateFolder(folder.id, { name: newName.trim() });
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
              },
              'plain-text',
              folder.name,
            );
          },
        },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete folder?',
              'Notes inside will be moved to Unfiled.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    storeDeleteFolder(folder.id, false);
                    // If this folder was active, reset to All Notes
                    if (activeFolderId === folder.id) {
                      setActiveFolderId(null);
                    }
                  },
                },
              ],
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [updateFolder, storeDeleteFolder, activeFolderId],
  );

  const handleNoteDelete = useCallback(
    (note: Note) => {
      // Clear any existing timer
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
      }

      // Store the full note for potential undo
      setDeletedNote(note);

      // Optimistically remove from store
      deleteNote(note.id);

      // Set auto-dismiss timer
      deleteTimerRef.current = setTimeout(() => {
        setDeletedNote(null);
      }, 3000);
    },
    [deleteNote],
  );

  const handleUndoDelete = useCallback(() => {
    if (!deletedNote) return;

    // Clear the auto-dismiss timer
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
    }

    // Restore the exact original note (preserving id, timestamps, all fields)
    useUnfoldStore.setState((state) => ({
      notes: [deletedNote, ...state.notes],
    }));

    setDeletedNote(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [deletedNote]);

  const handleUndoDismiss = useCallback(() => {
    setDeletedNote(null);
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const currentY = e.nativeEvent.contentOffset.y;
      if (currentY > lastScrollY.current + 10 && currentY > 50) {
        // Scrolling down
        setFabVisible(false);
      } else if (currentY < lastScrollY.current - 10 || currentY <= 10) {
        // Scrolling up or at top
        setFabVisible(true);
      }
      lastScrollY.current = currentY;
    },
    [],
  );

  // Determine if search toggle should show
  const hasContent =
    journalEntries.length > 0 || notes.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* Header with search toggle */}
          <Animated.View
            entering={FadeIn.duration(700)}
            style={mainStyles.headerRow}
          >
            <Text
              style={[mainStyles.headerTitle, { color: colors.text }]}
            >
              Journal
            </Text>
            {hasContent && (
              <TouchableOpacity
                onPress={() => {
                  setShowSearch(!showSearch);
                  if (showSearch) setSearchQuery('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.6}
                style={{ padding: 8 }}
              >
                {showSearch ? (
                  <XIcon
                    size={20}
                    color={colors.textMuted}
                    weight="light"
                  />
                ) : (
                  <MagnifyingGlassIcon
                    size={20}
                    color={colors.textMuted}
                    weight="light"
                  />
                )}
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Search Bar */}
          {showSearch && (
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={mainStyles.searchContainer}
            >
              <View
                style={[
                  mainStyles.searchBar,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.border,
                    shadowColor: '#000',
                  },
                ]}
              >
                <MagnifyingGlassIcon
                  size={16}
                  color={colors.textSubtle}
                  weight="light"
                />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search entries..."
                  placeholderTextColor={colors.textHint}
                  autoFocus
                  style={[mainStyles.searchInput, { color: colors.text }]}
                />
              </View>
            </Animated.View>
          )}

          {/* Segmented Control */}
          <View style={mainStyles.segmentContainer}>
            <SegmentedControl
              activeSegment={activeSegment}
              onSegmentChange={setActiveSegment}
            />
          </View>

          {/* ================================================================ */}
          {/* REFLECTIONS TAB (existing content — unchanged) */}
          {/* ================================================================ */}
          {activeSegment === 'reflections' && (
            <Animated.View entering={FadeIn.duration(250)}>
              {/* Today's Reflection Card */}
              {currentDevotional && (
                <Animated.View
                  entering={FadeInDown.duration(600).delay(100)}
                  style={{ paddingHorizontal: 24, marginTop: 20 }}
                >
                  <TouchableOpacity
                    onPress={handleWriteToday}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={
                      hasExistingEntry
                        ? "Continue today's reflection"
                        : "Start today's reflection"
                    }
                    accessibilityHint="Opens journal editor for today"
                  >
                    <View
                      style={{
                        backgroundColor: colors.accent + '0D',
                        borderRadius: 20,
                        padding: 24,
                        borderWidth: 1,
                        borderColor: colors.accent + '12',
                        shadowColor: colors.accent,
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.08,
                        shadowRadius: 12,
                        elevation: 3,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 12,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <PencilLineIcon
                            size={16}
                            color={colors.accent}
                            weight="light"
                          />
                          <Text
                            style={{
                              fontFamily: FontFamily.mono,
                              fontSize: 11,
                              color: colors.accent,
                              letterSpacing: 1,
                            }}
                          >
                            {hasExistingEntry ? 'CONTINUE' : 'REFLECT'}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: 12,
                            color: colors.textSubtle,
                          }}
                        >
                          Day {currentDevotional.currentDay}/
                          {currentDevotional.days.length}
                        </Text>
                      </View>

                      <Text
                        style={{
                          fontFamily: FontFamily.display,
                          fontSize: 20,
                          color: colors.text,
                          letterSpacing: -0.3,
                          marginBottom: 6,
                        }}
                        numberOfLines={2}
                      >
                        {currentDayData?.title ??
                          `Day ${currentDevotional.currentDay}`}
                      </Text>

                      {currentDayData?.scriptureReference && (
                        <Text
                          style={{
                            fontFamily: FontFamily.bodyItalic,
                            fontSize: 13,
                            color: colors.textMuted,
                            marginBottom: firstUnansweredQuestion ? 14 : 0,
                          }}
                        >
                          {currentDayData.scriptureReference}
                        </Text>
                      )}

                      {firstUnansweredQuestion && (
                        <Text
                          style={{
                            fontFamily: FontFamily.bodyItalic,
                            fontSize: 14,
                            color: colors.text,
                            lineHeight: 21,
                            opacity: 0.7,
                          }}
                          numberOfLines={2}
                        >
                          "{firstUnansweredQuestion.question}"
                        </Text>
                      )}

                      <View
                        style={{
                          height: 2,
                          backgroundColor: colors.border,
                          borderRadius: 1,
                          marginTop: 16,
                        }}
                      >
                        <View
                          style={{
                            height: 2,
                            backgroundColor: colors.accent,
                            borderRadius: 1,
                            width: `${Math.round((currentDevotional.currentDay / currentDevotional.days.length) * 100)}%`,
                          }}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Go Deeper */}
              {currentDevotional &&
                firstUnansweredQuestion &&
                reflectionQuestions.length > 1 && (
                  <Animated.View
                    entering={FadeInDown.duration(600).delay(150)}
                    style={{ paddingHorizontal: 24, marginTop: 16 }}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        handleQuestionTap(firstUnansweredQuestion.index)
                      }
                      activeOpacity={0.7}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: colors.inputBackground,
                          borderRadius: 12,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.04,
                          shadowRadius: 6,
                          elevation: 1,
                        }}
                      >
                        <ArrowBendDownRightIcon
                          size={14}
                          color={colors.accent}
                          weight="light"
                        />
                        <Text
                          style={{
                            flex: 1,
                            fontFamily: FontFamily.ui,
                            fontSize: 13,
                            color: colors.textMuted,
                          }}
                        >
                          {reflectionQuestions.length - answeredQuestions.size}{' '}
                          more reflection
                          {reflectionQuestions.length - answeredQuestions.size !==
                          1
                            ? 's'
                            : ''}{' '}
                          to explore
                        </Text>
                        {answeredQuestions.size > 0 && (
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: 12,
                              color: colors.accent,
                            }}
                          >
                            {answeredQuestions.size}/{reflectionQuestions.length}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                )}

              {/* Past Entries */}
              {(journalEntries.length > 0 || !currentDevotional) && (
                <Animated.View
                  entering={FadeInDown.duration(600).delay(200)}
                  style={{ paddingHorizontal: 24, marginTop: 28 }}
                >
                  {journalEntries.length > 0 && (
                    <Text
                      style={{
                        fontFamily: FontFamily.mono,
                        fontSize: 11,
                        color: colors.textSubtle,
                        letterSpacing: 1,
                        marginBottom: 16,
                      }}
                    >
                      YOUR JOURNEY
                    </Text>
                  )}

                  {journalEntries.length === 0 ? (
                    <View
                      style={{
                        borderRadius: 16,
                        padding: 32,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.display,
                          fontSize: 24,
                          color: colors.text,
                          textAlign: 'center',
                          marginBottom: 8,
                        }}
                      >
                        Your story is unfolding.
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 15,
                          color: colors.textMuted,
                          textAlign: 'center',
                          lineHeight: 22,
                          marginBottom: 24,
                        }}
                      >
                        Each day's reflection becomes a letter{'\n'}to your
                        future self.
                      </Text>
                      <View
                        style={{
                          width: '100%',
                          backgroundColor: colors.backgroundElevated,
                          borderRadius: 14,
                          padding: 18,
                          opacity: 0.5,
                          borderWidth: 1,
                          borderColor: colors.border,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.04,
                          shadowRadius: 8,
                          elevation: 1,
                        }}
                      >
                        <View
                          style={{
                            height: 10,
                            width: '70%',
                            backgroundColor: colors.border,
                            borderRadius: 5,
                            marginBottom: 10,
                          }}
                        />
                        <View
                          style={{
                            height: 10,
                            width: '90%',
                            backgroundColor: colors.border,
                            borderRadius: 5,
                            marginBottom: 10,
                          }}
                        />
                        <View
                          style={{
                            height: 10,
                            width: '50%',
                            backgroundColor: colors.border,
                            borderRadius: 5,
                          }}
                        />
                      </View>
                    </View>
                  ) : filteredEntries.length === 0 && searchQuery ? (
                    <View
                      style={{
                        borderRadius: 16,
                        padding: 24,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 15,
                          color: colors.textMuted,
                          textAlign: 'center',
                        }}
                      >
                        No entries match "{searchQuery}"
                      </Text>
                    </View>
                  ) : (
                    filteredEntries.map((entry) => {
                      const devotional = devotionals.find(
                        (d) => d.id === entry.devotionalId,
                      );
                      const day = devotional?.days.find(
                        (d) => d.dayNumber === entry.dayNumber,
                      );
                      const answeredCount =
                        entry.questionResponses?.filter(
                          (qr) => qr.response.trim().length > 0,
                        ).length ?? 0;
                      return (
                        <TouchableOpacity
                          key={entry.id}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            router.push({
                              pathname: '/(tabs)/(today)/journal',
                              params: {
                                devotionalId: entry.devotionalId,
                                dayNumber: String(entry.dayNumber),
                              },
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <View
                            style={{
                              backgroundColor: colors.backgroundElevated,
                              borderRadius: 14,
                              padding: 16,
                              marginBottom: 10,
                              borderWidth: 1,
                              borderColor: colors.border,
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.06,
                              shadowRadius: 10,
                              elevation: 2,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 6,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: FontFamily.uiMedium,
                                  fontSize: 14,
                                  color: colors.text,
                                  flex: 1,
                                }}
                                numberOfLines={1}
                              >
                                {day?.title ?? `Day ${entry.dayNumber}`}
                              </Text>
                              <Text
                                style={{
                                  fontFamily: FontFamily.ui,
                                  fontSize: 11,
                                  color: colors.textSubtle,
                                  marginLeft: 8,
                                }}
                              >
                                {formatRelativeDate(entry.updatedAt)}
                              </Text>
                            </View>
                            {entry.content ? (
                              <Text
                                style={{
                                  fontFamily: FontFamily.body,
                                  fontSize: 13,
                                  color: colors.textMuted,
                                  lineHeight: 19,
                                }}
                                numberOfLines={2}
                              >
                                {entry.content}
                              </Text>
                            ) : null}
                            {(answeredCount > 0 || devotional) && (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginTop: 8,
                                }}
                              >
                                {devotional && (
                                  <Text
                                    style={{
                                      fontFamily: FontFamily.ui,
                                      fontSize: 11,
                                      color: colors.textSubtle,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {devotional.title}
                                  </Text>
                                )}
                                {answeredCount > 0 && (
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 3,
                                    }}
                                  >
                                    <CheckCircleIcon
                                      size={11}
                                      color={colors.accent}
                                      weight="fill"
                                    />
                                    <Text
                                      style={{
                                        fontFamily: FontFamily.ui,
                                        fontSize: 11,
                                        color: colors.accent,
                                      }}
                                    >
                                      {answeredCount}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </Animated.View>
              )}
            </Animated.View>
          )}

          {/* ================================================================ */}
          {/* NOTEBOOK TAB (new content) */}
          {/* ================================================================ */}
          {activeSegment === 'notebook' && (
            <Animated.View entering={FadeIn.duration(250)}>
              {/* Unified filter row: folder dropdown + category pills */}
              <View style={mainStyles.filterRow}>
                {/* Compact folder dropdown */}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowFolderPickerSheet(true);
                  }}
                  onLongPress={() => {
                    if (activeFolderId) {
                      const folder = folders.find((f) => f.id === activeFolderId);
                      if (folder) handleFolderLongPress(folder);
                    }
                  }}
                  activeOpacity={0.7}
                  style={[
                    mainStyles.folderDropdown,
                    {
                      backgroundColor: activeFolderId ? colors.accent + '12' : colors.buttonBackground,
                      borderColor: activeFolderId ? colors.accent + '30' : colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Current folder: ${activeFolderId ? folders.find((f) => f.id === activeFolderId)?.name ?? 'Unknown' : 'All Notes'}. Tap to change.`}
                >
                  {activeFolderId && folders.find((f) => f.id === activeFolderId)?.color ? (
                    <View
                      style={[
                        mainStyles.folderDropdownDot,
                        { backgroundColor: folders.find((f) => f.id === activeFolderId)!.color },
                      ]}
                    />
                  ) : (
                    <FolderSimpleIcon
                      size={14}
                      color={activeFolderId ? colors.accent : colors.textMuted}
                      weight="light"
                    />
                  )}
                  <Text
                    style={[
                      mainStyles.folderDropdownText,
                      {
                        color: activeFolderId ? colors.accent : colors.textMuted,
                        fontFamily: activeFolderId ? FontFamily.uiMedium : FontFamily.ui,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {activeFolderId
                      ? folders.find((f) => f.id === activeFolderId)?.name ?? 'Folder'
                      : 'All Notes'}
                  </Text>
                  <CaretDownIcon
                    size={10}
                    color={activeFolderId ? colors.accent : colors.textSubtle}
                    weight="bold"
                  />
                </TouchableOpacity>

                {/* Category pills scroll */}
                <View style={mainStyles.categoryPillsInline}>
                  <CategoryPills
                    selectedCategory={activeCategory}
                    onSelectCategory={setActiveCategory}
                    compact
                  />
                </View>
              </View>

              {/* Notes list or empty state */}
              {filteredNotes.length === 0 ? (
                activeCategory === 'all' && !searchQuery.trim() && activeFolderId === null ? (
                  <View style={{ paddingHorizontal: 24 }}>
                    <NotebookEmptyState onCreateNote={handleCreateNote} />
                  </View>
                ) : (
                  <View style={mainStyles.noResultsContainer}>
                    <Text
                      style={[
                        mainStyles.noResultsText,
                        { color: colors.textMuted },
                      ]}
                    >
                      {searchQuery.trim()
                        ? `No notes match "${searchQuery}"`
                        : activeFolderId
                          ? 'No notes in this folder yet.'
                          : 'No notes in this category yet.'}
                    </Text>
                  </View>
                )
              ) : (
                <View style={mainStyles.notesListContainer}>
                  {filteredNotes.map((note, index) => (
                    <SwipeableNoteCard
                      key={note.id}
                      note={note}
                      index={index}
                      onPress={handleNotePress}
                      onShare={handleNoteShare}
                      onMove={handleNoteMove}
                      onDelete={handleNoteDelete}
                    />
                  ))}
                </View>
              )}
            </Animated.View>
          )}
        </ScrollView>

        {/* FAB — only visible when Notebook segment is active */}
        {activeSegment === 'notebook' && (
          <FloatingActionButton
            onPress={handleCreateNote}
            visible={fabVisible}
            tabBarHeight={tabBarHeight}
          />
        )}

        {/* Undo toast for note deletion */}
        <UndoToast
          visible={deletedNote !== null}
          message="Note deleted"
          onUndo={handleUndoDelete}
          onDismiss={handleUndoDismiss}
        />

        {/* Create Folder sheet */}
        <CreateFolderSheet
          visible={showCreateFolderSheet}
          onClose={() => setShowCreateFolderSheet(false)}
          onSubmit={handleCreateFolderSubmit}
        />

        {/* Move to Folder sheet (from swipe action) */}
        <MoveFolderSheet
          visible={showMoveFolderSheet}
          onClose={() => {
            setShowMoveFolderSheet(false);
            setNoteToMove(null);
          }}
          folders={folders}
          currentFolderId={noteToMove?.folderId}
          onSelect={handleMoveFolderSelect}
        />

        {/* Folder picker sheet (from dropdown filter) */}
        <MoveFolderSheet
          visible={showFolderPickerSheet}
          onClose={() => setShowFolderPickerSheet(false)}
          folders={folders}
          currentFolderId={activeFolderId ?? undefined}
          onSelect={(folderId) => setActiveFolderId(folderId)}
          title="Folders"
          showAllNotes
          onCreateFolder={() => setShowCreateFolderSheet(true)}
        />
      </SafeAreaView>
    </View>
  );
}

const mainStyles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: FontFamily.display,
    fontSize: 34,
    letterSpacing: -0.5,
  },
  searchContainer: {
    paddingHorizontal: 24,
    marginTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 14,
    padding: 0,
  },
  segmentContainer: {
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 24,
    marginBottom: 16,
  },
  folderDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
  },
  folderDropdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  folderDropdownText: {
    fontSize: 13,
    maxWidth: 100,
  },
  categoryPillsInline: {
    flex: 1,
  },
  notesListContainer: {
    paddingHorizontal: 24,
  },
  noResultsContainer: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginHorizontal: 24,
  },
  noResultsText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
  },
});
