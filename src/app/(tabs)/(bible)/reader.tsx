import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { CaretRightIcon, TextAaIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useReadingFont } from '@/lib/useReadingFont';
import { useBibleChapter } from '@/hooks/useBibleChapter';
import { BIBLE_BOOKS, getNextChapter, getPreviousChapter } from '@/lib/bible-constants';
import type { BibleTranslation } from '@/lib/bible-db';
import { VerseActionSheet } from '@/components/bible/VerseActionSheet';
import { ReadingSettingsSheet } from '@/components/bible/ReadingSettingsSheet';
import { BookChapterNavigator } from '@/components/bible/BookChapterNavigator';
import type { BibleHighlightColor } from '@/lib/store';

// ─── Highlight background colors ────────────────────────────────────────────

const HIGHLIGHT_BG: Record<BibleHighlightColor, { light: string; dark: string }> = {
  yellow: { light: 'rgba(255, 215, 0, 0.18)', dark: 'rgba(200, 165, 92, 0.22)' },
  green: { light: 'rgba(76, 175, 80, 0.15)', dark: 'rgba(76, 175, 80, 0.18)' },
  blue: { light: 'rgba(91, 155, 213, 0.15)', dark: 'rgba(91, 155, 213, 0.18)' },
  purple: { light: 'rgba(155, 89, 182, 0.15)', dark: 'rgba(155, 89, 182, 0.18)' },
  red: { light: 'rgba(231, 76, 60, 0.15)', dark: 'rgba(231, 76, 60, 0.18)' },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_HEIGHT = 52;

export default function BibleReaderScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string; chapter: string; verse?: string }>();
  const bookId = parseInt(params.bookId ?? '1', 10);
  const chapter = parseInt(params.chapter ?? '1', 10);
  const scrollToVerse = params.verse ? parseInt(params.verse, 10) : undefined;

  const bibleReaderSettings = useUnfoldStore((s) => s.bibleReaderSettings);
  const getBibleHighlightsForChapter = useUnfoldStore((s) => s.getBibleHighlightsForChapter);
  const addBibleHighlight = useUnfoldStore((s) => s.addBibleHighlight);
  const removeBibleHighlight = useUnfoldStore((s) => s.removeBibleHighlight);
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
  const [showSettings, setShowSettings] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const scrollRef = useRef<any>(null);

  // ─── Scroll-to-hide header ──────────────────────────────────────────────────

  const lastScrollY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      const diff = y - lastScrollY.value;

      if (y <= 10) {
        // At top — always show header
        headerTranslateY.value = withTiming(0, { duration: 200 });
      } else if (diff > 3) {
        // Scrolling down — hide header
        headerTranslateY.value = withTiming(-HEADER_HEIGHT, { duration: 250 });
      } else if (diff < -3) {
        // Scrolling up — show header
        headerTranslateY.value = withTiming(0, { duration: 200 });
      }

      lastScrollY.value = y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  // Build highlight map for this chapter
  const highlights = useMemo(
    () => getBibleHighlightsForChapter(bookId, chapter),
    [getBibleHighlightsForChapter, bookId, chapter],
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

  // Record reading position & scroll to top on chapter change
  useEffect(() => {
    if (book) {
      recordBibleReading({
        bookId,
        bookName: book.name,
        chapter,
        translation: bibleReaderSettings.translation,
      });
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [bookId, chapter, book, recordBibleReading, bibleReaderSettings.translation]);

  // ─── Verse selection ────────────────────────────────────────────────────────

  const handleVersePress = useCallback((verseNum: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const handleHighlight = useCallback((color: BibleHighlightColor) => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted
      .map((v) => verses.find((vr) => vr.verse === v)?.text ?? '')
      .join(' ');

    addBibleHighlight({
      bookId,
      bookName: book.name,
      chapter,
      verseStart: sorted[0],
      verseEnd: sorted[sorted.length - 1],
      text: selectedTexts,
      color,
      translation: bibleReaderSettings.translation,
    });

    setSelectedVerses(new Set());
    setShowActions(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [verses, selectedVerses, book, bookId, chapter, addBibleHighlight, bibleReaderSettings.translation]);

  const handleCopy = useCallback(async () => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted
      .map((v) => verses.find((vr) => vr.verse === v)?.text ?? '')
      .join(' ');

    const refStr = sorted.length === 1
      ? `${book.name} ${chapter}:${sorted[0]}`
      : `${book.name} ${chapter}:${sorted[0]}-${sorted[sorted.length - 1]}`;

    await Clipboard.setStringAsync(`${selectedTexts}\n— ${refStr} (${bibleReaderSettings.translation})`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedVerses(new Set());
    setShowActions(false);
  }, [verses, selectedVerses, book, chapter, bibleReaderSettings.translation]);

  const handleRemoveHighlight = useCallback(() => {
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    for (const h of highlights) {
      if (sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)) {
        removeBibleHighlight(h.id);
      }
    }
    setSelectedVerses(new Set());
    setShowActions(false);
  }, [selectedVerses, highlights, removeBibleHighlight]);

  // ─── Cross-book chapter navigation ────────────────────────────────────────

  const nextChapter = useMemo(() => getNextChapter(bookId, chapter), [bookId, chapter]);
  const prevChapter = useMemo(() => getPreviousChapter(bookId, chapter), [bookId, chapter]);
  const canGoPrev = prevChapter !== null;
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
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    router.setParams({ bookId: String(target.bookId), chapter: String(target.chapter) });
  }, [nextChapter, prevChapter, router]);

  const handleNavigatorSelect = useCallback((selectedBookId: number, selectedChapter: number) => {
    setShowNavigator(false);
    setSelectedVerses(new Set());
    setShowActions(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    router.setParams({ bookId: String(selectedBookId), chapter: String(selectedChapter) });
  }, [router]);

  // Swipe gesture for chapter navigation
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      'worklet';
      if (Math.abs(e.velocityX) > 500 || Math.abs(e.translationX) > SCREEN_WIDTH * 0.3) {
        if (e.translationX > 0 && canGoPrev) {
          runOnJS(navigateChapter)(-1);
        } else if (e.translationX < 0 && canGoNext) {
          runOnJS(navigateChapter)(1);
        }
      }
    });

  // ─── Reading settings ───────────────────────────────────────────────────────

  const { fontSize, lineHeightMultiplier, showVerseNumbers } = bibleReaderSettings;
  // Generous line height for comfortable reading — minimum 1.7x for serif
  const lineHeight = Math.round(fontSize * Math.max(lineHeightMultiplier, 1.7));

  const selectedVerseObjects = useMemo((): Array<{ verse: number; text: string }> => {
    if (!verses) return [];
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const result: Array<{ verse: number; text: string }> = [];
    for (const v of sorted) {
      const found = verses.find((vr) => vr.verse === v);
      if (found) result.push({ verse: found.verse, text: found.text });
    }
    return result;
  }, [verses, selectedVerses]);

  // Determine if crossing book boundary for next chapter prompt
  const isCrossBook = nextChapter !== null && nextChapter.bookId !== bookId;
  const isEndOfBible = nextChapter === null && bookId === 66;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Header — absolute positioned, slides up/down */}
        <Animated.View style={[styles.header, headerAnimatedStyle, {
          borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          backgroundColor: colors.background,
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
        </Animated.View>

        {/* Scroll content — below header */}
        <GestureDetector gesture={swipeGesture}>
          <Animated.ScrollView
            ref={scrollRef}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            style={styles.flex}
            contentContainerStyle={[styles.versesContent, { paddingBottom: tabBarHeight + 80 }]}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.textSubtle} size="small" />
              </View>
            ) : (
              <Animated.View entering={FadeIn.duration(400)}>
                {/* Verse text */}
                {verses?.map((v) => {
                  const isSelected = selectedVerses.has(v.verse);
                  const hlColor = highlightMap[v.verse];
                  const bgColor = hlColor
                    ? (isDark ? HIGHLIGHT_BG[hlColor].dark : HIGHLIGHT_BG[hlColor].light)
                    : isSelected
                      ? (isDark ? 'rgba(200, 165, 92, 0.1)' : 'rgba(200, 165, 92, 0.08)')
                      : undefined;

                  return (
                    <TouchableOpacity
                      key={v.verse}
                      onPress={() => handleVersePress(v.verse)}
                      activeOpacity={0.8}
                      style={[
                        styles.verseRow,
                        bgColor ? {
                          backgroundColor: bgColor,
                          borderRadius: 4,
                          marginLeft: -8,
                          marginRight: -8,
                          paddingLeft: 8,
                          paddingRight: 8,
                        } : undefined,
                      ]}
                      accessibilityLabel={`Verse ${v.verse}: ${v.text}`}
                    >
                      <Text style={{
                        fontSize,
                        lineHeight,
                        fontFamily: readingFont.body,
                        color: colors.text,
                        letterSpacing: 0.15,
                      }}>
                        {showVerseNumbers && (
                          <Text style={{
                            fontSize: Math.max(11, Math.round(fontSize * 0.65)),
                            lineHeight,
                            fontFamily: readingFont.body,
                            color: colors.text,
                            opacity: 0.45,
                            letterSpacing: 0,
                          }}>
                            {v.verse}
                            {'\u2009'}
                          </Text>
                        )}
                        {v.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* End-of-chapter ornament */}
                <View style={styles.endMarker}>
                  <Text style={[styles.endOrnament, { color: colors.textHint }]}>
                    {'\u00B7\u00B7\u00B7'}
                  </Text>
                </View>

                {/* Next chapter prompt / End of Bible */}
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
                    accessibilityLabel={isCrossBook
                      ? `Continue to ${nextBookName}`
                      : `Continue to chapter ${nextChapter?.chapter}`
                    }
                  >
                    {isCrossBook ? (
                      <View style={styles.crossBookPrompt}>
                        <Text style={[styles.nextChapterText, { color: colors.textSubtle }]}>
                          Continue to {nextBookName}
                        </Text>
                        <Text style={[styles.crossBookSubtitle, { color: colors.textHint }]}>
                          Chapter 1
                        </Text>
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
          </Animated.ScrollView>
        </GestureDetector>
      </SafeAreaView>

      {/* Verse Action Sheet */}
      <VerseActionSheet
        visible={showActions}
        selectedVerses={selectedVerseObjects}
        bookName={book?.name ?? ''}
        chapter={chapter}
        translation={bibleReaderSettings.translation}
        existingHighlightColor={
          selectedVerses.size === 1
            ? highlightMap[Array.from(selectedVerses)[0]]
            : undefined
        }
        onHighlight={handleHighlight}
        onRemoveHighlight={handleRemoveHighlight}
        onCopy={handleCopy}
        onClose={() => {
          setSelectedVerses(new Set());
          setShowActions(false);
        }}
      />

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
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },

  // Header — absolute for scroll-to-hide
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
  },
  headerBook: {
    fontSize: 17,
  },
  headerChapter: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
  translationBadge: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  translationText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },

  // Verses
  versesContent: {
    paddingHorizontal: 32,
    paddingTop: HEADER_HEIGHT + 12,
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  verseRow: {
    paddingVertical: 3,
  },

  // End of chapter
  endMarker: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  endOrnament: {
    fontFamily: FontFamily.ui,
    fontSize: 20,
    letterSpacing: 6,
  },
  nextChapterPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 16,
  },
  nextChapterText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
  },
  crossBookPrompt: {
    alignItems: 'center',
  },
  crossBookSubtitle: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    marginTop: 2,
  },
  endOfBibleContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  endOfBibleText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
