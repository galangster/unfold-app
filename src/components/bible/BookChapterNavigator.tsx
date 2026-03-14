import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  SlideInDown,
  SlideOutDown,
  SlideInLeft,
  SlideOutLeft,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  MagnifyingGlassIcon,
  BookBookmarkIcon,
  CaretLeftIcon,
  XCircleIcon,
  XIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import {
  BIBLE_BOOKS,
  OT_BOOKS,
  NT_BOOKS,
  referenceToRoute,
  type BibleBookInfo,
} from '@/lib/bible-constants';
import { useBibleSearch } from '@/hooks/useBibleSearch';
import type { BibleTranslation } from '@/lib/bible-db';

// ─── Types ──────────────────────────────────────────────────────────────────

type NavigatorMode = 'books' | 'chapters' | 'search';

interface BookChapterNavigatorProps {
  visible: boolean;
  currentBookId: number;
  currentChapter: number;
  translation: string;
  onSelect: (bookId: number, chapter: number) => void;
  onClose: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WINDOW_HEIGHT = Dimensions.get('window').height;
const SHEET_MAX_HEIGHT = WINDOW_HEIGHT * 0.7;

/** Books with only 1 chapter — tap goes directly to the chapter */
const SINGLE_CHAPTER_BOOK_IDS = new Set([31, 57, 63, 64, 65]);

// ─── Component ──────────────────────────────────────────────────────────────

export function BookChapterNavigator({
  visible,
  currentBookId,
  currentChapter,
  translation,
  onSelect,
  onClose,
}: BookChapterNavigatorProps) {
  const { colors, isDark } = useTheme();

  const [mode, setMode] = useState<NavigatorMode>('books');
  const [selectedBook, setSelectedBook] = useState<BibleBookInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ── Reset state when sheet opens ────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setMode('books');
      setSelectedBook(null);
      setSearchQuery('');
    }
  }, [visible]);

  // ── Search: reference parsing ───────────────────────────────────────────
  const parsedRef = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return referenceToRoute(searchQuery.trim());
  }, [searchQuery]);

  // ── Search: book name autocomplete ──────────────────────────────────────
  const bookMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return BIBLE_BOOKS.filter(
      (b) =>
        b.name.toLowerCase().startsWith(q) ||
        b.abbreviation.toLowerCase().startsWith(q),
    ).slice(0, 5);
  }, [searchQuery]);

  // ── Search: FTS5 full-text search ───────────────────────────────────────
  const shouldSearch =
    searchQuery.trim().length >= 2 && !parsedRef && bookMatches.length === 0;
  const { results: searchResults, isSearching } = useBibleSearch(
    shouldSearch ? searchQuery : '',
    translation as BibleTranslation,
    20,
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleBookSelect = useCallback(
    (book: BibleBookInfo) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Keyboard.dismiss();

      if (SINGLE_CHAPTER_BOOK_IDS.has(book.id)) {
        onSelect(book.id, 1);
        return;
      }

      setSelectedBook(book);
      setMode('chapters');
    },
    [onSelect],
  );

  const handleChapterSelect = useCallback(
    (chapter: number) => {
      if (!selectedBook) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Keyboard.dismiss();
      onSelect(selectedBook.id, chapter);
    },
    [selectedBook, onSelect],
  );

  const handleBackToBooks = useCallback(() => {
    setMode('books');
    setSelectedBook(null);
    setSearchQuery('');
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // ── Early return ────────────────────────────────────────────────────────
  if (!visible) return null;

  // ── Derived values ──────────────────────────────────────────────────────
  const hasSuggestions = parsedRef !== null || bookMatches.length > 0;
  const hasSearchResults = shouldSearch && searchResults.length > 0;
  const showSearchLoading = shouldSearch && isSearching;

  const otChipBg = isDark
    ? 'rgba(200, 165, 92, 0.06)'
    : 'rgba(180, 120, 60, 0.04)';
  const ntChipBg = isDark
    ? 'rgba(100, 140, 200, 0.06)'
    : 'rgba(60, 100, 180, 0.04)';

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderSearchBar = () => (
    <View
      style={[
        styles.searchBarContainer,
        {
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.04)',
        },
      ]}
    >
      <MagnifyingGlassIcon
        size={16}
        color={colors.textSubtle}
        weight="light"
      />
      <TextInput
        style={[styles.searchInput, { color: colors.text }]}
        placeholder="Search books or verses..."
        placeholderTextColor={colors.textHint}
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search Bible books or verses"
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity
          onPress={handleClearSearch}
          hitSlop={8}
          accessibilityLabel="Clear search"
          accessibilityRole="button"
        >
          <XCircleIcon
            size={16}
            color={colors.textSubtle}
            weight="light"
          />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSuggestions = () => {
    if (!hasSuggestions && !hasSearchResults && !showSearchLoading) return null;

    return (
      <View style={styles.suggestionsContainer}>
        {/* Parsed reference suggestion */}
        {parsedRef && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Keyboard.dismiss();
              onSelect(parsedRef.bookId, parsedRef.chapter);
            }}
            style={[
              styles.suggestionRow,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(0,0,0,0.02)',
              },
            ]}
            accessibilityLabel={`Go to ${BIBLE_BOOKS.find((b) => b.id === parsedRef.bookId)?.name} ${parsedRef.chapter}`}
            accessibilityRole="button"
          >
            <BookBookmarkIcon
              size={18}
              color={colors.accent}
              weight="light"
              style={styles.suggestionIcon}
            />
            <Text style={[styles.suggestionText, { color: colors.text }]}>
              Go to{' '}
              {BIBLE_BOOKS.find((b) => b.id === parsedRef.bookId)?.name}{' '}
              {parsedRef.chapter}
              {parsedRef.verse ? `:${parsedRef.verse}` : ''}
            </Text>
          </TouchableOpacity>
        )}

        {/* Book autocomplete suggestions */}
        {!parsedRef &&
          bookMatches.map((book) => (
            <TouchableOpacity
              key={book.id}
              onPress={() => {
                handleBookSelect(book);
                setSearchQuery('');
              }}
              style={[
                styles.suggestionRow,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(0,0,0,0.02)',
                },
              ]}
              accessibilityLabel={`Navigate to ${book.name}`}
              accessibilityRole="button"
            >
              <BookBookmarkIcon
                size={18}
                color={colors.textSubtle}
                weight="light"
                style={styles.suggestionIcon}
              />
              <Text style={[styles.suggestionText, { color: colors.text }]}>
                {book.name}
              </Text>
            </TouchableOpacity>
          ))}

        {/* FTS5 search results */}
        {hasSearchResults &&
          searchResults.map((result) => (
            <TouchableOpacity
              key={result.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Keyboard.dismiss();
                onSelect(result.bookId, result.chapter);
              }}
              style={[
                styles.searchResultRow,
                {
                  borderBottomColor: isDark
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(0,0,0,0.04)',
                },
              ]}
              accessibilityLabel={`${result.reference}: ${result.text}`}
              accessibilityRole="button"
            >
              <Text style={[styles.searchRef, { color: colors.accent }]}>
                {result.reference}
              </Text>
              <Text
                style={[styles.searchSnippet, { color: colors.text }]}
                numberOfLines={2}
              >
                {result.text}
              </Text>
            </TouchableOpacity>
          ))}

        {/* Loading indicator */}
        {showSearchLoading && (
          <View style={styles.searchLoadingRow}>
            <ActivityIndicator size="small" color={colors.textSubtle} />
          </View>
        )}
      </View>
    );
  };

  const renderBookChips = (
    books: BibleBookInfo[],
    sectionLabel: string,
    chipBg: string,
  ) => (
    <View style={styles.bookSection}>
      <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>
        {sectionLabel}
      </Text>
      <View style={styles.chipGrid}>
        {books.map((book) => {
          const isCurrentBook = book.id === currentBookId;
          return (
            <TouchableOpacity
              key={book.id}
              onPress={() => handleBookSelect(book)}
              style={[
                styles.bookChip,
                { backgroundColor: chipBg },
                isCurrentBook && {
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                },
              ]}
              accessibilityLabel={`${book.name}${isCurrentBook ? ', current book' : ''}`}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.text },
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

  const renderBooksMode = () => (
    <Animated.View
      entering={SlideInLeft.duration(250)}
      exiting={SlideOutLeft.duration(200)}
      style={styles.modeContainer}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {renderSuggestions()}
        {renderBookChips(OT_BOOKS, 'Old Testament', otChipBg)}
        {renderBookChips(NT_BOOKS, 'New Testament', ntChipBg)}
      </ScrollView>
    </Animated.View>
  );

  const renderChaptersMode = () => {
    if (!selectedBook) return null;

    return (
      <Animated.View
        entering={SlideInRight.duration(250)}
        exiting={SlideOutRight.duration(200)}
        style={styles.modeContainer}
      >
        {/* Breadcrumb */}
        <View style={styles.breadcrumb}>
          <TouchableOpacity
            onPress={handleBackToBooks}
            hitSlop={12}
            accessibilityLabel="Back to book list"
            accessibilityRole="button"
            style={styles.breadcrumbBack}
          >
            <CaretLeftIcon
              size={16}
              color={colors.textSubtle}
              weight="light"
            />
          </TouchableOpacity>
          <Text style={[styles.breadcrumbText, { color: colors.text }]}>
            {selectedBook.name}
          </Text>
        </View>

        {/* Chapter grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.chapterGrid}>
            {Array.from(
              { length: selectedBook.chapterCount },
              (_, i) => i + 1,
            ).map((ch) => {
              const isCurrentChapter =
                currentBookId === selectedBook.id &&
                currentChapter === ch;

              return (
                <TouchableOpacity
                  key={ch}
                  onPress={() => handleChapterSelect(ch)}
                  style={[
                    styles.chapterCell,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(0,0,0,0.04)',
                    },
                    isCurrentChapter && {
                      borderWidth: 1.5,
                      borderColor: colors.accent,
                    },
                  ]}
                  accessibilityLabel={`Chapter ${ch}${isCurrentChapter ? ', current chapter' : ''}`}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.chapterNumber,
                      { color: colors.text },
                      isCurrentChapter && {
                        fontFamily: FontFamily.uiMedium,
                      },
                    ]}
                  >
                    {ch}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Dark overlay */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Close navigator"
        accessibilityRole="button"
      />

      {/* Bottom sheet */}
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(200)}
        exiting={SlideOutDown.duration(180)}
        style={[
          styles.container,
          {
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            shadowColor: '#000',
            maxHeight: SHEET_MAX_HEIGHT,
          },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View
            style={[
              styles.handle,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.15)'
                  : 'rgba(0,0,0,0.12)',
              },
            ]}
          />
        </View>

        {/* Search bar */}
        {renderSearchBar()}

        {/* Content area */}
        {mode === 'books' && renderBooksMode()}
        {mode === 'chapters' && renderChaptersMode()}
      </Animated.View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 99,
  },
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 20,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },

  // Search bar
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 15,
    padding: 0,
  },

  // Suggestions
  suggestionsContainer: {
    marginBottom: 12,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  suggestionIcon: {
    marginRight: 10,
  },
  suggestionText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    flex: 1,
  },

  // Search results
  searchResultRow: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    marginBottom: 3,
  },
  searchSnippet: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  searchLoadingRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  // Mode container
  modeContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },

  // Book sections
  bookSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bookChip: {
    minWidth: '18%',
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },

  // Breadcrumb
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  breadcrumbBack: {
    padding: 4,
    marginRight: 8,
  },
  breadcrumbText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 16,
  },

  // Chapter grid
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chapterCell: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumber: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
});
