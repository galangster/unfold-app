import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MagnifyingGlassIcon, ClockIcon, CaretRightIcon, XIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useBibleDb } from '@/hooks/useBibleDb';
import { OT_BOOKS, NT_BOOKS, getBookCategory, CATEGORY_LABELS, citationBookName, type BibleBookInfo, type BibleCategory } from '@/lib/bible-constants';
import { DownloadBibleSheet } from '@/components/bible/DownloadBibleSheet';
import { alpha } from '@/components/ui';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { Typography } from '@/constants/typography';

const EMPTY_CHAPTERS: number[] = [];

export default function BibleHomeScreen() {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { isReady, isDownloading, progress, download, error } = useBibleDb();
  const getLastBiblePosition = useUnfoldStore((s) => s.getLastBiblePosition);
  const [selectedBook, setSelectedBook] = useState<BibleBookInfo | null>(null);

  const lastPosition = useMemo(() => getLastBiblePosition(), [getLastBiblePosition]);

  // Chapter numbers for the grid modal — rebuilt only when the selected book's
  // chapter count changes, not on every render of this screen.
  const chapterNumbers = useMemo(
    () =>
      selectedBook
        ? Array.from({ length: selectedBook.chapterCount }, (_, i) => i + 1)
        : EMPTY_CHAPTERS,
    [selectedBook],
  );

  // Auto-navigate to reader on first mount
  const hasAutoNavigated = useRef(false);

  useEffect(() => {
    if (!isReady || hasAutoNavigated.current) return;
    hasAutoNavigated.current = true;

    const target = lastPosition
      ? `/(tabs)/(bible)/reader?bookId=${lastPosition.bookId}&chapter=${lastPosition.chapter}`
      : '/(tabs)/(bible)/reader?bookId=1&chapter=1';

    router.replace(target);
  }, [isReady, lastPosition, router]);

  const handleBookPress = useCallback((book: BibleBookInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (book.chapterCount === 1) {
      router.push(`/(tabs)/(bible)/reader?bookId=${book.id}&chapter=1`);
    } else {
      setSelectedBook(book);
    }
  }, [router]);

  const handleChapterPress = useCallback((chapter: number) => {
    if (!selectedBook) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBook(null);
    router.push(`/(tabs)/(bible)/reader?bookId=${selectedBook.id}&chapter=${chapter}`);
  }, [selectedBook, router]);

  const handleContinueReading = useCallback(() => {
    if (!lastPosition) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(tabs)/(bible)/reader?bookId=${lastPosition.bookId}&chapter=${lastPosition.chapter}`);
  }, [lastPosition, router]);

  const handleSearchPress = useCallback(() => {
    router.push('/(tabs)/(bible)/search');
  }, [router]);

  /** Group books by literary category and render with sub-labels */
  const renderCategorizedBooks = useCallback((books: BibleBookInfo[]) => {
    // Group books into contiguous category runs
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
            {/* Single-accent / neutral coding — no per-book rainbow */}
            <Text style={[styles.categoryLabel, { color: colors.textSubtle }]}>
              {CATEGORY_LABELS[group.category]}
            </Text>
            <View style={styles.bookGrid}>
              {group.books.map((book) => {
                const isSelected = selectedBook?.id === book.id;
                return (
                  <TouchableOpacity
                    key={book.id}
                    onPress={() => handleBookPress(book)}
                    style={[styles.bookPill, {
                      backgroundColor: isSelected
                        ? alpha(colors.accent, 0.16)
                        : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      borderColor: isSelected ? colors.accent : 'transparent',
                    }]}
                    activeOpacity={0.6}
                    accessibilityLabel={book.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[styles.bookName, { color: isSelected ? colors.accent : colors.text }]}
                      numberOfLines={1}
                    >
                      {book.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    );
  }, [isDark, colors, selectedBook, handleBookPress]);

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

  // Blank screen while auto-navigating to reader on first mount
  // Prevents the book picker from flashing for one frame
  if (!hasAutoNavigated.current) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}>
          Bible
        </Text>
      </View>

      {/* Search Bar */}
      <TouchableOpacity
        onPress={handleSearchPress}
        style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}
        activeOpacity={0.7}
        accessibilityLabel="Search the Bible"
        accessibilityRole="search"
      >
        <MagnifyingGlassIcon size={16} color={colors.textHint} weight="light" />
        <Text style={[styles.searchPlaceholder, { color: colors.textHint }]}>
          Search the Bible...
        </Text>
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Continue Reading */}
        {lastPosition && (
          <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}>
            <TouchableOpacity
              onPress={handleContinueReading}
              style={[styles.continueCard, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              }]}
              activeOpacity={0.6}
              accessibilityLabel={`Continue reading ${citationBookName(lastPosition.bookName)} ${lastPosition.chapter}`}
            >
              <View style={styles.continueLeft}>
                <ClockIcon size={14} color={colors.textSubtle} weight="light" />
                <Text style={[styles.continueLabel, { color: colors.textSubtle }]}>
                  Continue
                </Text>
              </View>
              <View style={styles.continueRight}>
                <Text style={[styles.continueRef, { color: colors.text }]}>
                  {citationBookName(lastPosition.bookName)} {lastPosition.chapter}
                </Text>
                <CaretRightIcon size={12} color={colors.textSubtle} weight="light" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Old Testament */}
        <Text style={[styles.sectionHeader, { color: colors.text }]}>
          Old Testament
        </Text>
        {renderCategorizedBooks(OT_BOOKS)}

        {/* New Testament */}
        <Text style={[styles.sectionHeader, { color: colors.text }]}>
          New Testament
        </Text>
        {renderCategorizedBooks(NT_BOOKS)}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Chapter Grid Modal */}
      <Modal
        visible={selectedBook !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBook(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedBook(null)}
        >
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            style={[styles.chapterModal, {
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            }]}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
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
                  <XIcon size={18} color={colors.textSubtle} weight="light" />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
    paddingBottom: Spacing['3'],
  },
  title: {
    fontSize: FontSize['3xl'],
    letterSpacing: -0.5,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing['6'],
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    gap: Spacing['2'],
    marginBottom: Spacing['5'],
  },
  searchPlaceholder: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
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
  continueLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  continueLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
  continueRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    opacity: 0.7,
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bookPill: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    minWidth: '30%',
    flexGrow: 1,
    flexBasis: '30%',
    maxWidth: '48%',
  },
  bookName: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
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
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  chapterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['5'],
  },
  chapterModalTitle: {
    fontSize: 22,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterGridScroll: {
    maxHeight: 400,
  },
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
