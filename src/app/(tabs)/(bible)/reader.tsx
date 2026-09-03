/** @jsxImportSource react */
import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Platform, Keyboard, Dimensions, type LayoutChangeEvent } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, withTiming, withDelay, withSpring, Easing, runOnJS, useReducedMotion } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { CaretRightIcon, CaretLeftIcon, GearSixIcon, XIcon, BookOpenIcon, HighlighterCircleIcon, NotePencilIcon, NotepadIcon, UploadSimpleIcon, LockSimpleIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { Shadow, elevated } from '@/constants/shadows';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { planHighlightApplication, planHighlightRemoval } from '@/lib/bible-highlight-overlap';
import { useReadingFont } from '@/lib/useReadingFont';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { useBibleChapter } from '@/hooks/useBibleChapter';
import { resolveBibleReaderLocation, resolveTargetVerse } from '@/lib/bible-reader-params';
import { useBibleDb } from '@/hooks/useBibleDb';
import { BIBLE_BOOKS, getNextChapter, getPreviousChapter, formatScriptureReference } from '@/lib/bible-constants';
import type { BibleTranslation } from '@/lib/bible-db';
import { ReadingSettingsSheet } from '@/components/bible/ReadingSettingsSheet';
import { BookChapterNavigator } from '@/components/bible/BookChapterNavigator';
import { DownloadBibleSheet } from '@/components/bible/DownloadBibleSheet';
import { BibleNoteSheet } from '@/components/bible/BibleNoteSheet';
import type { BibleHighlightColor } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { Sheet, alpha } from '@/components/ui';
import { stripHtml, isHtmlContent } from '@/lib/note-html';
import { isRedLetterVerse } from '@/lib/red-letter-verses';
import { getSectionHeadings } from '@/lib/bible-section-headings';
import {
  BIBLE_SELECTED_OVERLAY_BG,
  getBibleTextOverlayStyle,
  nextBibleTabBarStateAfterActions,
  type BibleTextLine,
} from '@/lib/bible-reader-visuals';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { ScriptureExplainSheet } from '@/components/ScriptureExplainSheet';
import { isHighlightColorFree } from '@/lib/premium-gating';
import { buildSelectedPassageForExplanation } from '@/lib/bible-reader-explain';
import type { ScriptureExplainRequest } from '@/lib/scripture-explain-api';
// VerseShareModal removed — now uses share-card route

// ─── Highlight colors ───────────────────────────────────────────────────────

const HIGHLIGHT_BG: Record<BibleHighlightColor, { light: string; dark: string }> = {
  yellow: { light: 'rgba(255, 245, 112, 0.58)', dark: 'transparent' },
  green: { light: 'rgba(190, 244, 128, 0.5)', dark: 'transparent' },
  blue: { light: 'rgba(170, 220, 255, 0.46)', dark: 'transparent' },
  purple: { light: 'rgba(214, 188, 255, 0.44)', dark: 'transparent' },
  red: { light: 'rgba(255, 190, 190, 0.46)', dark: 'transparent' },
};

const HIGHLIGHT_TEXT_DARK: Record<BibleHighlightColor, string> = {
  yellow: '#FFE86A',
  green: '#5CFF63',
  blue: '#77B7FF',
  purple: '#D7A8FF',
  red: '#FF7A7A',
};

const HIGHLIGHT_COLORS: { key: BibleHighlightColor; color: string }[] = [
  { key: 'yellow', color: '#F0C850' },
  { key: 'green', color: '#6BBF7B' },
  { key: 'blue', color: '#6BA3D6' },
  { key: 'purple', color: '#A874C0' },
  { key: 'red', color: '#E87070' },
];

const HEADER_HEIGHT = 52;

// Header overlap: content has paddingTop for the header, but onLayout Y is relative
// to the content container (after padding). scrollTo y=0 puts the first verse behind the header.
// Subtract a small offset so the target verse sits visibly below the header, not behind it.
// Module-scoped so the scroll-to-verse callbacks can keep empty dep arrays.
const headerOverlap = 12; // slight breathing room below the fixed header

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Bible Reader
 *
 *  Verse content:    400ms  fade in on chapter load
 *  Context bar:      180ms  enter (fade + slide up 8px, ease-out-quart)
 *                    100ms  exit (fade only)
 *  Verse flash:      spring in (stiffness 400, damping 20)
 *                    600ms  hold → 600ms fade out (ease-in-cubic)
 *  Toast:            200ms  enter (fade)
 *                    150ms  exit (fade)
 *  Swipe nav:        horizontal pan > 50px + velocity > 400
 *                    triggers chapter change (fade in via verse content)
 * ───────────────────────────────────────────────────────── */

const ANIM = {
  verseFade:     Duration.fast,     // verse content fade in (speed over delight)
  contextEnter:  180,   // context bar enter (fade + slide)
  contextExit:   100,   // context bar exit (fade only)
  flashHold:     600,   // flash highlight hold before fade
  flashOut:      600,   // flash highlight fade out
  toastEnter:    200,   // toast fade in
  toastExit:     150,   // toast fade out
};

const EASE_OUT_QUART = Easing.bezier(0.165, 0.84, 0.44, 1);

// ─── Chapter swipe config ─────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Activate horizontal swipe only after deliberate 20px intent (protects taps + text selection)
const SWIPE_ACTIVATE_X = 20;
// Fail the pan gesture promptly if vertical scroll starts — ScrollView wins
const SWIPE_FAIL_Y = 15;
// Commit threshold: ~10% of screen OR a strong flick
const SWIPE_DISTANCE_THRESHOLD = SCREEN_WIDTH * 0.10;
const SWIPE_VELOCITY_THRESHOLD = 500;
// Maximum visual drag distance — 15% of screen width
const DRAG_MAX = SCREEN_WIDTH * 0.15;
// Rubber-band divisor when there's no chapter to navigate to
const EDGE_RESISTANCE = 3;
// Drag distance at which edge arrow indicators are fully revealed
const ARROW_REVEAL_DISTANCE = DRAG_MAX * 0.6;
// Duration of the "slide off screen" exit after commit
const NAV_EXIT_DURATION = 180;
// Spring back when gesture ends without commit (clamped — raw config is ζ≈0.72, so no-bounce needs overshootClamping)
const SWIPE_SPRING_BACK = { damping: 22, stiffness: 260, mass: 0.9, overshootClamping: true };

// ─── Verse Item with per-line highlight via onTextLayout ────────────────────

// Max finger movement (px) before a tap is cancelled — prevents verse selection
// during swipe attempts. Creates clear zones:
//   0-8px  → tap (verse selected)
//   8-20px → dead zone (nothing fires)
//   20px+  → Pan activates (chapter swipe)
const VERSE_TAP_MAX_DISTANCE = 8;

// Shared "no measurement" value so setting it again is a no-op for React.
const EMPTY_LINES: BibleTextLine[] = [];

// PERF: every prop below must be referentially stable across parent renders or
// React.memo is defeated and a single selection/toast/keyboard state change
// re-renders the whole chapter (176 rows in Psalm 119). That is why `onPress`
// and `onLayout` take the verse number instead of being pre-bound closures —
// the parent passes ONE useCallback-stable function to every row, and the row
// binds its own verse number inside.
const VerseItem = React.memo(function VerseItem({
  verse,
  sectionHeading,
  fontSize,
  lineHeight,
  fontFamily,
  isSelected,
  highlightColor,
  hasNote,
  isFlashing,
  isRedLetter,
  isDark,
  textColor,
  onPress,
  onLayout,
}: {
  verse: { verse: number; text: string };
  /** Section heading rendered above this verse, if the chapter has one here. */
  sectionHeading?: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  isSelected: boolean;
  highlightColor?: BibleHighlightColor;
  hasNote: boolean;
  isFlashing: boolean;
  isRedLetter: boolean;
  isDark: boolean;
  textColor: string;
  onPress: (verseNum: number) => void;
  onLayout: (verseNum: number, y: number) => void;
}) {
  // PERF: onTextLayout fires for every verse when the chapter mounts (176
  // times in Psalm 119) and again whenever a row's text re-lays out, but a row
  // only draws from it while it shows a selection/highlight overlay. The
  // measurement is parked in a ref and promoted to render state only while an
  // overlay is visible, so mounting a chapter no longer re-renders every row.
  const measuredLinesRef = useRef<BibleTextLine[]>(EMPTY_LINES);
  const [textLines, setTextLines] = useState<BibleTextLine[]>(EMPTY_LINES);
  const verseNum = verse.verse;
  const reducedMotion = useReducedMotion();

  // Flash animation: quick fade in → hold → smooth fade out
  const flashOpacity = useSharedValue(0);
  useEffect(() => {
    if (isFlashing) {
      if (reducedMotion) {
        // Skip the fade choreography — jump to the flash color, then clear after the hold.
        flashOpacity.value = 1;
        flashOpacity.value = withDelay(ANIM.flashHold, withTiming(0, { duration: 0 }));
        return;
      }
      // Fast fade in (200ms), then after holding, fade out over 600ms
      flashOpacity.value = withTiming(1, { duration: Duration.normal, easing: EASE_OUT_QUART }, () => {
        // After reaching full opacity, hold then fade out
        flashOpacity.value = withDelay(ANIM.flashHold,
          withTiming(0, { duration: ANIM.flashOut, easing: Easing.in(Easing.cubic) }),
        );
      });
    } else {
      flashOpacity.value = 0;
    }
  }, [flashOpacity, isFlashing, reducedMotion]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  // Press-down opacity feedback (replaces TouchableOpacity's activeOpacity)
  const pressOpacity = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    opacity: pressOpacity.value,
  }));

  // Tap gesture with maxDistance — cancels if finger moves >8px (swipe intent)
  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .maxDistance(VERSE_TAP_MAX_DISTANCE)
      .onBegin(() => {
        'worklet';
        pressOpacity.value = withTiming(0.8, { duration: 80 });
      })
      .onEnd(() => {
        'worklet';
        runOnJS(onPress)(verseNum);
      })
      .onFinalize(() => {
        'worklet';
        pressOpacity.value = withTiming(1, { duration: 120 });
      }),
    [onPress, pressOpacity, verseNum],
  );

  // Row layout capture for scroll-to-verse. Bound here (not in the parent's
  // map callback) so the parent can pass one stable `onLayout` to every row.
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onLayout(verseNum, e.nativeEvent.layout.y),
    [onLayout, verseNum],
  );

  const hasOverlay = isSelected || (!!highlightColor && !isDark);

  // Selection: subtle text-line mark, not a chunky inverted block.
  const selectionBg = isDark ? BIBLE_SELECTED_OVERLAY_BG.dark : BIBLE_SELECTED_OVERLAY_BG.light;

  // Highlight bg
  const hlBg = highlightColor
    ? (isDark ? HIGHLIGHT_BG[highlightColor].dark : HIGHLIGHT_BG[highlightColor].light)
    : undefined;

  // Flash highlight color — white glow on dark, subtle gray on light
  const flashBg = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.10)';

  // Red-letter: bright warm red for Jesus's words
  const redLetterColor = isDark ? '#F56B5E' : '#C0392B';
  const selectedTextColor = isSelected ? (isDark ? '#221B12' : '#FFFDF8') : undefined;
  const savedHighlightTextColor = highlightColor && isDark ? HIGHLIGHT_TEXT_DARK[highlightColor] : undefined;
  const displayText = selectedTextColor ?? savedHighlightTextColor ?? (isRedLetter ? redLetterColor : textColor);
  const overlayBg = isSelected ? selectionBg : hlBg;

  const handleTextLayout = useCallback((e: any) => {
    const lines = e.nativeEvent.lines;
    if (lines?.length > 0) {
      const measured: BibleTextLine[] = lines.map((l: any) => ({
        x: l.x, y: l.y, width: l.width, height: l.height,
      }));
      measuredLinesRef.current = measured;
      // Only a visible overlay renders from the lines; hidden rows keep the
      // measurement in the ref without a state write (and a re-render).
      if (hasOverlay) setTextLines(measured);
    }
  }, [hasOverlay]);

  // Promote the parked measurement the moment an overlay is needed — a layout
  // effect so the rects land in the synchronous follow-up render — and drop it
  // when the overlay goes away so a stale measurement is never drawn. On mount
  // (no overlay) this sets the initial EMPTY_LINES again, which React skips.
  useLayoutEffect(() => {
    setTextLines(hasOverlay ? measuredLinesRef.current : EMPTY_LINES);
  }, [hasOverlay]);

  const verseNumSize = Math.max(11, Math.round(fontSize * 0.55));

  return (
    <View onLayout={handleLayout}>
      {/* Section heading before this verse */}
      {sectionHeading ? (
        <Text style={[
          styles.sectionHeading,
          {
            color: textColor,
            fontFamily,
            fontSize: fontSize + 1,
            lineHeight: Math.round((fontSize + 1) * 1.4),
          },
        ]}>
          {sectionHeading}
        </Text>
      ) : null}
      <GestureDetector gesture={tapGesture}>
      <Animated.View
        style={[styles.verseRow, pressStyle]}
        accessible
        testID={`bible-verse-${verse.verse}`}
        accessibilityLabel={`Verse ${verse.verse}: ${verse.text}`}
      >
        {/* Flash highlight overlay (full row, fades in then out) — always mounted so animation plays */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: flashBg, borderRadius: 6, marginHorizontal: -6, marginVertical: -2 },
            flashStyle,
          ]}
          pointerEvents="none"
        />

        {/* Per-line highlight / selection rectangles (behind text) */}
        {hasOverlay && overlayBg && textLines.map((line, i) => (
          <View
            key={i}
            style={[
              getBibleTextOverlayStyle(line, isSelected ? (isDark ? 'selectedDark' : 'selectedLight') : 'saved'),
              { backgroundColor: overlayBg },
            ]}
          />
        ))}

        {/* Text */}
        <Text
          onTextLayout={handleTextLayout}
          style={{
            fontSize,
            lineHeight,
            fontFamily,
            color: displayText,
            letterSpacing: 0.15,
          }}
        >
          <Text style={{
            fontSize: verseNumSize,
            lineHeight,
            fontFamily: FontFamily.uiMedium,
            color: displayText,
            opacity: isSelected ? 0.6 : 0.5,
          }}>
            {verse.verse}{' '}
          </Text>
          {hasNote && (
            <Text
              style={{
                fontSize: Math.max(8, Math.round(fontSize * 0.5)),
                lineHeight,
                fontFamily: FontFamily.uiMedium,
                color: isDark ? '#F5B041' : '#C87F0A',
              }}
            >
              {'● '}
            </Text>
          )}
          {verse.text}
        </Text>
      </Animated.View>
      </GestureDetector>
    </View>
  );
});

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function BibleReaderScreen() {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string; chapter: string; verse?: string }>();
  // P3-4: clamp to the canon (1–66) and to the book's real chapter count so an
  // out-of-range deep link lands on the nearest real chapter, not an empty query.
  const { bookId, chapter } = resolveBibleReaderLocation(params);

  const { isReady: isDbReady, isDownloading, progress: downloadProgress, download: downloadDb, error: downloadError } = useBibleDb();
  const bibleReaderSettings = useUnfoldStore((s) => s.bibleReaderSettings);
  const bibleHighlights = useUnfoldStore((s) => s.bibleHighlights);
  const addBibleHighlight = useUnfoldStore((s) => s.addBibleHighlight);
  const removeBibleHighlight = useUnfoldStore((s) => s.removeBibleHighlight);
  const updateBibleHighlightNote = useUnfoldStore((s) => s.updateBibleHighlightNote);
  const recordBibleReading = useUnfoldStore((s) => s.recordBibleReading);

  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + insets.bottom;
  const readingFont = useReadingFont();
  const book = useMemo(() => BIBLE_BOOKS.find((b) => b.id === bookId), [bookId]);
  const { verses, isLoading } = useBibleChapter({
    bookId,
    chapter,
    translation: bibleReaderSettings.translation as BibleTranslation,
  });

  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [showActions, setShowActions] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [flashVerse, setFlashVerse] = useState<number | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const noteInputRef = useRef<TextInput>(null);
  // Note viewer sheet — opened when tapping an inline note marker
  const [noteSheetHighlight, setNoteSheetHighlight] = useState<import('@/lib/store').BibleHighlight | null>(null);
  // Notebook notes anchored to the visible chapter (subtle header indicator)
  const [showChapterNotes, setShowChapterNotes] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Premium gating for highlight colors
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const [showHighlightPremiumSheet, setShowHighlightPremiumSheet] = useState(false);
  // shareModalData removed — share navigates to /share-card route
  const [showExplainSheet, setShowExplainSheet] = useState(false);
  const [selectedExplanationInput, setSelectedExplanationInput] = useState<ScriptureExplainRequest | null>(null);
  // PERF: a ref, not state — nothing renders off it, and keeping it out of
  // render state is what lets `handleVerseLayout` stay referentially stable
  // (see VerseItem's memo contract).
  const pendingScrollVerseRef = useRef<number | null>(null);
  const [scrollToVerse, setScrollToVerse] = useState<number | null>(null);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const verseLayoutsRef = useRef<Record<number, number>>({});
  const verseLayoutsChapterRef = useRef<string>('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setTabBarHidden = useUIState((state) => state.setTabBarHidden);
  const tabBarHiddenRef = useRef(false);
  // Track if tab bar was scroll-hidden BEFORE verse selection began.
  const wasScrollHiddenRef = useRef(false);

  // ─── Scroll-driven tab bar state (UI thread) ──────────────────────────────
  // Shared-value mirrors of the JS-side scroll bookkeeping. The scroll handler
  // runs as a worklet on the UI thread and only crosses back to JS on an actual
  // show/hide threshold crossing (previously a JS callback ran every 16ms and
  // read/wrote a global zustand store from the scroll path).
  const lastScrollY = useSharedValue(0);
  const tabBarHiddenSV = useSharedValue(false);
  const showActionsSV = useSharedValue(false);

  // Invalidate cached verse Y positions when chapter changes. onLayout Ys are
  // specific to the rendered verses; carrying them across chapters would make
  // scroll-to-verse land on the wrong position (e.g., verse 9 of old chapter).
  const chapterKey = `${bookId}:${chapter}`;
  if (verseLayoutsChapterRef.current !== chapterKey) {
    verseLayoutsRef.current = {};
    verseLayoutsChapterRef.current = chapterKey;
  }

  // Context bar slide-up animation
  const contextBarSlideY = useSharedValue(8);
  useEffect(() => {
    if (showActions) {
      contextBarSlideY.value = reducedMotion
        ? 0
        : withTiming(0, { duration: ANIM.contextEnter, easing: EASE_OUT_QUART });
    } else {
      contextBarSlideY.value = 8;
    }
  }, [contextBarSlideY, showActions, reducedMotion]);
  const contextBarSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contextBarSlideY.value }],
  }));

  // Track keyboard height so note input stays above keyboard
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Single writer for tab bar visibility: keeps the global store, the JS ref
  // (read by the selection effects) and the UI-thread mirror in lockstep.
  const applyTabBarHidden = useCallback((hidden: boolean, mode?: 'slide' | 'instant') => {
    setTabBarHidden(hidden, mode);
    tabBarHiddenRef.current = hidden;
    tabBarHiddenSV.value = hidden;
  }, [setTabBarHidden, tabBarHiddenSV]);

  const restoreTabBarForClosedActions = useCallback(() => {
    const tabBarState = nextBibleTabBarStateAfterActions({
      showActions: false,
      wasScrollHiddenBeforeActions: wasScrollHiddenRef.current,
    });
    applyTabBarHidden(tabBarState.hidden, tabBarState.mode);
  }, [applyTabBarHidden]);

  // State-driven scroll-to-verse (runs after render when refs are guaranteed set)
  useEffect(() => {
    if (scrollToVerse === null) return;
    const verse = scrollToVerse;
    setScrollToVerse(null);

    // Delay to let navigator exit animation complete, then scroll
    setTimeout(() => {
      const knownY = verseLayoutsRef.current[verse];

      if (knownY !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, knownY - headerOverlap), animated: true });
        setFlashVerse(verse);
        setTimeout(() => setFlashVerse(null), 2000);
      }
    }, 300);
  }, [scrollToVerse]);

  // Build highlight map for this chapter
  const highlights = useMemo(
    () => bibleHighlights.filter((h) => h.bookId === bookId && h.chapter === chapter),
    [bibleHighlights, bookId, chapter],
  );

  const highlightMap = useMemo(() => {
    const map: Record<number, BibleHighlightColor> = {};
    for (const h of highlights) {
      if (h.color === null) continue; // note-only entries — no visual highlight
      for (let v = h.verseStart; v <= h.verseEnd; v++) {
        map[v] = h.color;
      }
    }
    return map;
  }, [highlights]);

  // Map of verse → highlight with a non-empty note. Used to render the inline
  // note marker next to the verse number. If a verse has multiple overlapping
  // notes, the most recently updated one wins.
  const noteMap = useMemo(() => {
    const map: Record<number, import('@/lib/store').BibleHighlight> = {};
    const sorted = [...highlights].sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? a.createdAt).getTime();
      const bTime = new Date(b.updatedAt ?? b.createdAt).getTime();
      return aTime - bTime; // oldest first so newer overwrites
    });
    for (const h of sorted) {
      if (!h.note || !h.note.trim()) continue;
      for (let v = h.verseStart; v <= h.verseEnd; v++) {
        map[v] = h;
      }
    }
    return map;
  }, [highlights]);

  // ─── Notebook notes anchored to this chapter ────────────────────────────
  // Read-side bridge between the Notebook and the Bible reader: the store's
  // getNotesForScripture owns the anchoring rules (bibleBookId/bibleChapter
  // or scriptureRefs). Memoized so it recomputes only when the chapter or
  // the Notebook data changes — never per scroll frame.
  const getNotesForScripture = useUnfoldStore((s) => s.getNotesForScripture);
  const notebookNotes = useUnfoldStore((s) => s.notes);
  const chapterNotebookNotes = useMemo(() => {
    // `notebookNotes` is referenced so edits/deletes in the Notebook refresh
    // the indicator; the getter reads the same slice from the store.
    void notebookNotes;
    return getNotesForScripture(bookId, chapter);
  }, [notebookNotes, getNotesForScripture, bookId, chapter]);

  const handleOpenChapterNotes = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowChapterNotes(true);
  }, []);

  const handleOpenNotebookNote = useCallback((noteId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowChapterNotes(false);
    router.push({
      pathname: '/(tabs)/(journal)/note-detail',
      params: { noteId },
    });
  }, [router]);

  // Parse verse param — clamped to the loaded chapter's last verse (P3-4).
  const targetVerse = useMemo(() => resolveTargetVerse(params.verse, verses), [params.verse, verses]);

  // Record reading position on chapter change
  // Scroll-to-top is handled by navigateChapter / handleNavigatorSelect
  useEffect(() => {
    if (book) {
      recordBibleReading({ bookId, bookName: book.name, chapter, translation: bibleReaderSettings.translation });
    }
  }, [bookId, chapter, book, recordBibleReading, bibleReaderSettings.translation]);

  // Set pending scroll verse when target verse param is present
  useEffect(() => {
    if (targetVerse && verses && verses.length > 0 && !isLoading) {
      // Clear the verse param so it doesn't re-trigger
      router.setParams({ verse: undefined as any });

      // If the position is already known (same chapter), scroll immediately
      const knownY = verseLayoutsRef.current[targetVerse];
      if (knownY !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, knownY - headerOverlap), animated: true });
        setFlashVerse(targetVerse);
        setTimeout(() => setFlashVerse(null), 2000);
      } else {
        // Position unknown (new chapter) — wait for onLayout
        pendingScrollVerseRef.current = targetVerse;
      }
    }
  }, [targetVerse, verses, isLoading, router]);

  // Called from onLayout — scrolls to verse once its position is known.
  // Stable identity ([] deps): every verse row receives this same function, so
  // it never invalidates VerseItem's memo.
  const handleVerseLayout = useCallback((verseNum: number, y: number) => {
    verseLayoutsRef.current[verseNum] = y;
    if (pendingScrollVerseRef.current === verseNum) {
      pendingScrollVerseRef.current = null;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - headerOverlap), animated: true });
      setFlashVerse(verseNum);
      setTimeout(() => setFlashVerse(null), 2000);
    }
  }, []);

  // ─── Verse selection ────────────────────────────────────────────────────────

  const handleVersePress = useCallback((verseNum: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowColorPicker(false);
    setSelectedVerses((prev) => {
      const next = new Set(prev);
      if (next.has(verseNum)) {
        next.delete(verseNum);
      } else {
        next.add(verseNum);
      }
      if (next.size === 0) {
        restoreTabBarForClosedActions();
      }
      setShowActions(next.size > 0);
      return next;
    });
  }, [restoreTabBarForClosedActions]);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const handleHighlight = useCallback((color: BibleHighlightColor) => {
    if (!verses || selectedVerses.size === 0 || !book) return;

    const plan = planHighlightApplication({
      chapterHighlights: highlights,
      selectedVerses: Array.from(selectedVerses),
      color,
      translation: bibleReaderSettings.translation,
      bookId,
      bookName: book.name,
      chapter,
      verseText: (v) => verses.find((vr) => vr.verse === v)?.text ?? '',
    });

    for (const id of plan.toRemove) removeBibleHighlight(id);
    for (const h of plan.toAdd) addBibleHighlight(h);

    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [verses, selectedVerses, book, bookId, chapter, addBibleHighlight, removeBibleHighlight, highlights, bibleReaderSettings.translation, restoreTabBarForClosedActions]);

  const handleCopy = useCallback(async () => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted.map((v) => verses.find((vr) => vr.verse === v)?.text ?? '').join(' ');
    const refStr = formatScriptureReference(book.name, chapter, sorted[0], sorted[sorted.length - 1]);

    await Clipboard.setStringAsync(`${selectedTexts}\n— ${refStr} (${bibleReaderSettings.translation})`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`${refStr} copied`);
    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
  }, [verses, selectedVerses, book, chapter, bibleReaderSettings.translation, showToast, restoreTabBarForClosedActions]);

  const handleExplain = useCallback(() => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const input = buildSelectedPassageForExplanation({
      verses,
      selectedVerses,
      bookName: book.name,
      chapter,
      translation: bibleReaderSettings.translation,
    });
    if (!input) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedExplanationInput(input);
    setShowExplainSheet(true);
    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
  }, [verses, selectedVerses, book, chapter, bibleReaderSettings.translation, restoreTabBarForClosedActions]);

  const handleShare = useCallback(() => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted.map((v) => verses.find((vr) => vr.verse === v)?.text ?? '').join(' ');
    const refStr = formatScriptureReference(book.name, chapter, sorted[0], sorted[sorted.length - 1]);

    router.push({
      pathname: '/share-card',
      params: {
        text: selectedTexts,
        reference: refStr,
        translation: bibleReaderSettings.translation,
        type: 'verse',
      },
    });
    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
  }, [verses, selectedVerses, book, chapter, bibleReaderSettings.translation, router, restoreTabBarForClosedActions]);

  const handleRemoveHighlight = useCallback(() => {
    const plan = planHighlightRemoval({
      chapterHighlights: highlights,
      selectedVerses: Array.from(selectedVerses),
      translation: bibleReaderSettings.translation,
    });
    for (const id of plan.toRemove) removeBibleHighlight(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
  }, [selectedVerses, highlights, removeBibleHighlight, bibleReaderSettings.translation, restoreTabBarForClosedActions]);

  const handleNote = useCallback(() => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // If the selection overlaps a highlight that already has a non-empty note,
    // open the read-first bottom sheet. Otherwise open the inline composer.
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const existingHL = highlights.find((h) =>
      sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)
    );
    if (existingHL && existingHL.note && existingHL.note.trim()) {
      restoreTabBarForClosedActions();
      setSelectedVerses(new Set());
      setShowActions(false);
      setNoteSheetHighlight(existingHL);
      return;
    }
    setNoteText('');
    setShowNoteInput(true);
    setShowColorPicker(false);
    setTimeout(() => noteInputRef.current?.focus(), 100);
  }, [verses, selectedVerses, book, highlights, restoreTabBarForClosedActions]);

  const handleSaveNote = useCallback(() => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const verseStart = sorted[0];
    const verseEnd = sorted[sorted.length - 1];

    // Find existing highlight for these verses
    const existingHL = highlights.find((h) =>
      sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)
    );

    if (existingHL) {
      updateBibleHighlightNote(existingHL.id, noteText.trim());
    } else {
      // Note-only entry: no visual highlight, just a marker next to verse number.
      // color=null distinguishes "note" from "highlight" in the same data model.
      const selectedTexts = sorted.map((v) => verses.find((vr) => vr.verse === v)?.text ?? '').join(' ');
      addBibleHighlight({
        bookId,
        bookName: book.name,
        chapter,
        verseStart,
        verseEnd,
        text: selectedTexts,
        color: null,
        note: noteText.trim(),
        translation: bibleReaderSettings.translation,
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const refStr = formatScriptureReference(book.name, chapter, verseStart, verseEnd);
    showToast(noteText.trim() ? `Note saved on ${refStr}` : `Note removed from ${refStr}`);
    setShowNoteInput(false);
    setNoteText('');
    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
  }, [verses, selectedVerses, book, chapter, highlights, noteText, bookId, bibleReaderSettings.translation, addBibleHighlight, updateBibleHighlightNote, showToast, restoreTabBarForClosedActions]);

  // ─── Existing highlight color for selected verses ──────────────────────────

  const existingHighlightColor = useMemo((): BibleHighlightColor | undefined => {
    for (const v of selectedVerses) {
      if (highlightMap[v]) return highlightMap[v];
    }
    return undefined;
  }, [selectedVerses, highlightMap]);

  // ─── Chapter navigation ───────────────────────────────────────────────────

  const nextChapter = useMemo(() => getNextChapter(bookId, chapter), [bookId, chapter]);
  const prevChapter = useMemo(() => getPreviousChapter(bookId, chapter), [bookId, chapter]);
  const canGoNext = nextChapter !== null;

  const nextBookName = useMemo(() => {
    if (!nextChapter) return null;
    return BIBLE_BOOKS.find((b) => b.id === nextChapter.bookId)?.name ?? null;
  }, [nextChapter]);

  const navigateChapter = useCallback((dir: -1 | 1) => {
    const target = dir === 1 ? nextChapter : prevChapter;
    if (!target) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    router.setParams({ bookId: String(target.bookId), chapter: String(target.chapter) });
  }, [nextChapter, prevChapter, router, restoreTabBarForClosedActions]);

  const handleNavigatorSelect = useCallback((selectedBookId: number, selectedChapter: number, verse?: number) => {
    setShowNavigator(false);
    restoreTabBarForClosedActions();
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);

    const sameChapter = selectedBookId === bookId && selectedChapter === chapter;

    if (verse && sameChapter) {
      // Trigger scroll via state — useEffect handles it after render
      setScrollToVerse(verse);
      return;
    }

    if (!verse) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    router.setParams({
      bookId: String(selectedBookId),
      chapter: String(selectedChapter),
      ...(verse ? { verse: String(verse) } : {}),
    });
  }, [router, bookId, chapter, restoreTabBarForClosedActions]);

  // ─── Reading settings ─────────────────────────────────────────────────────

  const { fontSize, lineHeightMultiplier } = bibleReaderSettings;
  const lineHeight = Math.round(fontSize * Math.max(lineHeightMultiplier, 1.8));

  const isCrossBook = nextChapter !== null && nextChapter.bookId !== bookId;
  const isEndOfBible = nextChapter === null && bookId === 66;

  // ─── Section headings for this chapter ──────────────────────────────────
  const sectionHeadings = useMemo(
    () => getSectionHeadings(bookId, chapter),
    [bookId, chapter],
  );
  // Build a map: verse number → heading that appears before it
  const headingBeforeVerse = useMemo(() => {
    const map: Record<number, string> = {};
    for (const h of sectionHeadings) {
      map[h.beforeVerse] = h.title;
    }
    return map;
  }, [sectionHeadings]);

  // ─── Swipe gesture for chapter navigation ─────────────────────────────────
  // Drag-following: content translates with finger + edge arrow indicators
  // reveal as drag progresses. Commit on distance OR velocity threshold.

  const dragX = useSharedValue(0);

  // Reset drag position whenever chapter changes (after navigation completes
  // or if the user jumps via the navigator). Guarantees new chapter content
  // renders centered, not off-screen from a prior swipe exit.
  useEffect(() => {
    dragX.value = 0;
  }, [bookId, chapter, dragX]);

  const contentTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));

  // Left arrow fades in when dragging RIGHT (revealing previous chapter)
  const leftArrowStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, dragX.value) / ARROW_REVEAL_DISTANCE);
    return {
      opacity: progress,
      transform: [
        { translateX: -16 + progress * 16 },
        { scale: 0.85 + progress * 0.15 },
      ],
    };
  });

  // Right arrow fades in when dragging LEFT (revealing next chapter)
  const rightArrowStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, -dragX.value) / ARROW_REVEAL_DISTANCE);
    return {
      opacity: progress,
      transform: [
        { translateX: 16 - progress * 16 },
        { scale: 0.85 + progress * 0.15 },
      ],
    };
  });

  // The scroll view's native gesture, made explicit so the chapter-swipe pan
  // can declare a relation against it. Without this the native scroll wins
  // the arbitration for any swipe with a real vertical component — a casual
  // arced thumb flick scrolled a few px instead of turning the chapter, which
  // read as "swipe does nothing" (tester report, 2026-08-02). A ref to a plain
  // RN/Reanimated ScrollView silently no-ops in gesture relations; Gesture.Native
  // wrapping the scroll view is the composition RNGH actually honors.
  const nativeScrollGesture = useMemo(() => Gesture.Native(), []);

  const swipeGesture = useMemo(() =>
    Gesture.Pan()
      // Make the vertical scroll wait until this pan has failed. Cost: vertical
      // scrolls begin after ~SWIPE_FAIL_Y px instead of immediately; gain: an
      // arced flick turns the chapter instead of being stolen by the scroll.
      .blocksExternalGesture(nativeScrollGesture)
      .activeOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
      .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
      .onUpdate((e) => {
        'worklet';
        let tx = e.translationX;
        // Apply rubber-band resistance when there's no chapter to go to
        if (tx > 0 && !prevChapter) {
          tx = tx / EDGE_RESISTANCE;
        } else if (tx < 0 && !nextChapter) {
          tx = tx / EDGE_RESISTANCE;
        }
        // Damped resistance: drag follows finger up to DRAG_MAX, then tapers off
        // Formula: DRAG_MAX * tanh(tx / DRAG_MAX) — gives smooth asymptotic limit
        const sign = tx >= 0 ? 1 : -1;
        const abs = Math.abs(tx);
        const damped = DRAG_MAX * (abs / (abs + DRAG_MAX));
        dragX.value = sign * damped;
      })
      .onEnd((e) => {
        'worklet';
        const tx = e.translationX;
        const vx = e.velocityX;
        const goPrev = !!prevChapter && (tx > SWIPE_DISTANCE_THRESHOLD || vx > SWIPE_VELOCITY_THRESHOLD);
        const goNext = !!nextChapter && (tx < -SWIPE_DISTANCE_THRESHOLD || vx < -SWIPE_VELOCITY_THRESHOLD);

        if (goPrev && tx > 0) {
          if (reducedMotion) {
            // Skip the decorative settle-to-edge, jump straight to the next chapter.
            dragX.value = 0;
            runOnJS(navigateChapter)(-1);
          } else {
            // Quick settle to max drag distance, then navigate
            dragX.value = withTiming(
              DRAG_MAX,
              { duration: NAV_EXIT_DURATION, easing: EASE_OUT_QUART },
              () => { runOnJS(navigateChapter)(-1); },
            );
          }
        } else if (goNext && tx < 0) {
          if (reducedMotion) {
            // Skip the decorative settle-to-edge, jump straight to the next chapter.
            dragX.value = 0;
            runOnJS(navigateChapter)(1);
          } else {
            // Quick settle to max drag distance, then navigate
            dragX.value = withTiming(
              -DRAG_MAX,
              { duration: NAV_EXIT_DURATION, easing: EASE_OUT_QUART },
              () => { runOnJS(navigateChapter)(1); },
            );
          }
        } else if (reducedMotion) {
          // No commit — snap back to center instantly instead of springing
          dragX.value = 0;
        } else {
          // No commit — spring back to center (critically damped)
          dragX.value = withSpring(0, SWIPE_SPRING_BACK);
        }
      }),
    [prevChapter, nextChapter, navigateChapter, dragX, nativeScrollGesture, reducedMotion],
  );

  // ─── Tab bar hide/show on scroll ──────────────────────────────────────────

  // JS-side commit of a scroll-driven show/hide. Called via runOnJS ONLY on an
  // actual threshold crossing (a few times per scroll gesture), never per frame.
  // Mirrors the pre-Reanimated behavior: scroll-driven changes always animate
  // ('slide' — the store's default mode).
  const commitScrollTabBarHidden = useCallback((hidden: boolean) => {
    setTabBarHidden(hidden);
    tabBarHiddenRef.current = hidden;
  }, [setTabBarHidden]);

  // UI-thread scroll handler. Thresholds and direction logic are byte-for-byte
  // the previous JS implementation: top-of-list (y <= 10) always reveals,
  // >5px downward hides, >5px upward reveals, and while the context action bar
  // is up the scroll position is tracked but the tab bar is left alone.
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      if (showActionsSV.value) { lastScrollY.value = y; return; }
      const diff = y - lastScrollY.value;
      if (y <= 10) {
        if (tabBarHiddenSV.value) {
          tabBarHiddenSV.value = false;
          runOnJS(commitScrollTabBarHidden)(false);
        }
      } else if (diff > 5 && !tabBarHiddenSV.value) {
        tabBarHiddenSV.value = true;
        runOnJS(commitScrollTabBarHidden)(true);
      } else if (diff < -5 && tabBarHiddenSV.value) {
        tabBarHiddenSV.value = false;
        runOnJS(commitScrollTabBarHidden)(false);
      }
      lastScrollY.value = y;
    },
  });

  useEffect(() => {
    return () => setTabBarHidden(false);
  }, [setTabBarHidden]);

  // Hide tab bar when context actions show — instant snap, no animation (prevents flash)
  useEffect(() => {
    // Mirror to the UI thread so the scroll worklet can skip tab bar work
    // while the context action bar owns the bottom of the screen.
    showActionsSV.value = showActions;

    const tabBarState = nextBibleTabBarStateAfterActions({
      showActions,
      wasScrollHiddenBeforeActions: wasScrollHiddenRef.current,
    });

    if (showActions) {
      // Remember if tab bar was already hidden from scrolling
      wasScrollHiddenRef.current = tabBarHiddenRef.current;
      // Instantly hide tab bar (context bar covers its spot)
      applyTabBarHidden(tabBarState.hidden, tabBarState.mode);
    } else {
      if (wasScrollHiddenRef.current) {
        // Tab bar was already scroll-hidden — keep it hidden, but force instant
        // mode so the context bar cannot briefly reveal content underneath.
        applyTabBarHidden(tabBarState.hidden, tabBarState.mode);
      } else {
        // Instantly restore tab bar — it renders on top of context bar (higher z),
        // so context bar unmount happens invisibly behind it. Zero flash.
        applyTabBarHidden(tabBarState.hidden, tabBarState.mode);
      }
    }
  }, [showActions, applyTabBarHidden, showActionsSV]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="bible-reader-screen">
      {/* Header — hidden when navigator is open to prevent double-header jitter */}
      <View style={[styles.header, {
        paddingTop: insets.top + 4,
        borderBottomColor: alpha(colors.text, 0.04),
        backgroundColor: colors.background,
        opacity: showNavigator ? 0 : 1,
      }]}>
        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          style={styles.headerButton}
          testID="reader-settings-button"
          accessibilityLabel="Reader settings"
          accessibilityRole="button"
          hitSlop={8}
        >
          <GearSixIcon size={20} color={colors.text} weight="light" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowNavigator(true)}
          style={styles.headerCenter}
          activeOpacity={0.6}
          testID="reader-chapter-title"
          accessibilityLabel={`${book?.name ?? ''} chapter ${chapter}. Tap to navigate.`}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={[styles.headerBook, { color: colors.text, fontFamily: FontFamily.uiMedium }]} numberOfLines={1}>
            {book?.name ?? ''}
          </Text>
          <Text style={[styles.headerChapter, { color: colors.textSubtle }]}>
            {chapter}
          </Text>
        </TouchableOpacity>

        {chapterNotebookNotes.length > 0 ? (
          <TouchableOpacity
            onPress={handleOpenChapterNotes}
            style={styles.headerButton}
            testID="reader-chapter-notes-badge"
            accessibilityRole="button"
            accessibilityLabel={`${chapterNotebookNotes.length} notebook ${chapterNotebookNotes.length === 1 ? 'note' : 'notes'} reference this chapter`}
            hitSlop={8}
          >
            <NotepadIcon size={20} color={colors.text} weight="light" />
            <View style={[styles.headerNoteBadge, { backgroundColor: colors.accent }]}>
              <Text style={[styles.headerNoteBadgeText, { color: colors.background }]}>
                {chapterNotebookNotes.length}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {/* Scroll content — wrapped in gesture detector for swipe chapter navigation */}
      <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[styles.flex, contentTranslateStyle]}>
      <GestureDetector gesture={nativeScrollGesture}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        // Kept at 16 (Animated.ScrollView would otherwise default to 1) so the
        // per-event 5px direction thresholds keep the exact sensitivity they
        // had with the old JS handler — at throttle 1 a 120Hz display would
        // halve the time window each threshold is measured over.
        scrollEventThrottle={16}
        style={styles.flex}
        contentContainerStyle={[styles.versesContent, { paddingTop: insets.top + HEADER_HEIGHT + 16, paddingBottom: tabBarHeight + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {!isDbReady ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'] }}>
            <DownloadBibleSheet
              visible
              onComplete={() => {}}
              colors={colors}
              isDark={isDark}
              progress={downloadProgress}
              isDownloading={isDownloading}
              error={downloadError}
              onDownload={downloadDb}
            />
          </View>
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.textSubtle} size="small" />
          </View>
        ) : (
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(ANIM.verseFade).easing(Ease.out)}>
            {/* PERF: no inline closures here — `handleVersePress` and
                `handleVerseLayout` are useCallback-stable and every other prop
                is a primitive, so React.memo on VerseItem actually holds and a
                selection/toast/keyboard change re-renders only the affected
                rows instead of the whole chapter. */}
            {verses?.map((v) => (
              <VerseItem
                key={v.verse}
                verse={v}
                sectionHeading={headingBeforeVerse[v.verse]}
                fontSize={fontSize}
                lineHeight={lineHeight}
                fontFamily={readingFont.body}
                isSelected={selectedVerses.has(v.verse)}
                highlightColor={highlightMap[v.verse]}
                hasNote={!!noteMap[v.verse]}
                isFlashing={flashVerse === v.verse}
                isRedLetter={isRedLetterVerse(bookId, chapter, v.verse)}
                isDark={isDark}
                textColor={colors.text}
                onPress={handleVersePress}
                onLayout={handleVerseLayout}
              />
            ))}

            {/* End-of-chapter ornament */}
            <View style={styles.endMarker}>
              <Text style={[styles.endOrnament, { color: colors.textHint }]}>
                {'\u00B7\u00B7\u00B7'}
              </Text>
            </View>

            {/* Next chapter prompt */}
            {isEndOfBible ? (
              <View style={styles.endOfBibleContainer}>
                <Text style={[styles.endOfBibleText, { color: colors.textSubtle }]}>
                  You've reached the end of the Bible
                </Text>
              </View>
            ) : canGoNext && (
              <TouchableOpacity
                onPress={() => navigateChapter(1)}
                style={[
                  styles.nextChapterPrompt,
                  {
                    borderColor: alpha(colors.accent, 0.24),
                    backgroundColor: alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8),
                  },
                ]}
                activeOpacity={0.6}
                accessibilityLabel={isCrossBook ? `Continue to ${nextBookName}` : `Continue to chapter ${nextChapter?.chapter}`}
              >
                {isCrossBook ? (
                  <View style={styles.crossBookPrompt}>
                    <Text style={[styles.nextChapterText, { color: colors.text }]}>Continue to {nextBookName}</Text>
                    <Text style={[styles.crossBookSubtitle, { color: colors.textHint }]}>Chapter 1</Text>
                  </View>
                ) : (
                  <Text style={[styles.nextChapterText, { color: colors.text }]}>
                    Continue to Chapter {nextChapter?.chapter}
                  </Text>
                )}
                <CaretRightIcon size={14} color={colors.accent} weight="bold" />
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
      </Animated.ScrollView>
      </GestureDetector>
      </Animated.View>
      </GestureDetector>

      {/* ─── Edge arrow indicators (appear during horizontal drag) ───────── */}
      <Animated.View
        pointerEvents="none"
        style={[styles.edgeArrow, styles.edgeArrowLeft, leftArrowStyle]}
      >
        <CaretLeftIcon size={20} color={colors.textMuted} weight="bold" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.edgeArrow, styles.edgeArrowRight, rightArrowStyle]}
      >
        <CaretRightIcon size={20} color={colors.textMuted} weight="bold" />
      </Animated.View>

      {/* ─── Context Bar — replaces bottom tab bar when verses selected ──── */}
      {/* No opacity enter/exit: the bar must cover the bottom immediately so content never flashes through. */}
      {showActions && (
        <Animated.View
          style={[
            styles.contextBarFull,
            {
              // Near-opaque iOS system surface tone (not the app's warm text/border
              // palette) — chosen for max legibility under the action bar's
              // controls; alpha(colors.text, …) would tint it visibly warmer.
              backgroundColor: isDark ? 'rgba(28, 28, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              paddingBottom: showNoteInput && keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 8),
              bottom: showNoteInput && keyboardHeight > 0 ? keyboardHeight - insets.bottom + 12 : 0,
              borderTopColor: alpha(colors.text, 0.08),
            },
            contextBarSlideStyle,
          ]}
        >
          {showColorPicker ? (
            /* Color picker mode */
            <View style={styles.contextRow}>
              {existingHighlightColor && (
                <TouchableOpacity onPress={handleRemoveHighlight} style={styles.contextColorButton} testID="bible-highlight-remove" accessibilityLabel="Remove highlight" accessibilityRole="button" hitSlop={8}>
                  <View style={[styles.contextRemoveCircle, {
                    backgroundColor: HIGHLIGHT_COLORS.find((c) => c.key === existingHighlightColor)?.color ?? '#888',
                  }]}>
                    <XIcon size={9} color="#FFF" weight="bold" />
                  </View>
                </TouchableOpacity>
              )}
              {HIGHLIGHT_COLORS.map((c) => {
                const isLocked = !isPremium && !isHighlightColorFree(c.key);
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => {
                      if (isLocked) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        setShowHighlightPremiumSheet(true);
                        return;
                      }
                      handleHighlight(c.key);
                    }}
                    style={styles.contextColorButton}
                    activeOpacity={0.7}
                    testID={`bible-highlight-color-${c.key}`}
                    accessibilityLabel={isLocked ? `${c.key} highlight color, premium only` : `${c.key} highlight color`}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <View style={[styles.contextColorDot, { backgroundColor: c.color, opacity: isLocked ? 0.4 : 1 }]}>
                      {isLocked && (
                        <LockSimpleIcon size={10} color="#FFF" weight="fill" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : showNoteInput ? (
            /* Note input mode */
            <View style={styles.noteInputRow}>
              <TextInput
                ref={noteInputRef}
                testID="bible-verse-note-input"
                style={[styles.noteInput, {
                  color: colors.text,
                  backgroundColor: isDark ? alpha(colors.text, 0.06) : alpha(colors.text, 0.04),
                  borderColor: alpha(colors.text, 0.1),
                }]}
                placeholder="Add a note..."
                placeholderTextColor={colors.textHint}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                value={noteText}
                onChangeText={setNoteText}
                multiline
                maxLength={500}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={handleSaveNote}
              />
              <View style={styles.noteButtons}>
                <TouchableOpacity
                  onPress={() => { setShowNoteInput(false); setNoteText(''); }}
                  style={styles.noteCancelButton}
                  activeOpacity={0.7}
                  testID="bible-verse-note-cancel"
                >
                  <Text style={[styles.noteButtonText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveNote}
                  style={[styles.noteSaveButton, { backgroundColor: colors.accent }]}
                  activeOpacity={0.7}
                  testID="bible-verse-note-save"
                >
                  <Text style={[styles.noteButtonText, { color: '#FFF' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Main options — 4 icon buttons */
            <View style={styles.contextIconRow}>
              <TouchableOpacity onPress={handleExplain} style={styles.contextIconButton} activeOpacity={0.6} hitSlop={6}>
                <BookOpenIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Explain</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowColorPicker(true)} style={styles.contextIconButton} activeOpacity={0.6} testID="bible-verse-action-highlight" hitSlop={6}>
                <HighlighterCircleIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Highlight</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNote} style={styles.contextIconButton} activeOpacity={0.6} testID="bible-verse-action-note" hitSlop={6}>
                <NotePencilIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Note</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.contextIconButton} activeOpacity={0.6} hitSlop={6}>
                <UploadSimpleIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Share</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}

      {selectedExplanationInput && (
        <ScriptureExplainSheet
          visible={showExplainSheet}
          onClose={() => setShowExplainSheet(false)}
          reference={selectedExplanationInput.reference}
          passageText={selectedExplanationInput.passageText}
          translation={selectedExplanationInput.translation}
          source={selectedExplanationInput.source}
        />
      )}

      {/* Reading Settings Sheet */}
      <ReadingSettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        tabBarHeight={tabBarHeight}
        savedVersesCount={bibleHighlights.length}
        isPremium={isPremium}
        onLockedFontPress={() => setShowHighlightPremiumSheet(true)}
        onOpenSavedVerses={() => {
          setShowSettings(false);
          router.push({
            pathname: '/(tabs)/(you)/my-content',
            params: { tab: 'highlights', source: 'bible', from: 'bible' },
          });
        }}
      />

      {/* Book & Chapter Navigator */}
      <BookChapterNavigator
        visible={showNavigator}
        currentBookId={bookId}
        currentChapter={chapter}
        translation={bibleReaderSettings.translation}
        onSelect={handleNavigatorSelect}
        onClose={() => setShowNavigator(false)}
      />

      {/* Verse share: now navigates to /share-card route */}

      {/* Copy toast */}
      {toast !== null && (
        <View style={styles.toast} pointerEvents="none">
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(ANIM.toastEnter).easing(Ease.out)}
            exiting={reducedMotion ? undefined : FadeOut.duration(ANIM.toastExit).easing(Ease.out)}
            // Neutral near-black gray for contrast in both themes, not a tint
            // of the warm text/border palette — alpha(colors.text, …) reads
            // visibly warmer here, so this stays a raw token.
            style={[styles.toastPill, elevated('lg', isDark), { backgroundColor: isDark ? '#3A3A3C' : 'rgba(30, 30, 30, 0.92)' }]}
          >
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        </View>
      )}
      {/* Premium upsell sheet for highlight colors */}
      <PremiumFeatureSheet
        visible={showHighlightPremiumSheet}
        onClose={() => setShowHighlightPremiumSheet(false)}
        feature="highlight"
      />
      {/* Notebook notes anchored to this chapter — lightweight list linking
          into note-detail (read-side bridge; same Sheet primitive as the
          Notebook's own action sheets) */}
      <Sheet
        visible={showChapterNotes}
        onClose={() => setShowChapterNotes(false)}
        bottomPadding={24}
      >
        <Text style={[styles.chapterNotesTitle, { color: colors.text }]} numberOfLines={1}>
          Notes on {book?.name ?? ''} {chapter}
        </Text>
        {chapterNotebookNotes.map((n) => {
          const plain = isHtmlContent(n.content) ? stripHtml(n.content) : n.content;
          const rowTitle = n.title.trim() || plain.split('\n')[0]?.slice(0, 60) || 'Untitled';
          const preview = n.title.trim() ? plain.trim() : plain.split('\n').slice(1).join('\n').trim();
          return (
            <TouchableOpacity
              key={n.id}
              onPress={() => handleOpenNotebookNote(n.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Open note: ${rowTitle}`}
              style={styles.chapterNotesRow}
            >
              <NotePencilIcon size={18} color={colors.accent} weight="light" />
              <View style={styles.chapterNotesRowBody}>
                <Text style={[styles.chapterNotesRowTitle, { color: colors.text }]} numberOfLines={1}>
                  {rowTitle}
                </Text>
                {preview ? (
                  <Text style={[styles.chapterNotesRowPreview, { color: colors.textMuted }]} numberOfLines={1}>
                    {preview}
                  </Text>
                ) : null}
              </View>
              <CaretRightIcon size={14} color={colors.textSubtle} weight="light" />
            </TouchableOpacity>
          );
        })}
      </Sheet>
      {/* Scripture note viewer — opened by tapping the inline note marker */}
      <BibleNoteSheet
        highlight={noteSheetHighlight}
        onClose={() => setNoteSheetHighlight(null)}
        onSave={(id, note) => {
          updateBibleHighlightNote(id, note);
          setNoteSheetHighlight((prev) => (prev ? { ...prev, note } : prev));
        }}
        onDelete={(id) => {
          const target = bibleHighlights.find((h) => h.id === id);
          if (target && target.color !== null) {
            // Keep the highlight, just strip the note.
            updateBibleHighlightNote(id, '');
          } else {
            removeBibleHighlight(id);
          }
        }}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },

  // Header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'], paddingVertical: Spacing['2'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerNoteBadge: {
    position: 'absolute',
    top: 7,
    right: 5,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNoteBadgeText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 9,
    lineHeight: 11,
  },

  // Chapter Notebook-notes sheet
  chapterNotesTitle: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
    marginBottom: Spacing['3'],
  },
  chapterNotesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingVertical: Spacing['3.5'],
  },
  chapterNotesRowBody: { flex: 1 },
  chapterNotesRowTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  chapterNotesRowPreview: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  headerBook: { fontSize: 17 },
  headerChapter: { fontFamily: FontFamily.ui, fontSize: 15 },

  // Verses
  versesContent: { paddingHorizontal: Spacing['8'] },
  loadingContainer: { paddingTop: 60, alignItems: 'center' },
  verseRow: { paddingVertical: Spacing['2'] },

  // Section headings
  sectionHeading: {
    fontStyle: 'italic',
    marginTop: 28,
    marginBottom: Spacing['2'],
    opacity: 0.85,
  },

  // End of chapter
  endMarker: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
  endOrnament: { fontFamily: FontFamily.ui, fontSize: FontSize.xl, letterSpacing: 6 },
  nextChapterPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: Spacing['2'],
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderRadius: Radius.card,
  },
  nextChapterText: { fontFamily: FontFamily.uiMedium, fontSize: 14 },
  crossBookPrompt: { alignItems: 'center' },
  crossBookSubtitle: { fontFamily: FontFamily.ui, fontSize: FontSize.xs, marginTop: 2 },
  endOfBibleContainer: { alignItems: 'center', paddingVertical: Spacing['4'] },
  endOfBibleText: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, fontStyle: 'italic' },

  // Context bar — full-width bottom bar that replaces tab bar
  contextBarFull: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Shadow.sheet,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing['1'],
  },
  contextIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: Spacing['2'],
    paddingHorizontal: Spacing['6'],
  },
  contextIconButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: Spacing['1'],
  },
  contextIconLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  // Note input mode
  noteInputRow: {
    padding: Spacing['3'],
    paddingHorizontal: Spacing['4'],
  },
  noteInput: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    minHeight: 44,
  },
  noteButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  noteCancelButton: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
  },
  noteSaveButton: {
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['2'],
    borderRadius: Radius.sm,
  },
  noteButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  contextRemoveCircle: {
    width: 24,
    height: 24,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextColorButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  contextColorDot: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // Edge arrow indicators (shown during horizontal chapter drag)
  edgeArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    zIndex: 5,
  },
  edgeArrowLeft: { left: Spacing['3'] },
  edgeArrowRight: { right: Spacing['3'] },
  edgeArrowPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Toast
  toast: {
    position: 'absolute', bottom: 100, left: 0, right: 0,
    alignItems: 'center', zIndex: 200,
  },
  toastPill: {
    paddingHorizontal: Spacing['5'], paddingVertical: 10, borderRadius: Radius.xl,
    // Shadow comes from elevated('lg', isDark) at the call site — the
    // strongest tier, matching this pill's original hand-tuned strength.
  },
  toastText: {
    color: '#FFFFFF', fontFamily: FontFamily.uiMedium,
    fontSize: 13, letterSpacing: 0.2,
  },
});
