import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
// reanimated no longer needed — all animations removed for instant transitions
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  MagnifyingGlassIcon,
  BookBookmarkIcon,
  ArrowBendUpRightIcon,
  CaretLeftIcon,
  XCircleIcon,
  XIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Typography } from '@/constants/typography';
import {
  BIBLE_BOOKS,
  OT_BOOKS,
  NT_BOOKS,
  referenceToRoute,
  type BibleBookInfo,
} from '@/lib/bible-constants';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useBibleSearch } from '@/hooks/useBibleSearch';
import { getChapterVerseCount } from '@/lib/bible-db';
import type { BibleTranslation } from '@/lib/bible-db';

// ─── Types ──────────────────────────────────────────────────────────────────

type NavigatorMode = 'books' | 'chapters' | 'verses';

interface BookChapterNavigatorProps {
  visible: boolean;
  currentBookId: number;
  currentChapter: number;
  translation: string;
  onSelect: (bookId: number, chapter: number, verse?: number) => void;
  onClose: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Books with only 1 chapter — tap skips straight to chapter selection */
const SINGLE_CHAPTER_BOOK_IDS = new Set([31, 57, 63, 64, 65]);

const TAB_LABELS = ['Book', 'Chapter', 'Verse'] as const;
const TAB_PADDING = 3;

const EMPTY_NUMBERS: number[] = [];

/** 1..length, or a shared empty array when there's nothing to render. */
function buildNumberRange(length: number): number[] {
  if (length <= 0) return EMPTY_NUMBERS;
  return Array.from({ length }, (_, i) => i + 1);
}

// No animations — navigator appears instantly, content swaps instantly

// ─── Animated Tab Indicator ─────────────────────────────────────────────────

const StepTabs = React.memo(function StepTabs({
  activeIndex,
  onTabPress,
  colors,
  isDark,
}: {
  activeIndex: number;
  onTabPress: (index: number) => void;
  colors: any;
  isDark: boolean;
}) {
  const trackBg = isDark ? 'rgba(245, 240, 235, 0.08)' : 'rgba(28, 23, 16, 0.06)';
  const pillBg = isDark ? 'rgba(245, 240, 235, 0.18)' : 'rgba(28, 23, 16, 0.12)';

  return (
    <View style={[styles.tabBar, { backgroundColor: trackBg, padding: TAB_PADDING }]}>
      {TAB_LABELS.map((label, i) => {
        const isActive = i === activeIndex;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => onTabPress(i)}
            activeOpacity={0.7}
            style={[
              styles.tabItem,
              isActive && { backgroundColor: pillBg, borderRadius: 8 },
            ]}
            accessibilityLabel={`${label} tab`}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? colors.text : colors.textHint },
                isActive && { fontFamily: FontFamily.uiMedium },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────

export function BookChapterNavigator({
  visible,
  currentBookId,
  currentChapter,
  translation,
  onSelect,
  onClose,
}: BookChapterNavigatorProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<NavigatorMode>('books');
  const [selectedBook, setSelectedBook] = useState<BibleBookInfo | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number>(0);
  const [verseCount, setVerseCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const prevVisibleRef = useRef(false);

  // ── Reset to books mode when navigator closes, so next open is clean ────
  // Using a ref to detect close → avoids stale state on the first frame of next open
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      // Just opened — set selected book/chapter context (mode is already 'books' from close reset)
      const currentBook = BIBLE_BOOKS.find((b) => b.id === currentBookId) ?? null;
      setSelectedBook(currentBook);
      setSelectedChapter(currentChapter);
    } else if (!visible && prevVisibleRef.current) {
      // Just closed — reset everything so next open starts clean (no stale frame)
      setMode('books');
      setSelectedBook(null);
      setSelectedChapter(0);
      setVerseCount(0);
      setSearchQuery('');
    }
    prevVisibleRef.current = visible;
  }, [visible, currentBookId, currentChapter]);

  // ── Load verse count when entering verse mode ─────────────────────────
  useEffect(() => {
    if (mode === 'verses' && selectedBook && selectedChapter > 0) {
      getChapterVerseCount(selectedBook.id, selectedChapter, translation as BibleTranslation)
        .then((count) => setVerseCount(count));
    }
  }, [mode, selectedBook, selectedChapter, translation]);

  // ── Search: reference parsing ─────────────────────────────────────────
  const parsedRef = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return referenceToRoute(searchQuery.trim());
  }, [searchQuery]);

  // ── Search: book name autocomplete ────────────────────────────────────
  const bookMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return BIBLE_BOOKS.filter(
      (b) =>
        b.name.toLowerCase().startsWith(q) ||
        b.abbreviation.toLowerCase().startsWith(q),
    ).slice(0, 5);
  }, [searchQuery]);

  // ── Search: FTS5 full-text search ─────────────────────────────────────
  const shouldSearch =
    searchQuery.trim().length >= 2 && !parsedRef && bookMatches.length === 0;
  const { results: searchResults, isSearching } = useBibleSearch(
    shouldSearch ? searchQuery : '',
    translation as BibleTranslation,
    20,
  );

  // ── Tab index ─────────────────────────────────────────────────────────
  const tabIndex = mode === 'books' ? 0 : mode === 'chapters' ? 1 : 2;

  // ── Number grids ──────────────────────────────────────────────────────
  // Built once per count instead of re-allocating a 150-element array
  // (Psalms) on every render of this sheet.
  const chapterNumbers = useMemo(
    () => buildNumberRange(selectedBook?.chapterCount ?? 0),
    [selectedBook?.chapterCount],
  );
  const verseNumbers = useMemo(() => buildNumberRange(verseCount), [verseCount]);

  // ── Header title removed — step tabs indicate context ──────────────────

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleBookSelect = useCallback(
    async (book: BibleBookInfo) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Keyboard.dismiss();

      if (SINGLE_CHAPTER_BOOK_IDS.has(book.id)) {
        // Single-chapter books → skip to verses, pre-fetch count
        const count = await getChapterVerseCount(book.id, 1, translation as BibleTranslation);
        setSelectedBook(book);
        setSelectedChapter(1);
        setVerseCount(count);
        setMode('verses');
        return;
      }

      setSelectedBook(book);
      setMode('chapters');
    },
    [translation],
  );

  const handleChapterSelect = useCallback(
    async (chapter: number) => {
      if (!selectedBook) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Keyboard.dismiss();
      // Pre-fetch verse count before switching mode to avoid loading flash
      const count = await getChapterVerseCount(selectedBook.id, chapter, translation as BibleTranslation);
      setSelectedChapter(chapter);
      setVerseCount(count);
      setMode('verses');
    },
    [selectedBook, translation],
  );

  const handleVerseSelect = useCallback(
    (verse: number) => {
      if (!selectedBook || selectedChapter === 0) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Keyboard.dismiss();
      onSelect(selectedBook.id, selectedChapter, verse);
    },
    [selectedBook, selectedChapter, onSelect],
  );

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mode === 'verses') {
      setMode('chapters');
      setVerseCount(0);
    } else if (mode === 'chapters') {
      setMode('books');
      setSelectedBook(null);
      setSearchQuery('');
    }
  }, [mode]);

  const handleGoToRef = useCallback(() => {
    if (!parsedRef) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onSelect(parsedRef.bookId, parsedRef.chapter, parsedRef.verse);
  }, [parsedRef, onSelect]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleTabPress = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (index === 0) {
      // Always go back to books
      setMode('books');
    } else if (index === 1) {
      // Chapter tab — only if a book is selected
      if (selectedBook) {
        setMode('chapters');
        setVerseCount(0);
      }
    } else if (index === 2) {
      // Verse tab — only if both book and chapter are selected
      if (selectedBook && selectedChapter > 0) {
        setMode('verses');
      }
    }
  }, [selectedBook, selectedChapter]);

  // ── No content animation — instant swap, tab highlight provides feedback ──

  // ── Early return ──────────────────────────────────────────────────────
  if (!visible) return null;

  // ── Derived values ────────────────────────────────────────────────────
  const hasSuggestions = parsedRef !== null || bookMatches.length > 0;
  const hasSearchResults = shouldSearch && searchResults.length > 0;
  const showSearchLoading = shouldSearch && isSearching;

  const chipBg = isDark ? 'rgba(245, 240, 235, 0.08)' : 'rgba(28, 23, 16, 0.06)';

  // ── Render: Search bar ────────────────────────────────────────────────

  const renderSearchBar = () => (
    <View
      style={[
        styles.searchBarContainer,
        { backgroundColor: isDark ? 'rgba(245, 240, 235, 0.08)' : 'rgba(28, 23, 16, 0.06)' },
      ]}
    >
      <MagnifyingGlassIcon size={16} color={colors.textSubtle} weight="light" />
      <TextInput
        testID="bible-navigator-search"
        style={[styles.searchInput, { color: colors.text }]}
        placeholder="Search books or verses..."
        placeholderTextColor={colors.textHint}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        value={searchQuery}
        onChangeText={setSearchQuery}
        onSubmitEditing={handleGoToRef}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="go"
        accessibilityLabel="Search Bible books or verses"
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity onPress={handleClearSearch} hitSlop={8} accessibilityLabel="Clear search">
          <XCircleIcon size={16} color={colors.textSubtle} weight="light" />
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Render: Search suggestions ────────────────────────────────────────

  const renderSuggestions = () => {
    if (!hasSuggestions && !hasSearchResults && !showSearchLoading) return null;

    return (
      <View style={styles.suggestionsContainer}>
        {parsedRef && (
          <TouchableOpacity
            onPress={handleGoToRef}
            style={[styles.suggestionRow, { backgroundColor: isDark ? 'rgba(245, 240, 235, 0.05)' : 'rgba(28, 23, 16, 0.04)' }]}
            testID="bible-navigator-goto"
            accessibilityLabel={`Go to ${BIBLE_BOOKS.find((b) => b.id === parsedRef.bookId)?.name} ${parsedRef.chapter}`}
          >
            <ArrowBendUpRightIcon size={18} color={colors.accent} weight="light" style={styles.suggestionIcon} />
            <Text style={[styles.suggestionText, { color: colors.text }]}>
              Go to {BIBLE_BOOKS.find((b) => b.id === parsedRef.bookId)?.name} {parsedRef.chapter}
              {parsedRef.verse ? `:${parsedRef.verse}` : ''}
            </Text>
          </TouchableOpacity>
        )}

        {!parsedRef &&
          bookMatches.map((book) => (
            <TouchableOpacity
              key={book.id}
              onPress={() => { handleBookSelect(book); setSearchQuery(''); }}
              style={[styles.suggestionRow, { backgroundColor: isDark ? 'rgba(245, 240, 235, 0.05)' : 'rgba(28, 23, 16, 0.04)' }]}
              accessibilityLabel={`Navigate to ${book.name}`}
            >
              <BookBookmarkIcon size={18} color={colors.textSubtle} weight="light" style={styles.suggestionIcon} />
              <Text style={[styles.suggestionText, { color: colors.text }]}>{book.name}</Text>
            </TouchableOpacity>
          ))}

        {hasSearchResults &&
          searchResults.map((result) => (
            <TouchableOpacity
              key={result.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Keyboard.dismiss();
                onSelect(result.bookId, result.chapter);
              }}
              style={[styles.searchResultRow, { borderBottomColor: isDark ? 'rgba(245, 240, 235, 0.05)' : 'rgba(28, 23, 16, 0.05)' }]}
              accessibilityLabel={`${result.reference}: ${result.text}`}
            >
              <Text style={[styles.searchRef, { color: colors.accent }]}>{result.reference}</Text>
              <Text style={[styles.searchSnippet, { color: colors.text }]} numberOfLines={2}>
                {result.text}
              </Text>
            </TouchableOpacity>
          ))}

        {showSearchLoading && (
          <View style={styles.searchLoadingRow}>
            <ActivityIndicator size="small" color={colors.textSubtle} />
          </View>
        )}
      </View>
    );
  };

  // ── Render: Book grid ─────────────────────────────────────────────────

  const renderBookChips = (books: BibleBookInfo[], sectionLabel: string) => (
    <View style={styles.bookSection}>
      <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>{sectionLabel}</Text>
      <View style={styles.chipGrid}>
        {books.map((book) => {
          const isCurrentBook = book.id === currentBookId;
          // Single-accent / neutral coding — no per-book rainbow. The current
          // book reads as the one accent moment; everything else is neutral text.
          return (
            <TouchableOpacity
              key={book.id}
              onPress={() => handleBookSelect(book)}
              style={[
                styles.bookChip,
                { backgroundColor: isCurrentBook ? alpha(colors.accent, 0.16) : chipBg },
                isCurrentBook && { borderWidth: 1.5, borderColor: colors.accent },
              ]}
              accessibilityLabel={`${book.name}${isCurrentBook ? ', current book' : ''}`}
              accessibilityState={{ selected: isCurrentBook }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isCurrentBook ? colors.accent : colors.text },
                  isCurrentBook && { fontFamily: FontFamily.uiMedium },
                ]}
                numberOfLines={1}
              >
                {book.abbreviation}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // ── Render: Books mode ────────────────────────────────────────────────

  const renderBooksContent = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollContent}
    >
      {renderSuggestions()}
      {renderBookChips(OT_BOOKS, 'Old Testament')}
      {renderBookChips(NT_BOOKS, 'New Testament')}
    </ScrollView>
  );

  // ── Render: Chapters mode ─────────────────────────────────────────────

  const renderChaptersContent = () => {
    if (!selectedBook) return null;
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.chipGrid}>
          {chapterNumbers.map((ch) => {
            const isCurrent = currentBookId === selectedBook.id && currentChapter === ch;
            return (
              <TouchableOpacity
                key={ch}
                onPress={() => handleChapterSelect(ch)}
                style={[
                  styles.numberChip,
                  { backgroundColor: chipBg },
                  isCurrent && { borderWidth: 1.5, borderColor: colors.accent },
                ]}
                accessibilityLabel={`Chapter ${ch}${isCurrent ? ', current chapter' : ''}`}
              >
                <Text
                  style={[
                    styles.numberText,
                    { color: colors.text },
                    isCurrent && { fontFamily: FontFamily.uiMedium },
                  ]}
                >
                  {ch}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  // ── Render: Verses mode ───────────────────────────────────────────────

  const renderVersesContent = () => {
    if (!selectedBook || verseCount === 0) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.textSubtle} />
        </View>
      );
    }

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.chipGrid}>
          {verseNumbers.map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => handleVerseSelect(v)}
              style={[styles.numberChip, { backgroundColor: chipBg }]}
              accessibilityLabel={`Verse ${v}`}
            >
              <Text style={[styles.numberText, { color: colors.text }]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <View
      testID="bible-navigator"
      style={[
        styles.container,
        {
          // Dark matches colors.background exactly; light matches colors.backgroundPure.
          backgroundColor: isDark ? colors.background : colors.backgroundPure,
          paddingTop: insets.top + 4,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Header — no title text, just back/close buttons */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {mode !== 'books' && (
            <TouchableOpacity
              onPress={handleBack}
              accessibilityLabel="Back"
              hitSlop={8}
              style={styles.backButton}
            >
              <CaretLeftIcon size={20} color={colors.text} weight="light" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={onClose}
          accessibilityLabel="Close navigator"
          style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(245, 240, 235, 0.10)' : 'rgba(28, 23, 16, 0.07)' }]}
          hitSlop={8}
        >
          <XIcon size={16} color={colors.textSubtle} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Search bar (always visible) */}
      {renderSearchBar()}

      {/* Step tabs (below search) */}
      <StepTabs activeIndex={tabIndex} onTabPress={handleTabPress} colors={colors} isDark={isDark} />

      {/* Content — instant swap */}
      <View style={styles.contentArea}>
        {mode === 'books' && renderBooksContent()}
        {mode === 'chapters' && renderChaptersContent()}
        {mode === 'verses' && renderVersesContent()}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    paddingHorizontal: Spacing['4'],
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: Spacing['3'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.lg,
  },
  backButton: {
    padding: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Step tabs
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    marginBottom: Spacing['3'],
    position: 'relative',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['2'],
    zIndex: 1,
  },
  tabLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    letterSpacing: 0.2,
  },

  // Search bar
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: Spacing['3'],
    paddingVertical: 10,
    marginBottom: Spacing['3'],
    gap: Spacing['2'],
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },

  // Suggestions
  suggestionsContainer: { marginBottom: Spacing['3'] },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3'],
    borderRadius: 10,
    marginBottom: 4,
  },
  suggestionIcon: { marginRight: 10 },
  suggestionText: { fontFamily: FontFamily.ui, fontSize: 15, flex: 1 },

  // Search results
  searchResultRow: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRef: { fontFamily: FontFamily.uiMedium, fontSize: 13, marginBottom: 3 },
  searchSnippet: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, lineHeight: 20, opacity: 0.85 },
  searchLoadingRow: { paddingVertical: Spacing['4'], alignItems: 'center' },

  // Content area
  contentArea: { flex: 1 },
  scrollContent: { paddingBottom: Spacing['4'] },
  loadingContainer: { paddingTop: 60, alignItems: 'center' },

  // Book sections
  bookSection: { marginBottom: Spacing['4'] },
  sectionLabel: {
    ...Typography.sectionHeader,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  // Shared chip grid (books, chapters, verses all use this)
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bookChip: {
    minWidth: '18%',
    flexGrow: 1,
    // Raised from 10 -> 12 for a >=40pt effective tap target in this dense
    // grid (hitSlop isn't viable here — adjacent chips sit edge to edge).
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },

  // Number chips (chapters + verses) — same flex-fill as book chips
  numberChip: {
    minWidth: '12%',
    flexGrow: 1,
    paddingVertical: Spacing['3'],
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
});
