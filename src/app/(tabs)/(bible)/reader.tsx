/** @jsxImportSource react */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { CaretRightIcon, TextAaIcon, XIcon, CopyIcon, HighlighterCircleIcon, NotePencilIcon, UploadSimpleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useReadingFont } from '@/lib/useReadingFont';
import { useBibleChapter } from '@/hooks/useBibleChapter';
import { BIBLE_BOOKS, getNextChapter, getPreviousChapter } from '@/lib/bible-constants';
import type { BibleTranslation } from '@/lib/bible-db';
import { ReadingSettingsSheet } from '@/components/bible/ReadingSettingsSheet';
import { BookChapterNavigator } from '@/components/bible/BookChapterNavigator';
import type { BibleHighlightColor } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { isRedLetterVerse } from '@/lib/red-letter-verses';
// VerseShareModal removed — now uses share-card route

// ─── Highlight colors ───────────────────────────────────────────────────────

const HIGHLIGHT_BG: Record<BibleHighlightColor, { light: string; dark: string }> = {
  yellow: { light: 'rgba(240, 200, 80, 0.35)', dark: 'rgba(240, 200, 80, 0.28)' },
  green: { light: 'rgba(107, 191, 123, 0.30)', dark: 'rgba(107, 191, 123, 0.25)' },
  blue: { light: 'rgba(107, 163, 214, 0.30)', dark: 'rgba(107, 163, 214, 0.25)' },
  purple: { light: 'rgba(168, 116, 192, 0.30)', dark: 'rgba(168, 116, 192, 0.25)' },
  red: { light: 'rgba(232, 112, 112, 0.30)', dark: 'rgba(232, 112, 112, 0.25)' },
};

const HIGHLIGHT_COLORS: Array<{ key: BibleHighlightColor; color: string }> = [
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
 * ───────────────────────────────────────────────────────── */

const ANIM = {
  verseFade:     400,   // verse content fade in
  contextEnter:  180,   // context bar enter (fade + slide)
  contextExit:   100,   // context bar exit (fade only)
  flashHold:     600,   // flash highlight hold before fade
  flashOut:      600,   // flash highlight fade out
  toastEnter:    200,   // toast fade in
  toastExit:     150,   // toast fade out
};

const FLASH_SPRING = { damping: 20, stiffness: 400 };
const EASE_OUT_QUART = Easing.bezier(0.165, 0.84, 0.44, 1);

// ─── Verse Item with per-line highlight via onTextLayout ────────────────────

type TextLine = { x: number; y: number; width: number; height: number };

const VerseItem = React.memo(({
  verse,
  fontSize,
  lineHeight,
  fontFamily,
  isSelected,
  highlightColor,
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
  isFlashing: boolean;
  isRedLetter: boolean;
  isDark: boolean;
  textColor: string;
  onPress: () => void;
}) => {
  const [textLines, setTextLines] = useState<TextLine[]>([]);

  // Flash animation: quick fade in → hold → smooth fade out
  const flashOpacity = useSharedValue(0);
  useEffect(() => {
    if (isFlashing) {
      // Fast fade in (200ms), then after holding, fade out over 600ms
      flashOpacity.value = withTiming(1, { duration: 200, easing: EASE_OUT_QUART }, () => {
        // After reaching full opacity, hold then fade out
        flashOpacity.value = withDelay(ANIM.flashHold,
          withTiming(0, { duration: ANIM.flashOut, easing: Easing.in(Easing.cubic) }),
        );
      });
    } else {
      flashOpacity.value = 0;
    }
  }, [isFlashing]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const hasOverlay = isSelected || !!highlightColor;

  // Selection: inverted colors
  const selectionBg = isDark ? 'rgba(225, 220, 210, 0.88)' : 'rgba(50, 50, 55, 0.85)';
  const selectionText = isDark ? '#1A1A1A' : '#F0F0F0';

  // Highlight bg
  const hlBg = highlightColor
    ? (isDark ? HIGHLIGHT_BG[highlightColor].dark : HIGHLIGHT_BG[highlightColor].light)
    : undefined;

  // Flash highlight color — white glow on dark, subtle gray on light
  const flashBg = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.10)';

  // Red-letter: muted red that's readable on dark/light backgrounds
  const redLetterColor = isDark ? '#D4736E' : '#B5413B';
  const displayText = isSelected ? selectionText : (isRedLetter ? redLetterColor : textColor);
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.verseRow}
      accessibilityLabel={`Verse ${verse.verse}: ${verse.text}`}
    >
      <View>
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
            style={{
              position: 'absolute',
              left: line.x - 3,
              top: line.y - 1,
              width: line.width + 6,
              height: line.height + 2,
              backgroundColor: overlayBg,
              borderRadius: 4,
            }}
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
          {verse.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function BibleReaderScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string; chapter: string; verse?: string }>();
  const bookId = parseInt(params.bookId ?? '1', 10);
  const chapter = parseInt(params.chapter ?? '1', 10);

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
  // shareModalData removed — share navigates to /share-card route
  const [pendingScrollVerse, setPendingScrollVerse] = useState<number | null>(null);
  const [scrollToVerse, setScrollToVerse] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const verseLayoutsRef = useRef<Record<number, number>>({});
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollYRef = useRef(0);

  // Context bar slide-up animation
  const contextBarSlideY = useSharedValue(8);
  useEffect(() => {
    if (showActions) {
      contextBarSlideY.value = withTiming(0, { duration: ANIM.contextEnter, easing: EASE_OUT_QUART });
    } else {
      contextBarSlideY.value = 8;
    }
  }, [showActions]);
  const contextBarSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contextBarSlideY.value }],
  }));

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
      for (let v = h.verseStart; v <= h.verseEnd; v++) {
        map[v] = h.color;
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
    // Check if there's an existing highlight with a note for these verses
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const existingHL = highlights.find((h) =>
      sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)
    );
    setNoteText(existingHL?.note ?? '');
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
      // Create a highlight with the note (default yellow)
      const selectedTexts = sorted.map((v) => verses.find((vr) => vr.verse === v)?.text ?? '').join(' ');
      addBibleHighlight({
        bookId,
        bookName: book.name,
        chapter,
        verseStart,
        verseEnd,
        text: selectedTexts,
        color: 'yellow',
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
    if (showActions) {
      // Remember if tab bar was already hidden from scrolling
      wasScrollHiddenRef.current = tabBarHiddenRef.current;
      // Instantly hide tab bar (context bar covers its spot)
      setTabBarHidden(true, 'instant');
      tabBarHiddenRef.current = true;
    } else {
      if (wasScrollHiddenRef.current) {
        // Tab bar was already scroll-hidden — don't touch it at all.
        // It's already hidden (instant mode). Scroll handler will manage it
        // when user scrolls back up.
        tabBarHiddenRef.current = true;
      } else {
        // Instantly restore tab bar — it renders on top of context bar (higher z),
        // so context bar unmount happens invisibly behind it. Zero flash.
        setTabBarHidden(false, 'instant');
        tabBarHiddenRef.current = false;
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

      {/* Scroll content */}
      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.flex}
        contentContainerStyle={[styles.versesContent, { paddingTop: insets.top + HEADER_HEIGHT + 16, paddingBottom: tabBarHeight + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.textSubtle} size="small" />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(ANIM.verseFade)}>
            {verses?.map((v) => (
              <View
                key={v.verse}
                onLayout={(e) => handleVerseLayout(v.verse, e.nativeEvent.layout.y)}
              >
                <VerseItem
                  verse={v}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  fontFamily={readingFont.body}
                  isSelected={selectedVerses.has(v.verse)}
                  highlightColor={highlightMap[v.verse]}
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

      {/* ─── Context Bar — replaces bottom tab bar when verses selected ──── */}
      {/* No exiting animation — tab bar snaps on top instantly, so exit plays behind it invisibly */}
      {showActions && (
        <Animated.View
          entering={FadeIn.duration(ANIM.contextEnter)}
          style={[
            styles.contextBarFull,
            {
              backgroundColor: isDark ? 'rgba(28, 28, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              paddingBottom: Math.max(insets.bottom, 8),
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
              {HIGHLIGHT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => handleHighlight(c.key)}
                  style={styles.contextColorButton}
                  activeOpacity={0.7}
                >
                  <View style={[styles.contextColorDot, { backgroundColor: c.color }]} />
                </TouchableOpacity>
              ))}
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
            entering={FadeIn.duration(ANIM.toastEnter)}
            exiting={FadeOut.duration(ANIM.toastExit)}
            style={[styles.toastPill, { backgroundColor: isDark ? '#3A3A3C' : 'rgba(30, 30, 30, 0.92)' }]}
          >
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        </View>
      )}
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
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  headerBook: { fontSize: 17 },
  headerChapter: { fontFamily: FontFamily.ui, fontSize: 15 },
  translationBadge: { height: 44, justifyContent: 'center', alignItems: 'center' },
  translationText: {
    fontFamily: FontFamily.uiMedium, fontSize: 11, letterSpacing: 0.5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, overflow: 'hidden',
  },

  // Verses
  versesContent: { paddingHorizontal: 32 },
  loadingContainer: { paddingTop: 60, alignItems: 'center' },
  verseRow: { paddingVertical: 8 },

  // End of chapter
  endMarker: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
  endOrnament: { fontFamily: FontFamily.ui, fontSize: 20, letterSpacing: 6 },
  nextChapterPrompt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 16 },
  nextChapterText: { fontFamily: FontFamily.ui, fontSize: 14 },
  crossBookPrompt: { alignItems: 'center' },
  crossBookSubtitle: { fontFamily: FontFamily.ui, fontSize: 12, marginTop: 2 },
  endOfBibleContainer: { alignItems: 'center', paddingVertical: 16 },
  endOfBibleText: { fontFamily: FontFamily.ui, fontSize: 14, fontStyle: 'italic' },

  // Context bar — full-width bottom bar that replaces tab bar
  contextBarFull: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  contextIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingHorizontal: 24,
  },
  contextIconButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 4,
  },
  contextIconLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  // Note input mode
  noteInputRow: {
    padding: 12,
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noteSaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  noteButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
  },
  contextRemoveCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    borderRadius: 16,
  },

  // Toast
  toast: {
    position: 'absolute', bottom: 100, left: 0, right: 0,
    alignItems: 'center', zIndex: 200,
  },
  toastPill: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  toastText: {
    color: '#FFFFFF', fontFamily: FontFamily.uiMedium,
    fontSize: 13, letterSpacing: 0.2,
  },
});
