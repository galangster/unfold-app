import React, { useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { CaretLeftIcon, MagnifyingGlassIcon, XCircleIcon, BookOpenTextIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { alpha } from '@/components/ui';
import { useBibleSearch, type BibleSearchResultWithMeta } from '@/hooks/useBibleSearch';
import type { BibleTranslation } from '@/lib/bible-db';

/** Example searches offered as a next action in the Bible search empty state. */
const SUGGESTED_SEARCHES = ['love', 'peace', 'forgiveness', 'hope', 'strength'];

interface SearchEmptyStateProps {
  mode: 'prompt' | 'noResults';
  query?: string;
  onSuggest: (term: string) => void;
}

/**
 * Designed empty / no-results state for Bible search.
 * Matches the Companion greeting + Notebook ghost-note quality bar:
 * a soft accent icon, a serif display headline, warm body copy, and a clear next action.
 */
function SearchEmptyState({ mode, query, onSuggest }: SearchEmptyStateProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const isNoResults = mode === 'noResults';
  const headline = isNoResults ? 'Nothing turned up' : 'Search the Scriptures';
  const description = isNoResults
    ? `We couldn’t find a verse matching “${query}”. Try a different word, or start with one of these.`
    : 'Look for a word, phrase, or theme and we’ll find every verse it appears in.';

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(40).easing(Ease.out)}
      style={styles.emptyContainer}
    >
      <View style={[styles.emptyIconWrap, { backgroundColor: alpha(colors.accent, 0.15) }]}>
        <BookOpenTextIcon size={26} color={colors.accent} weight="light" />
      </View>

      <Text style={[styles.emptyHeadline, { color: colors.text }]}>
        {headline}
      </Text>

      <Text style={[styles.emptyDescription, { color: colors.textMuted }]}>
        {description}
      </Text>

      <View style={styles.suggestionRow} accessibilityRole="menu">
        {SUGGESTED_SEARCHES.map((term) => (
          <TouchableOpacity
            key={term}
            onPress={() => onSuggest(term)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Search for ${term}`}
            style={[
              styles.suggestionChip,
              { backgroundColor: alpha(colors.accent, 0.12), borderColor: alpha(colors.accent, 0.35) },
            ]}
          >
            <Text style={[styles.suggestionText, { color: colors.accent }]}>{term}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}

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

  const handleSuggest = useCallback((term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  }, [setQuery]);

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
            selectionColor={colors.accent}
            cursorColor={colors.accent}
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
        <SearchEmptyState mode="prompt" onSuggest={handleSuggest} />
      ) : results.length === 0 ? (
        <SearchEmptyState mode="noResults" query={query} onSuggest={handleSuggest} />
      ) : (
        <FlashList
          data={results}
          renderItem={renderResult}
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
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    gap: Spacing['2'],
  },
  backButton: {
    padding: Spacing['1'],
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['3'],
    paddingVertical: 10,
    borderRadius: Radius.md,
    gap: Spacing['2'],
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
    paddingBottom: 100,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['4'],
  },
  emptyHeadline: {
    fontFamily: FontFamily.display,
    fontSize: 21,
    textAlign: 'center',
    marginBottom: Spacing['2'],
  },
  emptyDescription: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: Spacing['6'],
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  suggestionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
  },
  resultItem: {
    paddingHorizontal: Spacing['5'],
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
