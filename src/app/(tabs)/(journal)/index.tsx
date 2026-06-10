import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
  FadeOut,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler';
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
  CaretRightIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Note, type NoteFolder } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { NoteCard } from '@/components/notebook/NoteCard';
import { SwipeableNoteCard } from '@/components/notebook/SwipeableNoteCard';
import { FolderChips } from '@/components/notebook/FolderChips';
// FolderChips — horizontal scrollable folder filter pills
import { CreateFolderSheet } from '@/components/notebook/CreateFolderSheet';
import { MoveFolderSheet } from '@/components/notebook/MoveFolderSheet';
import { UndoToast } from '@/components/UndoToast';
import { stripHtml, isHtmlContent } from '@/components/notebook/NoteEditor';
import { alpha } from '@/components/ui';
import { useCreationGate } from '@/hooks/useCreationGate';
import { prepareJournalFolderDelete } from '@/lib/journal-folder-delete';
import { applyUndoActions, type JournalUndoAction } from '@/lib/journal-undo';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';

type Segment = 'reflections' | 'notebook';

const JOURNAL_SWIPE_ACTIVE_OFFSET = 18;
const JOURNAL_SWIPE_FAIL_OFFSET_Y = 32;
const JOURNAL_SWIPE_THRESHOLD = 72;
const JOURNAL_SWIPE_VELOCITY = 520;
const JOURNAL_SWIPE_MAX_TRANSLATE = 24;
const JOURNAL_SWIPE_RESET_CONFIG = {
  duration: 120,
  easing: Easing.out(Easing.cubic),
};
const JOURNAL_SWIPE_DIRECTION_LIMIT = 100_000;

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

  // Update animation when segment changes — fast ease-out, no bounce.
  // Keep shared-value writes out of render to avoid Reanimated runtime warnings.
  const prevIndex = useRef(activeIndex);
  useEffect(() => {
    if (prevIndex.current !== activeIndex && segmentWidth > 0) {
      indicatorTranslateX.value = withTiming(activeIndex * segmentWidth, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      prevIndex.current = activeIndex;
    }
  }, [activeIndex, indicatorTranslateX, segmentWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorTranslateX.value }],
    width: segmentWidth,
  }));

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setContainerWidth(width);
  }, []);

  // When containerWidth changes and we know the index, set position without animation.
  const containerWidthRef = useRef(0);
  useEffect(() => {
    if (containerWidth > 0 && containerWidthRef.current !== containerWidth) {
      containerWidthRef.current = containerWidth;
      indicatorTranslateX.value = activeIndex * ((containerWidth - 4) / 2);
    }
  }, [activeIndex, containerWidth, indicatorTranslateX]);

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
              backgroundColor: colors.glassBackground,
              borderColor: colors.glassBorder,
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
    padding: Spacing['0.5'],
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 2,
    left: 2,
    height: 30,
    borderRadius: Radius.lg,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
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
    fontSize: FontSize.sm,
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
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(60).easing(Ease.out)}
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
    borderRadius: Radius.lg,
    padding: Spacing['8'],
    alignItems: 'center',
  },
  headline: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['2xl'],
    textAlign: 'center',
    marginTop: Spacing['4'],
    marginBottom: Spacing['2'],
  },
  description: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['6'],
  },
  ghostCard: {
    width: '100%',
    borderRadius: Radius.card,
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
    marginBottom: Spacing['2.5'],
  },
  ctaButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing['3.5'],
    paddingHorizontal: Spacing['6'],
    alignSelf: 'center',
    marginTop: Spacing['6'],
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
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(visible ? 0 : 200);

  // Animate visibility
  const prevVisible = useRef(visible);
  if (prevVisible.current !== visible) {
    translateY.value = withTiming(visible ? 0 : 200, { duration: Duration.normal });
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
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(300).easing(Ease.out)}
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
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const notes = useUnfoldStore((s) => s.notes);
  const deleteNote = useUnfoldStore((s) => s.deleteNote);

  const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();

  const folders = useUnfoldStore((s) => s.folders);
  const addFolder = useUnfoldStore((s) => s.addFolder);
  const updateFolder = useUnfoldStore((s) => s.updateFolder);
  const storeDeleteFolder = useUnfoldStore((s) => s.deleteFolder);
  const moveNoteToFolder = useUnfoldStore((s) => s.moveNoteToFolder);
  const reorderFolders = useUnfoldStore((s) => s.reorderFolders);

  const getDescendantFolderIds = useUnfoldStore((s) => s.getDescendantFolderIds);
  const [activeSegment, setActiveSegment] = useState<Segment>('reflections');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);

  // Generalized undo state — supports both note and folder deletion
  const [undoActions, setUndoActions] = useState<JournalUndoAction[]>([]);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Folder sheet state
  const [showCreateFolderSheet, setShowCreateFolderSheet] = useState(false);
  const [showMoveFolderSheet, setShowMoveFolderSheet] = useState(false);
  const [noteToMove, setNoteToMove] = useState<Note | null>(null);

  // Hide tab bar when any sheet is open so it doesn't show through the Modal
  const setTabBarHidden = useUIState((s) => s.setTabBarHidden);
  const anySheetOpen = showCreateFolderSheet || showMoveFolderSheet;
  useEffect(() => {
    setTabBarHidden(anySheetOpen, 'instant');
    return () => setTabBarHidden(false, 'instant');
  }, [anySheetOpen, setTabBarHidden]);

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
    // For reflections, show the most recently completed day (not the next day).
    // After completing Day 1, currentDay advances to 2 but the user should
    // reflect on Day 1, not Day 2.
    const lastCompletedDay = currentDevotional.days
      .filter((d) => d.isRead)
      .sort((a, b) => b.dayNumber - a.dayNumber)[0];
    return (
      lastCompletedDay ??
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

  // Use currentDayData.dayNumber (last completed day) NOT currentDevotional.currentDay
  // (which is the NEXT day after advancement). Questions come from currentDayData,
  // so answers must be looked up from the same day.
  const todayEntry = useMemo(() => {
    if (!currentDevotional || !currentDayData) return null;
    return (
      journalEntries.find(
        (e) =>
          e.devotionalId === currentDevotional.id &&
          e.dayNumber === currentDayData.dayNumber,
      ) ?? null
    );
  }, [currentDevotional, currentDayData, journalEntries]);

  // Count answered reflections — counts ALL non-empty question responses,
  // not just those matching the original reflectionQuestions strings
  // (Go Deeper may generate AI follow-up questions with different text)
  const answeredReflectionCount = useMemo(() => {
    if (!todayEntry?.questionResponses) return 0;
    return todayEntry.questionResponses.filter(
      (qr) => qr.response.trim().length > 0,
    ).length;
  }, [todayEntry]);

  const remainingReflections = useMemo(() => {
    if (!reflectionQuestions.length) return 0;
    return Math.max(0, reflectionQuestions.length - answeredReflectionCount);
  }, [reflectionQuestions, answeredReflectionCount]);

  const isAllReflectionsDone = useMemo(() => {
    if (!reflectionQuestions.length) return false;
    return answeredReflectionCount >= reflectionQuestions.length;
  }, [reflectionQuestions, answeredReflectionCount]);

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
    // If the user has answered at least as many questions as there are
    // reflection questions, consider them all done
    if (answeredReflectionCount >= reflectionQuestions.length) return null;
    // Find the first original question that isn't yet answered by exact match
    // (for the preview text on the card)
    const answeredQuestionTexts = new Set(
      (todayEntry?.questionResponses ?? [])
        .filter((qr) => qr.response.trim().length > 0)
        .map((qr) => qr.question),
    );
    for (let i = 0; i < reflectionQuestions.length; i++) {
      if (!answeredQuestionTexts.has(reflectionQuestions[i])) {
        return { question: reflectionQuestions[i], index: i };
      }
    }
    return null;
  }, [reflectionQuestions, answeredReflectionCount, todayEntry]);

  // ---- Notebook data ----
  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    // Folder filter — direct children only (not descendant subfolders)
    if (activeFolderId !== null) {
      filtered = filtered.filter((n) => n.folderId === activeFolderId);
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
  }, [notes, activeFolderId, searchQuery]);

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

  // ---- Series with journal entries (for YOUR DEVOTIONALS section) ----
  const seriesWithEntries = useMemo(() => {
    // Group entries by devotionalId and compute stats
    const seriesMap = new Map<string, { devotional: typeof devotionals[0]; entryCount: number; latestEntry: string; scriptures: string[] }>();
    for (const entry of journalEntries) {
      const existing = seriesMap.get(entry.devotionalId);
      const devotional = devotionals.find((d) => d.id === entry.devotionalId);
      if (!devotional) continue;

      if (!existing) {
        // Collect unique scripture references from this devotional's days
        const scriptures = Array.from(
          new Set(
            devotional.days
              .filter((d) => d.scriptureReference)
              .map((d) => d.scriptureReference),
          ),
        ).slice(0, 3);
        seriesMap.set(entry.devotionalId, {
          devotional,
          entryCount: 1,
          latestEntry: entry.updatedAt,
          scriptures,
        });
      } else {
        existing.entryCount += 1;
        if (new Date(entry.updatedAt).getTime() > new Date(existing.latestEntry).getTime()) {
          existing.latestEntry = entry.updatedAt;
        }
      }
    }

    return Array.from(seriesMap.values())
      .sort((a, b) => new Date(b.latestEntry).getTime() - new Date(a.latestEntry).getTime());
  }, [journalEntries, devotionals]);

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
    if (!currentDevotional) {
      console.log('[Journal] handleWriteToday: no currentDevotional, returning');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Navigate to the day being reflected on (last completed), not the next day
    const reflectionDay = currentDayData?.dayNumber ?? currentDevotional.currentDay;
    console.log('[Journal] handleWriteToday → pushing /(tabs)/(journal)/entry', {
      devotionalId: currentDevotional.id,
      dayNumber: reflectionDay,
      currentDevTitle: currentDevotional.title,
    });
    router.push({
      pathname: '/(tabs)/(journal)/entry',
      params: {
        devotionalId: currentDevotional.id,
        dayNumber: String(reflectionDay),
      },
    });
  }, [currentDevotional, currentDayData, router]);

  const handleQuestionTap = useCallback(
    (questionIndex: number) => {
      if (!currentDevotional) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/(tabs)/(journal)/entry',
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
    if (!gate()) return;
    router.push({
      pathname: '/(tabs)/(journal)/note-detail',
      params: {
        startEditing: 'true',
        ...(activeFolderId ? { folderId: activeFolderId } : {}),
      },
    });
  }, [router, activeFolderId, gate]);

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
    (name: string, color?: string, parentId?: string) => {
      if (!gate()) return;
      addFolder(name, color, parentId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [addFolder, gate],
  );

  // Track which parent folder we're creating a subfolder inside
  const [createFolderParent, setCreateFolderParent] = useState<{ id: string; name: string } | null>(null);

  const handleFolderLongPress = useCallback(
    (folder: NoteFolder) => {
      Alert.alert(folder.name, undefined, [
        {
          text: 'Rename',
          onPress: () => {
            if (!gate()) return;
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
          text: 'Add Subfolder',
          onPress: () => {
            if (!gate()) return;
            setCreateFolderParent({ id: folder.id, name: folder.name });
            setShowCreateFolderSheet(true);
          },
        },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: () => {
            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

            const plan = prepareJournalFolderDelete({
              folder,
              folders,
              notes,
              descendantFolderIds: getDescendantFolderIds(folder.id),
              activeFolderId,
              currentParentId,
            });

            setUndoActions((prev) => [...prev, plan.undoAction]);
            storeDeleteFolder(folder.id, false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            if (plan.navigation.activeFolderId !== activeFolderId) {
              setActiveFolderId(plan.navigation.activeFolderId);
            }
            if (plan.navigation.currentParentId !== currentParentId) {
              setCurrentParentId(plan.navigation.currentParentId);
            }

            // Auto-dismiss undo after 4s
            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = setTimeout(() => {
              setUndoActions([]);
            }, 4000);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [updateFolder, storeDeleteFolder, activeFolderId, currentParentId, folders, notes, gate, getDescendantFolderIds],
  );

  const handleNoteDelete = useCallback(
    (note: Note) => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

      setUndoActions((prev) => [...prev, { type: 'note', note }]);
      deleteNote(note.id);

      deleteTimerRef.current = setTimeout(() => {
        setUndoActions([]);
      }, 3000);
    },
    [deleteNote],
  );

  const handleUndoAction = useCallback(() => {
    if (undoActions.length === 0) return;

    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

    useUnfoldStore.setState((state) =>
      applyUndoActions({ notes: state.notes, folders: state.folders }, undoActions),
    );
    setUndoActions([]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [undoActions]);

  const handleUndoDismiss = useCallback(() => {
    setUndoActions([]);
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

  const reflectionsSwipeX = useSharedValue(0);
  const notebookSwipeX = useSharedValue(0);

  const switchToNotebookFromSwipe = useCallback(() => {
    if (activeSegment === 'notebook') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSegment('notebook');
  }, [activeSegment]);

  const switchToReflectionsFromSwipe = useCallback(() => {
    if (activeSegment === 'reflections') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSegment('reflections');
  }, [activeSegment]);

  const reflectionsSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        // Left swipes only: right swipes stay inert and vertical scroll can win.
        .activeOffsetX([
          -JOURNAL_SWIPE_ACTIVE_OFFSET,
          JOURNAL_SWIPE_DIRECTION_LIMIT,
        ])
        .failOffsetY([
          -JOURNAL_SWIPE_FAIL_OFFSET_Y,
          JOURNAL_SWIPE_FAIL_OFFSET_Y,
        ])
        .onUpdate((e) => {
          if (reducedMotion) return;
          reflectionsSwipeX.value = Math.min(
            0,
            Math.max(e.translationX, -JOURNAL_SWIPE_MAX_TRANSLATE),
          );
        })
        .onEnd((e) => {
          const shouldSwitch =
            e.translationX <= -JOURNAL_SWIPE_THRESHOLD ||
            e.velocityX <= -JOURNAL_SWIPE_VELOCITY;

          reflectionsSwipeX.value = withTiming(0, JOURNAL_SWIPE_RESET_CONFIG);
          if (shouldSwitch) {
            runOnJS(switchToNotebookFromSwipe)();
          }
        })
        .onFinalize(() => {
          reflectionsSwipeX.value = withTiming(0, JOURNAL_SWIPE_RESET_CONFIG);
        }),
    [reducedMotion, reflectionsSwipeX, switchToNotebookFromSwipe],
  );

  const notebookSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        // Right swipes only so note-card left-swipe actions remain safe.
        .activeOffsetX([
          -JOURNAL_SWIPE_DIRECTION_LIMIT,
          JOURNAL_SWIPE_ACTIVE_OFFSET,
        ])
        .failOffsetY([
          -JOURNAL_SWIPE_FAIL_OFFSET_Y,
          JOURNAL_SWIPE_FAIL_OFFSET_Y,
        ])
        .onUpdate((e) => {
          if (reducedMotion) return;
          notebookSwipeX.value = Math.max(
            0,
            Math.min(e.translationX, JOURNAL_SWIPE_MAX_TRANSLATE),
          );
        })
        .onEnd((e) => {
          const shouldSwitch =
            e.translationX >= JOURNAL_SWIPE_THRESHOLD ||
            e.velocityX >= JOURNAL_SWIPE_VELOCITY;

          notebookSwipeX.value = withTiming(0, JOURNAL_SWIPE_RESET_CONFIG);
          if (shouldSwitch) {
            runOnJS(switchToReflectionsFromSwipe)();
          }
        })
        .onFinalize(() => {
          notebookSwipeX.value = withTiming(0, JOURNAL_SWIPE_RESET_CONFIG);
        }),
    [notebookSwipeX, reducedMotion, switchToReflectionsFromSwipe],
  );

  const segmentedSwipeGesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Fling()
          .direction(Directions.LEFT)
          .onEnd(() => {
            runOnJS(switchToNotebookFromSwipe)();
          }),
        Gesture.Fling()
          .direction(Directions.RIGHT)
          .onEnd(() => {
            runOnJS(switchToReflectionsFromSwipe)();
          }),
      ),
    [switchToNotebookFromSwipe, switchToReflectionsFromSwipe],
  );

  const reflectionsSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reflectionsSwipeX.value }],
  }));

  const notebookSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notebookSwipeX.value }],
  }));

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
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
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
                style={{ padding: Spacing['2'] }}
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
              entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
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
          <GestureDetector gesture={segmentedSwipeGesture}>
            <View style={mainStyles.segmentContainer}>
              <SegmentedControl
                activeSegment={activeSegment}
                onSegmentChange={setActiveSegment}
              />
            </View>
          </GestureDetector>

          {/* ================================================================ */}
          {/* REFLECTIONS TAB (existing content — unchanged) */}
          {/* ================================================================ */}
          {activeSegment === 'reflections' && (
            <GestureDetector gesture={reflectionsSwipeGesture}>
              <Animated.View
                entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
                style={reflectionsSwipeStyle}
              >
              {/* Today's Reflection Card */}
              {currentDevotional && (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(30).easing(Ease.out)}
                  style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['5'] }}
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
                        backgroundColor: alpha(colors.accent, 0.05),
                        borderRadius: Radius.xl,
                        padding: Spacing['6'],
                        borderWidth: 1,
                        borderColor: alpha(colors.accent, 0.07),
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
                          marginBottom: Spacing['3'],
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: Spacing['2'],
                          }}
                        >
                          {isAllReflectionsDone && hasExistingEntry ? (
                            <CheckCircleIcon
                              size={16}
                              color={colors.accent}
                              weight="fill"
                            />
                          ) : (
                            <PencilLineIcon
                              size={16}
                              color={colors.accent}
                              weight="light"
                            />
                          )}
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 11,
                              color: colors.accent,
                              letterSpacing: 1,
                            }}
                          >
                            {isAllReflectionsDone && hasExistingEntry
                              ? 'COMPLETED'
                              : hasExistingEntry
                                ? 'CONTINUE'
                                : 'REFLECT'}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: FontSize.xs,
                            color: colors.textSubtle,
                          }}
                        >
                          Day {currentDayData?.dayNumber ?? currentDevotional.currentDay}/
                          {Math.max(currentDevotional.totalDays, currentDevotional.days.length)}
                        </Text>
                      </View>

                      <Text
                        style={{
                          fontFamily: FontFamily.display,
                          fontSize: FontSize['2xl'],
                          color: colors.text,
                          letterSpacing: -0.3,
                          marginBottom: Spacing['1.5'],
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
                            marginBottom: firstUnansweredQuestion ? Spacing['3.5'] : 0,
                          }}
                        >
                          {currentDayData.scriptureReference}
                        </Text>
                      )}

                      {firstUnansweredQuestion && (
                        <Text
                          style={{
                            fontFamily: FontFamily.bodyItalic,
                            fontSize: FontSize.sm,
                            color: colors.text,
                            lineHeight: 21,
                            opacity: 0.7,
                          }}
                          numberOfLines={2}
                        >
                          "{firstUnansweredQuestion.question}"
                        </Text>
                      )}

                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Go Deeper */}
              {currentDevotional &&
                firstUnansweredQuestion &&
                reflectionQuestions.length > 1 && (
                  <Animated.View
                    entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(60).easing(Ease.out)}
                    style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['4'] }}
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
                          gap: Spacing['2.5'],
                          paddingVertical: Spacing['3'],
                          paddingHorizontal: Spacing['4'],
                          backgroundColor: colors.inputBackground,
                          borderRadius: Radius.md,
                          ...Shadow.sm,
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
                          {remainingReflections}{' '}
                          more reflection
                          {remainingReflections !== 1 ? 's' : ''}{' '}
                          to explore
                        </Text>
                        {answeredReflectionCount > 0 && (
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: FontSize.xs,
                              color: colors.accent,
                            }}
                          >
                            {answeredReflectionCount}/{reflectionQuestions.length}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                )}

              {/* YOUR DEVOTIONALS — grouped by series */}
              {(seriesWithEntries.length > 0 || !currentDevotional) && (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(90).easing(Ease.out)}
                  style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['7'] }}
                >
                  {seriesWithEntries.length > 0 ? (
                    <>
                      {/* Header row: YOUR DEVOTIONALS + View All */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: Spacing['4'],
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 11,
                            color: colors.textSubtle,
                            letterSpacing: 1,
                          }}
                        >
                          YOUR DEVOTIONALS
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/(tabs)/(you)/past-devotionals');
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="link"
                          accessibilityLabel="View all studies"
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: FontSize.sm,
                                color: colors.accent,
                              }}
                            >
                              View All
                            </Text>
                            <CaretRightIcon size={12} color={colors.accent} weight="bold" />
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Latest 4 series as simple rows */}
                      {seriesWithEntries.slice(0, 4).map((series) => {
                        // Find the latest journal entry's dayNumber for this devotional
                        const latestJournalDay = journalEntries
                          .filter((e) => e.devotionalId === series.devotional.id)
                          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.dayNumber
                          ?? series.devotional.currentDay;
                        return (
                        <TouchableOpacity
                          key={series.devotional.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push({
                              pathname: '/(tabs)/(you)/series-detail',
                              params: {
                                id: series.devotional.id,
                                from: 'journal',
                              },
                            });
                          }}
                          activeOpacity={0.7}
                          style={{ marginBottom: Spacing['4'] }}
                          accessibilityRole="button"
                          accessibilityLabel={`${series.devotional.title}, ${series.entryCount} entries`}
                        >
                          <Text
                            style={{
                              fontFamily: FontFamily.display,
                              fontSize: 22,
                              color: colors.text,
                              lineHeight: 28,
                              marginBottom: 2,
                            }}
                            numberOfLines={2}
                          >
                            {series.devotional.title}
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.body,
                              fontSize: FontSize.sm,
                              color: colors.textMuted,
                              lineHeight: 20,
                            }}
                            numberOfLines={1}
                          >
                            {series.entryCount} {series.entryCount === 1 ? 'entry' : 'entries'}
                            {series.scriptures.length > 0
                              ? ` \u00B7 ${series.scriptures.join(', ')}`
                              : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                      })}
                    </>
                  ) : (
                    <View
                      style={{
                        borderRadius: Radius.lg,
                        padding: Spacing['8'],
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.display,
                          fontSize: FontSize['2xl'],
                          color: colors.text,
                          textAlign: 'center',
                          marginBottom: Spacing['2'],
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
                          marginBottom: Spacing['6'],
                        }}
                      >
                        Each day's reflection becomes a letter{'\n'}to your
                        future self.
                      </Text>
                      <View
                        style={{
                          width: '100%',
                          backgroundColor: colors.backgroundElevated,
                          borderRadius: Radius.card,
                          padding: 18,
                          opacity: 0.5,
                          borderWidth: 1,
                          borderColor: colors.border,
                          ...Shadow.sm,
                        }}
                      >
                        <View
                          style={{
                            height: 10,
                            width: '70%',
                            backgroundColor: colors.border,
                            borderRadius: 5,
                            marginBottom: Spacing['2.5'],
                          }}
                        />
                        <View
                          style={{
                            height: 10,
                            width: '90%',
                            backgroundColor: colors.border,
                            borderRadius: 5,
                            marginBottom: Spacing['2.5'],
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
                  )}
                </Animated.View>
              )}
              </Animated.View>
            </GestureDetector>
          )}

          {/* ================================================================ */}
          {/* NOTEBOOK TAB (new content) */}
          {/* ================================================================ */}
          {activeSegment === 'notebook' && (
            <GestureDetector gesture={notebookSwipeGesture}>
              <Animated.View
                entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
                style={notebookSwipeStyle}
              >
                {/* Folder filter chips */}
                <View style={mainStyles.filterRow}>
                <FolderChips
                  folders={folders}
                  activeFolderId={activeFolderId}
                  onSelectFolder={setActiveFolderId}
                  onCreateFolder={() => {
                    setCreateFolderParent(currentParentId
                      ? { id: currentParentId, name: folders.find((f) => f.id === currentParentId)?.name ?? '' }
                      : null
                    );
                    setShowCreateFolderSheet(true);
                  }}
                  onFolderLongPress={handleFolderLongPress}
                  currentParentId={currentParentId}
                  onDrillInto={(folderId) => {
                    setCurrentParentId(folderId);
                    if (folderId) setActiveFolderId(folderId);
                    else setActiveFolderId(null);
                  }}
                />
              </View>

              {/* Notes list or empty state */}
              {filteredNotes.length === 0 ? (
                    !searchQuery.trim() && activeFolderId === null && currentParentId === null ? (
                      <View style={{ paddingHorizontal: Spacing['6'] }}>
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
                            : activeFolderId !== null
                              ? 'No notes in this folder yet.\nLong-press a folder to add subfolders.'
                              : 'No notes here yet.'}
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
            </GestureDetector>
          )}
        </ScrollView>

        {/* FAB — only visible when Notebook segment is active */}
        {activeSegment === 'notebook' && (
          <FloatingActionButton
            onPress={handleCreateNote}
            visible={fabVisible && !showCreateFolderSheet && !showMoveFolderSheet}
            tabBarHeight={tabBarHeight}
          />
        )}

        {/* Undo toast for note/folder deletion */}
        <UndoToast
          visible={undoActions.length > 0}
          message={
            undoActions.length > 1
              ? `${undoActions.length} items deleted`
              : undoActions[0]?.type === 'folder'
              ? `${(undoActions[0] as typeof undoActions[0] & { type: 'folder'; folder: { name: string } }).folder.name} deleted`
              : 'Note deleted'
          }
          onUndo={handleUndoAction}
          onDismiss={handleUndoDismiss}
          duration={undoActions.length > 0 && undoActions[undoActions.length - 1]?.type === 'folder' ? 4000 : 3000}
        />

        {/* Create Folder sheet */}
        <CreateFolderSheet
          visible={showCreateFolderSheet}
          onClose={() => {
            setShowCreateFolderSheet(false);
            setCreateFolderParent(null);
          }}
          onSubmit={handleCreateFolderSubmit}
          parentFolderId={createFolderParent?.id}
          parentFolderName={createFolderParent?.name}
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
          currentParentId={currentParentId}
          onSelect={handleMoveFolderSelect}
          onReorder={reorderFolders}
          onCreateFolder={() => setShowCreateFolderSheet(true)}
          onDeleteFolder={(folderId) => {
            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

            const folder = folders.find((f) => f.id === folderId);
            if (!folder) return;

            const plan = prepareJournalFolderDelete({
              folder,
              folders,
              notes,
              descendantFolderIds: getDescendantFolderIds(folderId),
              activeFolderId,
              currentParentId,
            });

            setUndoActions((prev) => [...prev, plan.undoAction]);
            storeDeleteFolder(folderId, false);

            if (plan.navigation.activeFolderId !== activeFolderId) {
              setActiveFolderId(plan.navigation.activeFolderId);
            }
            if (plan.navigation.currentParentId !== currentParentId) {
              setCurrentParentId(plan.navigation.currentParentId);
            }

            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = setTimeout(() => {
              setUndoActions([]);
            }, 4000);
          }}
        />

        <ExclusiveOfferSheet
          visible={showExclusiveOffer}
          onDismiss={dismissOffer}
          context="churned"
        />

      </SafeAreaView>
    </View>
  );
}

const mainStyles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['2'],
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
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['1'],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing['3.5'],
    paddingVertical: Spacing['2.5'],
    gap: Spacing['2.5'],
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    padding: Spacing['0'],
    paddingVertical: Spacing['1'],
  },
  segmentContainer: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['4'],
    marginBottom: Spacing['4'],
  },
  filterRow: {
    marginBottom: Spacing['4'],
  },
  notesListContainer: {
    paddingHorizontal: Spacing['6'],
  },
  noResultsContainer: {
    borderRadius: Radius.lg,
    padding: Spacing['6'],
    alignItems: 'center',
    marginHorizontal: Spacing['6'],
  },
  noResultsText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
  },
});
