import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MagnifyingGlassIcon, BookmarkSimpleIcon, ClockIcon, CaretRightIcon, XIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useBibleDb } from '@/hooks/useBibleDb';
import { BIBLE_BOOKS, OT_BOOKS, NT_BOOKS, type BibleBookInfo } from '@/lib/bible-constants';
import { DownloadBibleSheet } from '@/components/bible/DownloadBibleSheet';

export default function BibleHomeScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { isReady, isDownloading, progress, download, error } = useBibleDb();
  const getLastBiblePosition = useUnfoldStore((s) => s.getLastBiblePosition);
  const [selectedBook, setSelectedBook] = useState<BibleBookInfo | null>(null);

  const lastPosition = useMemo(() => getLastBiblePosition(), [getLastBiblePosition]);

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

  const handleSavedPress = useCallback(() => {
    router.push('/(tabs)/(bible)/saved');
  }, [router]);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}>
          Bible
        </Text>
        <TouchableOpacity
          onPress={handleSavedPress}
          style={styles.headerButton}
          accessibilityLabel="Saved verses"
          accessibilityRole="button"
          hitSlop={8}
        >
          <BookmarkSimpleIcon size={22} color={colors.textSubtle} weight="light" />
        </TouchableOpacity>
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
          <Animated.View entering={FadeInDown.duration(400)}>
            <TouchableOpacity
              onPress={handleContinueReading}
              style={[styles.continueCard, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              }]}
              activeOpacity={0.6}
              accessibilityLabel={`Continue reading ${lastPosition.bookName} ${lastPosition.chapter}`}
            >
              <View style={styles.continueLeft}>
                <ClockIcon size={14} color={colors.textSubtle} weight="light" />
                <Text style={[styles.continueLabel, { color: colors.textSubtle }]}>
                  Continue
                </Text>
              </View>
              <View style={styles.continueRight}>
                <Text style={[styles.continueRef, { color: colors.text }]}>
                  {lastPosition.bookName} {lastPosition.chapter}
                </Text>
                <CaretRightIcon size={12} color={colors.textSubtle} weight="light" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Old Testament */}
        <Text style={[styles.sectionHeader, { color: colors.textHint }]}>
          Old Testament
        </Text>
        <View style={styles.bookGrid}>
          {OT_BOOKS.map((book) => (
            <TouchableOpacity
              key={book.id}
              onPress={() => handleBookPress(book)}
              style={[styles.bookPill, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              }]}
              activeOpacity={0.6}
              accessibilityLabel={book.name}
              accessibilityRole="button"
            >
              <Text style={[styles.bookName, { color: colors.text }]} numberOfLines={1}>
                {book.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* New Testament */}
        <Text style={[styles.sectionHeader, { color: colors.textHint }]}>
          New Testament
        </Text>
        <View style={styles.bookGrid}>
          {NT_BOOKS.map((book) => (
            <TouchableOpacity
              key={book.id}
              onPress={() => handleBookPress(book)}
              style={[styles.bookPill, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              }]}
              activeOpacity={0.6}
              accessibilityLabel={book.name}
              accessibilityRole="button"
            >
              <Text style={[styles.bookName, { color: colors.text }]} numberOfLines={1}>
                {book.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
            entering={FadeIn.duration(200)}
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
                  {selectedBook && Array.from({ length: selectedBook.chapterCount }, (_, i) => i + 1).map((ch) => (
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
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 30,
    letterSpacing: -0.5,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
    marginBottom: 20,
  },
  searchPlaceholder: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  continueCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 28,
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
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 28,
  },
  bookPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
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
    padding: 28,
  },
  chapterModal: {
    borderRadius: 16,
    padding: 20,
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
    marginBottom: 20,
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
