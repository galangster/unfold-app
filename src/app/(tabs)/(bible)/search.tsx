import React, { useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { CaretLeftIcon, MagnifyingGlassIcon, XCircleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useBibleSearch, type BibleSearchResultWithMeta } from '@/hooks/useBibleSearch';
import type { BibleTranslation } from '@/lib/bible-db';

export default function BibleSearchScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const bibleReaderSettings = useUnfoldStore((s) => s.bibleReaderSettings);

  const { query, setQuery, results, isSearching } = useBibleSearch({
    translation: bibleReaderSettings.translation as BibleTranslation,
  });

  const handleResultPress = useCallback((result: BibleSearchResultWithMeta) => {
    router.push(`/(tabs)/(bible)/reader?bookId=${result.bookId}&chapter=${result.chapter}&verse=${result.verse}`);
  }, [router]);

  const renderResult = useCallback(({ item }: { item: BibleSearchResultWithMeta }) => (
    <TouchableOpacity
      onPress={() => handleResultPress(item)}
      style={[styles.resultItem, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
      activeOpacity={0.7}
    >
      <Text style={[styles.resultRef, { color: colors.accent }]}>
        {item.reference}
      </Text>
      <Text style={[styles.resultText, { color: colors.text }]} numberOfLines={2}>
        {item.text}
      </Text>
    </TouchableOpacity>
  ), [handleResultPress, colors, isDark]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <CaretLeftIcon size={20} color={colors.text} weight="light" />
        </TouchableOpacity>

        <View style={[styles.searchInput, { backgroundColor: colors.inputBackground }]}>
          <MagnifyingGlassIcon size={16} color={colors.textSubtle} weight="light" />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search the Bible..."
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, { color: colors.text }]}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={8}>
              <XCircleIcon size={18} color={colors.textSubtle} weight="fill" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {isSearching && query.length > 0 ? (
        <View style={styles.centerContent}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={[styles.hintText, { color: colors.textSubtle }]}>
            Search for a word, phrase, or topic
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={[styles.hintText, { color: colors.textSubtle }]}>
            No results found for "{query}"
          </Text>
        </View>
      ) : (
        <FlashList
          data={results}
          renderItem={renderResult}
          estimatedItemSize={80}
          keyExtractor={(item) => `${item.bookId}-${item.chapter}-${item.verse}`}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 15,
    padding: 0,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  hintText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
  resultItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    marginBottom: 4,
  },
  resultText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
  },
});
