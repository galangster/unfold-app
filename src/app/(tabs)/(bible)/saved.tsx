import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, BookmarkSimpleIcon, TrashIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import type { BibleHighlight, BibleHighlightColor } from '@/lib/store';

const COLOR_FILTERS: Array<{ key: BibleHighlightColor | 'all'; label: string; color: string }> = [
  { key: 'all', label: 'All', color: 'transparent' },
  { key: 'yellow', label: 'Yellow', color: '#FFD700' },
  { key: 'green', label: 'Green', color: '#4CAF50' },
  { key: 'blue', label: 'Blue', color: '#5B9BD5' },
  { key: 'purple', label: 'Purple', color: '#9B59B6' },
  { key: 'red', label: 'Red', color: '#E74C3C' },
];

export default function SavedVersesScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const bibleHighlights = useUnfoldStore((s) => s.bibleHighlights);
  const removeBibleHighlight = useUnfoldStore((s) => s.removeBibleHighlight);
  const [activeFilter, setActiveFilter] = useState<BibleHighlightColor | 'all'>('all');

  const filteredHighlights = useMemo(() => {
    const sorted = [...bibleHighlights].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (activeFilter === 'all') return sorted;
    return sorted.filter((h) => h.color === activeFilter);
  }, [bibleHighlights, activeFilter]);

  const handleHighlightPress = useCallback((h: BibleHighlight) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(tabs)/(bible)/reader?bookId=${h.bookId}&chapter=${h.chapter}&verse=${h.verseStart}`);
  }, [router]);

  const handleDelete = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeBibleHighlight(id);
  }, [removeBibleHighlight]);

  const renderHighlight = useCallback(({ item }: { item: BibleHighlight }) => {
    const refStr = item.verseStart === item.verseEnd
      ? `${item.bookName} ${item.chapter}:${item.verseStart}`
      : `${item.bookName} ${item.chapter}:${item.verseStart}-${item.verseEnd}`;

    const colorDot = COLOR_FILTERS.find((c) => c.key === item.color)?.color ?? '#FFD700';

    return (
      <TouchableOpacity
        onPress={() => handleHighlightPress(item)}
        activeOpacity={0.7}
        style={[styles.highlightItem, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
      >
        <View style={[styles.colorBar, { backgroundColor: colorDot }]} />
        <View style={styles.highlightContent}>
          <Text style={[styles.highlightRef, { color: colors.accent }]}>
            {refStr} ({item.translation})
          </Text>
          <Text style={[styles.highlightText, { color: colors.text }]} numberOfLines={3}>
            {item.text}
          </Text>
          {item.note && (
            <Text style={[styles.highlightNote, { color: colors.textSubtle }]} numberOfLines={1}>
              Note: {item.note}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => handleDelete(item.id)}
          style={styles.deleteButton}
          accessibilityLabel="Delete highlight"
        >
          <TrashIcon size={18} color={colors.textSubtle} weight="light" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [handleHighlightPress, handleDelete, colors, isDark]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
          <CaretLeftIcon size={20} color={colors.text} weight="light" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.uiMedium }]}>
          Saved Verses
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Color Filters */}
      <View style={styles.filterRow}>
        {COLOR_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveFilter(f.key);
            }}
            style={[
              styles.filterPill,
              { backgroundColor: activeFilter === f.key ? colors.accent : colors.inputBackground },
            ]}
          >
            {f.key !== 'all' && (
              <View style={[styles.filterDot, { backgroundColor: f.color }]} />
            )}
            <Text style={[
              styles.filterLabel,
              { color: activeFilter === f.key ? '#FFFFFF' : colors.textSubtle },
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Highlights List */}
      {filteredHighlights.length === 0 ? (
        <View style={styles.emptyState}>
          <BookmarkSimpleIcon size={40} color={colors.textHint} weight="light" />
          <Text style={[styles.emptyText, { color: colors.textSubtle }]}>
            {activeFilter === 'all'
              ? 'Highlight verses while reading to save them here'
              : `No ${activeFilter} highlights yet`}
          </Text>
        </View>
      ) : (
        <FlashList
          data={filteredHighlights}
          renderItem={renderHighlight}
          keyExtractor={(item) => item.id}
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingVertical: 10,
  },
  backButton: {
    padding: Spacing['1'],
  },
  title: {
    fontSize: 17,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    gap: Spacing['2'],
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['3'],
    paddingVertical: 6,
    borderRadius: Radius.xl,
    gap: 6,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colorBar: {
    width: 3,
    height: '100%',
    minHeight: 40,
    borderRadius: 2,
    marginRight: Spacing['3'],
  },
  highlightContent: {
    flex: 1,
  },
  highlightRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    marginBottom: Spacing['1'],
  },
  highlightText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  highlightNote: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
    marginTop: 4,
  },
  deleteButton: {
    padding: Spacing['2'],
    marginLeft: Spacing['2'],
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
    gap: 12,
  },
  emptyText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: Spacing['10'],
  },
});
