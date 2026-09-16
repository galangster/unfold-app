import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, useWindowDimensions, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MMKV } from 'react-native-mmkv';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { MagnifyingGlassIcon, CaretRightIcon, XIcon, XCircleIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { elevated } from '@/constants/shadows';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useBibleDb } from '@/hooks/useBibleDb';
import {
  OT_BOOKS,
  NT_BOOKS,
  getBookCategory,
  CATEGORY_LABELS,
  citationBookName,
  resolveBookName,
  BOOK_BY_ID,
  type BibleBookInfo,
  type BibleCategory,
} from '@/lib/bible-constants';
import { bibleHubBookPillColumnCount, bibleHubBookPillWidthStyle } from '@/lib/bible-hub-book-pill-layout';
import {
  bibleHubBookChrome,
  bibleHubContrastInk,
} from '@/lib/bible-hub-category-palette';
import {
  BIBLE_HUB_OVERVIEW_MIN_TILE,
  BIBLE_HUB_OVERVIEW_TILE_BORDER,
  BIBLE_HUB_OVERVIEW_TILE_PADDING_X,
  BIBLE_HUB_SEGMENTED_MIN_HEIGHT,
  bibleHubBookAccessibilityHint,
  bibleHubOverviewMetrics,
  bibleHubSegmentedMetrics,
  shouldStackBibleHubHeader,
} from '@/lib/bible-hub-overview-layout';
import {
  BIBLE_HUB_VIEW_LABELS,
  BIBLE_HUB_VIEW_STORAGE_KEY,
  bibleHubViewFromLabel,
  parseBibleHubViewPreference,
  type BibleHubView,
} from '@/lib/bible-hub-view-preference';
import { DownloadBibleSheet } from '@/components/bible/DownloadBibleSheet';
import { Spacing } from '@/constants/spacing';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { adaptiveFrameStyle } from '@/lib/adaptive-layout';
import { ProfileEntryButton } from '@/components/ProfileEntryButton';
import { AmbientMusicEntry } from '@/components/ambient/AmbientMusicEntry';
import { isAmbientAudioEnabled } from '@/lib/ambient-audio-feature';
import { useAmbientPlayerScrollPadding } from '@/lib/ambient-sound-chrome';
import { Duration, Ease } from '@/constants/animations';
import { Typography } from '@/constants/typography';
import { useBibleSearch, type BibleSearchResultWithMeta } from '@/hooks/useBibleSearch';
import type { BibleTranslation } from '@/lib/bible-db';

const EMPTY_CHAPTERS: number[] = [];

// Persisted once the user has ever seen the Bible home screen (book grid +
// search). Non-sensitive, so this doesn't need encryption — same pattern as
// other one-off flag stores in src/lib (e.g. bible-db.ts's bibleMeta).
const bibleHomeMeta = new MMKV({ id: 'unfold-bible-home-meta' });
const HAS_SEEN_BIBLE_HOME_KEY = 'hasSeenBibleHome';

export type BibleHomeNavigationDecision =
  | { action: 'navigate'; bookId: number; chapter: number; verse: number }
  | { action: 'show-home' };

/**
 * Decide what the Bible tab should do on mount.
 *
 * - First ever open (hasSeenHome is false): jump straight into reading —
 *   the last saved position if there is one, otherwise Genesis 1 — so a new
 *   user isn't dropped on an empty grid.
 * - Every later open: show the home screen (book grid, continue-reading
 *   card, search). Auto-redirecting whenever a saved position existed made
 *   the home unreachable for anyone who had ever read a chapter.
 */
export function resolveBibleHomeNavigation(params: {
  hasSeenHome: boolean;
  lastPosition: { bookId: number; chapter: number; verse?: number } | null;
}): BibleHomeNavigationDecision {
  const { hasSeenHome, lastPosition } = params;

  if (!hasSeenHome) {
    return lastPosition
      ? { action: 'navigate', bookId: lastPosition.bookId, chapter: lastPosition.chapter, verse: lastPosition.verse ?? 1 }
      : { action: 'navigate', bookId: 1, chapter: 1, verse: 1 };
  }

  return { action: 'show-home' };
}

export default function BibleHomeScreen() {
  const { colors, isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const adaptiveLayout = useAdaptiveLayout();
  const hubWidth = adaptiveLayout.clusterMaxWidth;
  const hubFrameStyle = adaptiveFrameStyle(hubWidth);
  const ambientPlayerPadding = useAmbientPlayerScrollPadding(0);
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const bookPillWidth = useMemo(
    () => bibleHubBookPillWidthStyle(bibleHubBookPillColumnCount(hubWidth, fontScale)),
    [hubWidth, fontScale],
  );
  const overviewMetrics = useMemo(
    () => bibleHubOverviewMetrics(hubWidth, fontScale),
    [hubWidth, fontScale],
  );
  const segmentedMetrics = useMemo(
    () => bibleHubSegmentedMetrics(fontScale, hubWidth),
    [fontScale, hubWidth],
  );
  const headerStacks = useMemo(
    () => shouldStackBibleHubHeader(Math.max(0, hubWidth - 88), fontScale),
    [hubWidth, fontScale],
  );
  const { isReady, isDownloading, progress, download, error } = useBibleDb();
  const lastPosition = useUnfoldStore((s) => s.bibleReadingHistory[0] ?? null);
  const bibleReaderSettings = useUnfoldStore((s) => s.bibleReaderSettings);
  const { query, setQuery, results, isSearching, error: searchError } = useBibleSearch({
    databaseReady: isReady,
    translation: bibleReaderSettings.translation as BibleTranslation,
  });
  const [selectedBook, setSelectedBook] = useState<BibleBookInfo | null>(null);
  const searchedBookId = resolveBookName(query);
  const [viewMode, setViewMode] = useState<BibleHubView>(() =>
    parseBibleHubViewPreference(bibleHomeMeta.getString(BIBLE_HUB_VIEW_STORAGE_KEY)),
  );

  // Chapter numbers for the grid modal — rebuilt only when the selected book's
  // chapter count changes, not on every render of this screen.
  const chapterNumbers = useMemo(
    () =>
      selectedBook
        ? Array.from({ length: selectedBook.chapterCount }, (_, i) => i + 1)
        : EMPTY_CHAPTERS,
    [selectedBook],
  );

  // Decide once (per mount) whether to auto-navigate into the reader or
  // show the home screen. 'pending' keeps the screen blank for a frame so
  // the book grid never flashes before a redirect.
  const [homeState, setHomeState] = useState<'pending' | 'navigating' | 'ready'>('pending');

  useEffect(() => {
    if (!isReady || homeState !== 'pending') return;

    const hasSeenHome = bibleHomeMeta.getBoolean(HAS_SEEN_BIBLE_HOME_KEY) ?? false;
    const decision = resolveBibleHomeNavigation({ hasSeenHome, lastPosition });

    if (!hasSeenHome) {
      bibleHomeMeta.set(HAS_SEEN_BIBLE_HOME_KEY, true);
    }

    if (decision.action === 'navigate') {
      setHomeState('navigating');
      router.replace(`/(tabs)/(bible)/reader?bookId=${decision.bookId}&chapter=${decision.chapter}&verse=${decision.verse}`);
      return;
    }

    setHomeState('ready');
  }, [isReady, lastPosition, router, homeState]);

  const handleViewChange = useCallback((value: string) => {
    const next = bibleHubViewFromLabel(value);
    if (next === viewMode) return;
    bibleHomeMeta.set(BIBLE_HUB_VIEW_STORAGE_KEY, next);
    setViewMode(next);
  }, [viewMode]);

  const handleBookPress = useCallback((book: BibleBookInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (book.chapterCount === 1) {
      router.push(`/(tabs)/(bible)/reader?bookId=${book.id}&chapter=1&verse=1`);
    } else {
      setSelectedBook(book);
    }
  }, [router]);

  const handleChapterPress = useCallback((chapter: number) => {
    if (!selectedBook) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBook(null);
    router.push(`/(tabs)/(bible)/reader?bookId=${selectedBook.id}&chapter=${chapter}&verse=1`);
  }, [selectedBook, router]);

  const handleContinueReading = useCallback(() => {
    if (!lastPosition) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(tabs)/(bible)/reader?bookId=${lastPosition.bookId}&chapter=${lastPosition.chapter}&verse=${lastPosition.verse ?? 1}`);
  }, [lastPosition, router]);

  const handleSearchResultPress = useCallback((result: BibleSearchResultWithMeta) => {
    router.push(`/(tabs)/(bible)/reader?bookId=${result.bookId}&chapter=${result.chapter}&verse=${result.verse}&fromSearch=true`);
  }, [router]);

  const renderBook = useCallback((book: BibleBookInfo) => {
    const isSelected = selectedBook?.id === book.id;
    const chrome = bibleHubBookChrome({
      isDark,
      isSelected,
      background: colors.background,
      accent: colors.accent,
      text: colors.text,
      inputBackground: colors.inputBackground,
    });
    const isGrid = viewMode === 'grid';
    return (
      <TouchableOpacity
        key={book.id}
        onPress={() => handleBookPress(book)}
        accessibilityLabel={book.name}
        accessibilityHint={bibleHubBookAccessibilityHint(book)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        activeOpacity={0.6}
        style={isGrid
          ? [styles.overviewTile, {
              width: overviewMetrics.tileWidth,
              minWidth: overviewMetrics.tileWidth,
              maxWidth: overviewMetrics.tileWidth,
              minHeight: overviewMetrics.minTileHeight,
              backgroundColor: chrome.backgroundColor,
              borderColor: chrome.borderColor,
            }]
          : [styles.bookPill, bookPillWidth, {
              backgroundColor: chrome.backgroundColor,
              borderColor: chrome.borderColor,
            }]}
      >
        <Text
          style={[isGrid ? styles.overviewAbbrev : styles.bookName, { color: chrome.color }]}
          maxFontSizeMultiplier={0}
        >
          {isGrid ? book.abbreviation : book.name}
        </Text>
      </TouchableOpacity>
    );
  }, [
    bookPillWidth,
    colors.accent,
    colors.background,
    colors.inputBackground,
    colors.text,
    handleBookPress,
    isDark,
    overviewMetrics,
    selectedBook,
    viewMode,
  ]);

  const renderCanonicalGrid = useCallback((books: BibleBookInfo[]) => (
    <View style={styles.overviewGrid}>
      {books.map(renderBook)}
    </View>
  ), [renderBook]);

  /** Group books by literary category and render with sub-labels */
  const renderCategorizedBooks = useCallback((books: BibleBookInfo[]) => {
    const groups: { category: BibleCategory; books: BibleBookInfo[] }[] = [];
    for (const book of books) {
      const cat = getBookCategory(book.id);
      const last = groups[groups.length - 1];
      if (last && last.category === cat) {
        last.books.push(book);
      } else {
        groups.push({ category: cat, books: [book] });
      }
    }

    return (
      <View style={{ marginBottom: Spacing['7'] }}>
        {groups.map((group) => (
          <View key={group.category} style={{ marginBottom: Spacing['4'] }}>
            <Text
              style={[styles.categoryLabel, { color: colors.text }]}
              maxFontSizeMultiplier={0}
            >
              {CATEGORY_LABELS[group.category]}
            </Text>
            <View style={styles.bookGrid}>
              {group.books.map(renderBook)}
            </View>
          </View>
        ))}
      </View>
    );
  }, [colors.text, renderBook]);

  // Show download prompt if Bible not ready (including during download)
  if (!isReady) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <DownloadBibleSheet
          visible={true}
          onComplete={() => {}}
          colors={colors}
          isDark={isDark}
          progress={progress}
          isDownloading={isDownloading}
          error={error}
          onDownload={download}
        />
      </SafeAreaView>
    );
  }

  // Blank screen while deciding, or while auto-navigating to the reader.
  // Prevents the book picker from flashing for one frame.
  if (homeState !== 'ready') {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.container, hubFrameStyle]}>
      <View style={[styles.header, headerStacks && styles.headerStacked]}>
        <Text
          key={fontScale}
          style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}
          maxFontSizeMultiplier={0}
          numberOfLines={1}
        >
          Bible
        </Text>
        <View style={[styles.headerTrailing, headerStacks && styles.headerTrailingStacked]}>
          <SegmentedControl
            values={[...BIBLE_HUB_VIEW_LABELS]}
            selectedIndex={viewMode === 'names' ? 1 : 0}
            onValueChange={handleViewChange}
            appearance={isDark ? 'dark' : 'light'}
            tintColor={colors.accent}
            fontStyle={{ fontSize: segmentedMetrics.fontSize, color: colors.text }}
            activeFontStyle={{
              fontSize: segmentedMetrics.fontSize,
              color: bibleHubContrastInk(colors.accent),
            }}
            style={{
              width: segmentedMetrics.width,
              height: segmentedMetrics.height,
              minHeight: BIBLE_HUB_SEGMENTED_MIN_HEIGHT,
            }}
          />
          {isAmbientAudioEnabled() ? <AmbientMusicEntry /> : null}
          <ProfileEntryButton testID="bible-profile-button" />
        </View>
      </View>

      <View
        style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}
      >
        <MagnifyingGlassIcon size={16} color={colors.textHint} weight="light" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the Bible..."
          placeholderTextColor={colors.textHint}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={[styles.searchInput, { color: colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search the Bible"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            style={styles.clearSearch}
          >
            <XCircleIcon size={18} color={colors.textMuted} weight="fill" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: ambientPlayerPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        {query.trim().length > 0 ? (
          <View accessibilityLabel="Bible search results">
            {searchedBookId !== null && results.length > 0 && (
              <Text accessibilityRole="header" style={[styles.searchResultRef, { color: colors.textMuted }]}>
                {BOOK_BY_ID[searchedBookId].name} · Chapter 1
              </Text>
            )}
            {isSearching ? (
              <ActivityIndicator color={colors.accent} style={styles.searchStatus} />
            ) : searchError ? (
              <Text style={[styles.searchMessage, { color: colors.textMuted }]}>Search is unavailable. Try again.</Text>
            ) : results.length === 0 ? (
              <Text style={[styles.searchMessage, { color: colors.textMuted }]}>No verses found. Check the reference, or try a word or phrase.</Text>
            ) : results.map((result) => (
              <TouchableOpacity
                key={`${result.translation}-${result.bookId}-${result.chapter}-${result.verse}`}
                onPress={() => handleSearchResultPress(result)}
                style={[styles.searchResult, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
                accessibilityRole="button"
                accessibilityLabel={`${result.reference}. ${result.text}`}
                accessibilityHint="Opens the chapter at this verse"
              >
                <Text style={[styles.searchResultRef, { color: colors.accent }]}>{result.reference}</Text>
                <Text style={[styles.searchResultText, { color: colors.text }]}>{result.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <>
        {lastPosition && (
          <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}>
            <TouchableOpacity
              onPress={handleContinueReading}
              style={[styles.continueCard, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              }]}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`Continue reading ${citationBookName(lastPosition.bookName)} ${lastPosition.chapter}`}
            >
              <Text key={fontScale} style={[styles.continueRef, { color: colors.text }]}>
                {citationBookName(lastPosition.bookName)} {lastPosition.chapter}
              </Text>
              <CaretRightIcon size={12} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          </Animated.View>
        )}

        <Text key={`ot-${fontScale}`} style={[styles.sectionHeader, { color: colors.text }]}>
          Old Testament
        </Text>
        {viewMode === 'grid' ? renderCanonicalGrid(OT_BOOKS) : renderCategorizedBooks(OT_BOOKS)}

        <Text key={`nt-${fontScale}`} style={[styles.sectionHeader, { color: colors.text }]}>
          New Testament
        </Text>
        {viewMode === 'grid' ? renderCanonicalGrid(NT_BOOKS) : renderCategorizedBooks(NT_BOOKS)}

        <View style={{ height: 100 }} />
          </>
        )}
      </ScrollView>
      </View>

      {/* Chapter Grid Modal */}
      <Modal
        visible={selectedBook !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBook(null)}
      >
        <TouchableOpacity
          accessible={false}
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedBook(null)}
        >
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            style={[styles.chapterModal, elevated('lg', isDark), {
              // Light matches colors.backgroundElevated exactly; dark stays a
              // raw iOS system gray — colors.backgroundElevated ('#141210')
              // reads visibly darker/warmer for this modal surface.
              backgroundColor: isDark ? '#1C1C1E' : colors.backgroundElevated,
            }]}
          >
            <TouchableOpacity accessible={false} activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ flexShrink: 1 }}>
              {/* Modal Header */}
              <View style={styles.chapterModalHeader}>
                <Text style={[styles.chapterModalTitle, { color: colors.text, fontFamily: FontFamily.display }]}>
                  {selectedBook?.name}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedBook(null)}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.closeButton}
                >
                  <XIcon size={18} color={colors.textMuted} weight="light" />
                </TouchableOpacity>
              </View>

              {/* Chapter Numbers Grid */}
              <ScrollView
                style={styles.chapterGridScroll}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.chapterGrid}>
                  {chapterNumbers.map((ch) => (
                    <TouchableOpacity
                      key={ch}
                      onPress={() => handleChapterPress(ch)}
                      style={[styles.chapterCell, {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      }]}
                      activeOpacity={0.6}
                      accessibilityLabel={`Chapter ${ch}`}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chapterNumber, { color: colors.text }]}>
                        {ch}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
    paddingBottom: Spacing['3'],
    gap: Spacing['3'],
  },
  headerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 27,
    letterSpacing: -0.15,
  },
  headerTrailing: {
    flexDirection: 'row',
    flexShrink: 0,
    alignItems: 'center',
    gap: Spacing['3'],
  },
  headerTrailingStacked: {
    alignSelf: 'flex-end',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing['6'],
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 10,
    gap: Spacing['2'],
    marginBottom: Spacing['5'],
  },
  clearSearch: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 15,
    padding: 0,
  },
  searchStatus: {
    marginTop: Spacing['8'],
  },
  searchMessage: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: Spacing['8'],
    textAlign: 'center',
  },
  searchResult: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    marginBottom: 4,
  },
  searchResultText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
  },
  scrollContent: {
    paddingHorizontal: Spacing['6'],
  },
  continueCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: Spacing['7'],
  },
  continueRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
  },
  sectionHeader: {
    ...Typography.sectionHeader,
    marginBottom: Spacing['3'],
    marginTop: 4,
  },
  categoryLabel: {
    ...Typography.cardMeta,
    marginBottom: 8,
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bookPill: {
    minHeight: BIBLE_HUB_OVERVIEW_MIN_TILE,
    justifyContent: 'center',
    paddingHorizontal: Spacing['3'],
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  bookName: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    textAlign: 'center',
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing['6'],
  },
  overviewTile: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: BIBLE_HUB_OVERVIEW_TILE_PADDING_X,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: BIBLE_HUB_OVERVIEW_TILE_BORDER,
  },
  overviewAbbrev: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['7'],
  },
  chapterModal: {
    borderRadius: Radius.lg,
    padding: Spacing['5'],
    width: '100%',
    maxWidth: 520,
    maxHeight: '70%',
    // Shadow comes from elevated('lg', isDark) at the call site — 'lg' is
    // the strongest positive-offset tier, matching this modal's original
    // downward-cast shadow direction.
  },
  chapterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['5'],
  },
  chapterModalTitle: {
    flexShrink: 1,
    fontSize: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterGridScroll: {
    flexShrink: 1,
    maxHeight: 400,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chapterCell: {
    minWidth: 46,
    minHeight: 46,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumber: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
});
