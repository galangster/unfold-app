/** @jsxImportSource react */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, TextInput, Platform, Keyboard, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing, runOnJS, useReducedMotion } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { CaretRightIcon, CaretLeftIcon, TextAaIcon, XIcon, CopyIcon, HighlighterCircleIcon, NotePencilIcon, UploadSimpleIcon, LockSimpleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { Shadow } from '@/constants/shadows';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useReadingFont } from '@/lib/useReadingFont';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { useBibleChapter } from '@/hooks/useBibleChapter';
import { useBibleDb } from '@/hooks/useBibleDb';
import { BIBLE_BOOKS, getNextChapter, getPreviousChapter } from '@/lib/bible-constants';
import type { BibleTranslation } from '@/lib/bible-db';
import { ReadingSettingsSheet } from '@/components/bible/ReadingSettingsSheet';
import { BookChapterNavigator } from '@/components/bible/BookChapterNavigator';
import { DownloadBibleSheet } from '@/components/bible/DownloadBibleSheet';
import { BibleNoteSheet } from '@/components/bible/BibleNoteSheet';
import type { BibleHighlightColor } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { isRedLetterVerse } from '@/lib/red-letter-verses';
import { getSectionHeadings } from '@/lib/bible-section-headings';
import {
  BIBLE_SELECTED_OVERLAY_BG,
  getBibleTextOverlayStyle,
  nextBibleTabBarStateAfterActions,
  type BibleTextLine,
} from '@/lib/bible-reader-visuals';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { isHighlightColorFree } from '@/lib/premium-gating';
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
// Spring back when gesture ends without commit (critically damped, no bounce)
const SWIPE_SPRING_BACK = { damping: 22, stiffness: 260, mass: 0.9 };

// ─── Verse Item with per-line highlight via onTextLayout ────────────────────

// Max finger movement (px) before a tap is cancelled — prevents verse selection
// during swipe attempts. Creates clear zones:
//   0-8px  → tap (verse selected)
//   8-20px → dead zone (nothing fires)
//   20px+  → Pan activates (chapter swipe)
const VERSE_TAP_MAX_DISTANCE = 8;

const VerseItem = React.memo(function VerseItem({
  verse,
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
}: {
  verse: { verse: number; text: string };
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
  onPress: () => void;
}) {
  const [textLines, setTextLines] = useState<BibleTextLine[]>([]);

  // Flash animation: quick fade in → hold → smooth fade out
  const flashOpacity = useSharedValue(0);
  useEffect(() => {
    if (isFlashing) {
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
  }, [flashOpacity, isFlashing]);

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
        runOnJS(onPress)();
      })
      .onFinalize(() => {
        'worklet';
        pressOpacity.value = withTiming(1, { duration: 120 });
      }),
    [onPress, pressOpacity],
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
      setTextLines(lines.map((l: any) => ({
        x: l.x, y: l.y, width: l.width, height: l.height,
      })));
    }
  }, []);

  const verseNumSize = Math.max(9, Math.round(fontSize * 0.55));

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View
        style={[styles.verseRow, pressStyle]}
        accessible
        accessibilityLabel={`Verse ${verse.verse}: ${verse.text}`}
      >
        {/* Flash highlight overlay (full row, fades in then out) — always mounted so animation plays */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
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
            opacity: isSelected ? 0.6 : 0.4,
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
  );
});

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function BibleReaderScreen() {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string; chapter: string; verse?: string }>();
  const bookId = parseInt(params.bookId ?? '1', 10) || 1;
  const chapter = parseInt(params.chapter ?? '1', 10) || 1;

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Premium gating for highlight colors
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const [showHighlightPremiumSheet, setShowHighlightPremiumSheet] = useState(false);
  // shareModalData removed — share navigates to /share-card route
  const [pendingScrollVerse, setPendingScrollVerse] = useState<number | null>(null);
  const [scrollToVerse, setScrollToVerse] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const verseLayoutsRef = useRef<Record<number, number>>({});
  const verseLayoutsChapterRef = useRef<string>('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollYRef = useRef(0);

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
      contextBarSlideY.value = withTiming(0, { duration: ANIM.contextEnter, easing: EASE_OUT_QUART });
    } else {
      contextBarSlideY.value = 8;
    }
  }, [contextBarSlideY, showActions]);
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

  // Header overlap: content has paddingTop for the header, but onLayout Y is relative
  // to the content container (after padding). scrollTo y=0 puts the first verse behind the header.
  // Subtract a small offset so the target verse sits visibly below the header, not behind it.
  const headerOverlap = 12; // slight breathing room below the fixed header

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

  // Parse verse param
  const targetVerse = params.verse ? parseInt(params.verse, 10) : null;

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
        setPendingScrollVerse(targetVerse);
      }
    }
  }, [targetVerse, verses, isLoading, router]);

  // Called from onLayout — scrolls to verse once its position is known
  const handleVerseLayout = useCallback((verseNum: number, y: number) => {
    verseLayoutsRef.current[verseNum] = y;
    if (pendingScrollVerse === verseNum) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - headerOverlap), animated: true });
      setFlashVerse(verseNum);
      setPendingScrollVerse(null);
      setTimeout(() => setFlashVerse(null), 2000);
    }
  }, [pendingScrollVerse]);

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
      setShowActions(next.size > 0);
      return next;
    });
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const handleHighlight = useCallback((color: BibleHighlightColor) => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted
      .map((v) => verses.find((vr) => vr.verse === v)?.text ?? '')
      .join(' ');

    // Remove any existing highlights that overlap
    for (const h of highlights) {
      if (sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)) {
        removeBibleHighlight(h.id);
      }
    }

    addBibleHighlight({
      bookId, bookName: book.name, chapter,
      verseStart: sorted[0], verseEnd: sorted[sorted.length - 1],
      text: selectedTexts, color,
      translation: bibleReaderSettings.translation,
    });

    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [verses, selectedVerses, book, bookId, chapter, addBibleHighlight, removeBibleHighlight, highlights, bibleReaderSettings.translation]);

  const handleCopy = useCallback(async () => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted.map((v) => verses.find((vr) => vr.verse === v)?.text ?? '').join(' ');
    const refStr = sorted.length === 1
      ? `${book.name} ${chapter}:${sorted[0]}`
      : `${book.name} ${chapter}:${sorted[0]}-${sorted[sorted.length - 1]}`;

    await Clipboard.setStringAsync(`${selectedTexts}\n— ${refStr} (${bibleReaderSettings.translation})`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`${refStr} copied`);
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
  }, [verses, selectedVerses, book, chapter, bibleReaderSettings.translation, showToast]);

  const handleShare = useCallback(() => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted.map((v) => verses.find((vr) => vr.verse === v)?.text ?? '').join(' ');
    const refStr = sorted.length === 1
      ? `${book.name} ${chapter}:${sorted[0]}`
      : `${book.name} ${chapter}:${sorted[0]}-${sorted[sorted.length - 1]}`;

    router.push({
      pathname: '/share-card',
      params: {
        text: selectedTexts,
        reference: refStr,
        translation: bibleReaderSettings.translation,
        type: 'verse',
      },
    });
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
  }, [verses, selectedVerses, book, chapter, bibleReaderSettings.translation, router]);

  const handleRemoveHighlight = useCallback(() => {
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    for (const h of highlights) {
      if (sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)) {
        removeBibleHighlight(h.id);
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
  }, [selectedVerses, highlights, removeBibleHighlight]);

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
      setSelectedVerses(new Set());
      setShowActions(false);
      setNoteSheetHighlight(existingHL);
      return;
    }
    setNoteText('');
    setShowNoteInput(true);
    setShowColorPicker(false);
    setTimeout(() => noteInputRef.current?.focus(), 100);
  }, [verses, selectedVerses, book, highlights]);

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
    const refStr = verseStart === verseEnd
      ? `${book.name} ${chapter}:${verseStart}`
      : `${book.name} ${chapter}:${verseStart}-${verseEnd}`;
    showToast(noteText.trim() ? `Note saved on ${refStr}` : `Note removed from ${refStr}`);
    setShowNoteInput(false);
    setNoteText('');
    setSelectedVerses(new Set());
    setShowActions(false);
  }, [verses, selectedVerses, book, chapter, highlights, noteText, bookId, bibleReaderSettings.translation, addBibleHighlight, updateBibleHighlightNote, showToast]);

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
    setSelectedVerses(new Set());
    setShowActions(false);
    setShowColorPicker(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    router.setParams({ bookId: String(target.bookId), chapter: String(target.chapter) });
  }, [nextChapter, prevChapter, router]);

  const handleNavigatorSelect = useCallback((selectedBookId: number, selectedChapter: number, verse?: number) => {
    setShowNavigator(false);
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
  }, [router, bookId, chapter]);

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

  const swipeGesture = useMemo(() =>
    Gesture.Pan()
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
          // Quick settle to max drag distance, then navigate
          dragX.value = withTiming(
            DRAG_MAX,
            { duration: NAV_EXIT_DURATION, easing: EASE_OUT_QUART },
            () => { runOnJS(navigateChapter)(-1); },
          );
        } else if (goNext && tx < 0) {
          // Quick settle to max drag distance, then navigate
          dragX.value = withTiming(
            -DRAG_MAX,
            { duration: NAV_EXIT_DURATION, easing: EASE_OUT_QUART },
            () => { runOnJS(navigateChapter)(1); },
          );
        } else {
          // No commit — spring back to center (critically damped)
          dragX.value = withSpring(0, SWIPE_SPRING_BACK);
        }
      }),
    [prevChapter, nextChapter, navigateChapter, dragX],
  );

  // ─── Tab bar hide/show on scroll ──────────────────────────────────────────

  const setTabBarHidden = useUIState((s) => s.setTabBarHidden);
  const tabBarHiddenRef = useRef(false);
  // Track if tab bar was scroll-hidden BEFORE verse selection began
  const wasScrollHiddenRef = useRef(false);

  const handleScroll = useCallback((event: any) => {
    // Don't let scroll affect tab bar while context actions are visible
    if (showActions) { lastScrollYRef.current = event.nativeEvent.contentOffset.y; return; }
    const y = event.nativeEvent.contentOffset.y;
    const diff = y - lastScrollYRef.current;
    if (y <= 10) {
      if (tabBarHiddenRef.current) { tabBarHiddenRef.current = false; setTabBarHidden(false); }
    } else if (diff > 5 && !tabBarHiddenRef.current) {
      tabBarHiddenRef.current = true; setTabBarHidden(true);
    } else if (diff < -5 && tabBarHiddenRef.current) {
      tabBarHiddenRef.current = false; setTabBarHidden(false);
    }
    lastScrollYRef.current = y;
  }, [setTabBarHidden, showActions]);

  useEffect(() => {
    return () => setTabBarHidden(false);
  }, [setTabBarHidden]);

  // Hide tab bar when context actions show — instant snap, no animation (prevents flash)
  useEffect(() => {
    const tabBarState = nextBibleTabBarStateAfterActions({
      showActions,
      wasScrollHiddenBeforeActions: wasScrollHiddenRef.current,
    });

    if (showActions) {
      // Remember if tab bar was already hidden from scrolling
      wasScrollHiddenRef.current = tabBarHiddenRef.current;
      // Instantly hide tab bar (context bar covers its spot)
      setTabBarHidden(tabBarState.hidden, tabBarState.mode);
      tabBarHiddenRef.current = tabBarState.hidden;
    } else {
      if (wasScrollHiddenRef.current) {
        // Tab bar was already scroll-hidden — keep it hidden, but force instant
        // mode so the context bar cannot briefly reveal content underneath.
        setTabBarHidden(tabBarState.hidden, tabBarState.mode);
        tabBarHiddenRef.current = tabBarState.hidden;
      } else {
        // Instantly restore tab bar — it renders on top of context bar (higher z),
        // so context bar unmount happens invisibly behind it. Zero flash.
        setTabBarHidden(tabBarState.hidden, tabBarState.mode);
        tabBarHiddenRef.current = tabBarState.hidden;
      }
    }
  }, [showActions, setTabBarHidden]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header — hidden when navigator is open to prevent double-header jitter */}
      <View style={[styles.header, {
        paddingTop: insets.top + 4,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        backgroundColor: colors.background,
        opacity: showNavigator ? 0 : 1,
      }]}>
        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          style={styles.translationBadge}
          accessibilityLabel={`Translation: ${bibleReaderSettings.translation}. Tap to change.`}
          hitSlop={8}
        >
          <Text style={[styles.translationText, {
            color: colors.textSubtle,
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          }]}>
            {bibleReaderSettings.translation}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowNavigator(true)}
          style={styles.headerCenter}
          activeOpacity={0.6}
          accessibilityLabel={`${book?.name ?? ''} chapter ${chapter}. Tap to navigate.`}
        >
          <Text style={[styles.headerBook, { color: colors.text, fontFamily: FontFamily.uiMedium }]} numberOfLines={1}>
            {book?.name ?? ''}
          </Text>
          <Text style={[styles.headerChapter, { color: colors.textSubtle }]}>
            {chapter}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          style={styles.headerButton}
          accessibilityLabel="Reading settings"
          accessibilityRole="button"
          hitSlop={8}
        >
          <TextAaIcon size={20} color={colors.text} weight="light" />
        </TouchableOpacity>
      </View>

      {/* Scroll content — wrapped in gesture detector for swipe chapter navigation */}
      <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[styles.flex, contentTranslateStyle]}>
      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
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
            {verses?.map((v) => (
              <View
                key={v.verse}
                onLayout={(e) => handleVerseLayout(v.verse, e.nativeEvent.layout.y)}
              >
                {/* Section heading before this verse */}
                {headingBeforeVerse[v.verse] && (
                  <Text style={[
                    styles.sectionHeading,
                    {
                      color: colors.text,
                      fontFamily: readingFont.body,
                      fontSize: fontSize + 1,
                      lineHeight: Math.round((fontSize + 1) * 1.4),
                    },
                  ]}>
                    {headingBeforeVerse[v.verse]}
                  </Text>
                )}
                <VerseItem
                  verse={v}
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
                  onPress={() => handleVersePress(v.verse)}
                />
              </View>
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
                style={styles.nextChapterPrompt}
                activeOpacity={0.6}
                accessibilityLabel={isCrossBook ? `Continue to ${nextBookName}` : `Continue to chapter ${nextChapter?.chapter}`}
              >
                {isCrossBook ? (
                  <View style={styles.crossBookPrompt}>
                    <Text style={[styles.nextChapterText, { color: colors.textSubtle }]}>Continue to {nextBookName}</Text>
                    <Text style={[styles.crossBookSubtitle, { color: colors.textHint }]}>Chapter 1</Text>
                  </View>
                ) : (
                  <Text style={[styles.nextChapterText, { color: colors.textSubtle }]}>
                    Continue to Chapter {nextChapter?.chapter}
                  </Text>
                )}
                <CaretRightIcon size={14} color={colors.textSubtle} weight="light" />
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
      </ScrollView>
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
      {/* No exiting animation — tab bar snaps on top instantly, so exit plays behind it invisibly */}
      {showActions && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(ANIM.contextEnter).easing(Ease.out)}
          style={[
            styles.contextBarFull,
            {
              backgroundColor: isDark ? 'rgba(28, 28, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              paddingBottom: showNoteInput && keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 8),
              bottom: showNoteInput && keyboardHeight > 0 ? keyboardHeight - insets.bottom + 12 : 0,
              borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            },
            contextBarSlideStyle,
          ]}
        >
          {showColorPicker ? (
            /* Color picker mode */
            <View style={styles.contextRow}>
              {existingHighlightColor && (
                <TouchableOpacity onPress={handleRemoveHighlight} style={styles.contextColorButton} accessibilityLabel="Remove highlight">
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
                    accessibilityLabel={isLocked ? `${c.key} highlight color, premium only` : `${c.key} highlight color`}
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
                style={[styles.noteInput, {
                  color: colors.text,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                }]}
                placeholder="Add a note..."
                placeholderTextColor={colors.textHint}
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
                >
                  <Text style={[styles.noteButtonText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveNote}
                  style={[styles.noteSaveButton, { backgroundColor: colors.accent }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.noteButtonText, { color: '#FFF' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Main options — 4 icon buttons */
            <View style={styles.contextIconRow}>
              <TouchableOpacity onPress={handleCopy} style={styles.contextIconButton} activeOpacity={0.6}>
                <CopyIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowColorPicker(true)} style={styles.contextIconButton} activeOpacity={0.6}>
                <HighlighterCircleIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Highlight</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNote} style={styles.contextIconButton} activeOpacity={0.6}>
                <NotePencilIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Note</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.contextIconButton} activeOpacity={0.6}>
                <UploadSimpleIcon size={22} color={colors.text} weight="light" />
                <Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Share</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}

      {/* Reading Settings Sheet */}
      <ReadingSettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        tabBarHeight={tabBarHeight}
        savedVersesCount={bibleHighlights.length}
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
            style={[styles.toastPill, { backgroundColor: isDark ? '#3A3A3C' : 'rgba(30, 30, 30, 0.92)' }]}
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
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  headerBook: { fontSize: 17 },
  headerChapter: { fontFamily: FontFamily.ui, fontSize: 15 },
  translationBadge: { height: 44, justifyContent: 'center', alignItems: 'center' },
  translationText: {
    fontFamily: FontFamily.uiMedium, fontSize: 11, letterSpacing: 0.5,
    paddingHorizontal: Spacing['2'], paddingVertical: Spacing['1'], borderRadius: 4, overflow: 'hidden',
  },

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
  nextChapterPrompt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['1'], paddingVertical: Spacing['4'] },
  nextChapterText: { fontFamily: FontFamily.ui, fontSize: 14 },
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  toastText: {
    color: '#FFFFFF', fontFamily: FontFamily.uiMedium,
    fontSize: 13, letterSpacing: 0.2,
  },
});
