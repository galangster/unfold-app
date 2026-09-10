import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { HighlighterIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type BibleHighlight, type Highlight } from '@/lib/store';
import type { SavedItem } from '@/lib/saved-highlights';
import {
  buildSavedEntries,
  countSavedEntries,
  filterSavedEntries,
  savedEntryKey,
  savedUndoMessage,
  undoSavedDeletions,
  type SavedBookmarkItem,
  type SavedEntry,
  type SavedSourceFilter,
  type SavedTypeFilter,
  type SavedUndoAction,
} from '@/lib/saved-items';
import {
  BookmarkRow,
  SAVED_CARD_GAP,
  SAVED_CARD_RADIUS,
  SavedRow,
  bookmarkAccessibilityLabel,
  savedItemAccessibilityLabel,
} from '@/components/saved/SavedRows';
import { SwipeToDeleteRow } from '@/components/saved/SwipeToDeleteRow';

const UNDO_DURATION_MS = 3000;

const SOURCE_CHIPS: { id: SavedSourceFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'devotional', label: 'Devotional' },
  { id: 'bible', label: 'Bible' },
];
const TYPE_CHIPS: { id: SavedTypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'notes', label: 'Notes' },
  { id: 'bookmarks', label: 'Bookmarks' },
];

/**
 * Owns the delete → Undo queue for Journal › Saved. The hub renders the
 * toast (it must sit outside the scrolling list), so the hook is separate
 * from the list component.
 */
export function useSavedUndo() {
  const [actions, setActions] = useState<SavedUndoAction[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const removeHighlight = useUnfoldStore((s) => s.removeHighlight);
  const removeBibleHighlight = useUnfoldStore((s) => s.removeBibleHighlight);
  const removeBookmark = useUnfoldStore((s) => s.removeBookmark);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActions([]);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const remove = useCallback(
    (entry: SavedEntry) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setActions((prev) => [...prev, { entry }]);
      if (entry.kind === 'bookmark') removeBookmark(entry.id);
      else if (entry.source === 'devotional') removeHighlight(entry.id);
      else removeBibleHighlight(entry.id);
      timerRef.current = setTimeout(() => setActions([]), UNDO_DURATION_MS);
    },
    [removeBookmark, removeHighlight, removeBibleHighlight],
  );

  const undo = useCallback(() => {
    if (actions.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    useUnfoldStore.setState((state) => undoSavedDeletions(state, actions));
    setActions([]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [actions]);

  return {
    visible: actions.length > 0,
    message: savedUndoMessage(actions),
    duration: UNDO_DURATION_MS,
    remove,
    undo,
    dismiss,
  };
}

function FilterChipRow<T extends string>({
  label,
  chips,
  active,
  counts,
  onSelect,
}: {
  label: string;
  chips: { id: T; label: string }[];
  active: T;
  counts: (id: T) => number;
  onSelect: (id: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={`${label} filter`}>
      {chips.map((chip) => {
        const isActive = active === chip.id;
        const count = counts(chip.id);
        return (
          <TouchableOpacity
            key={chip.id}
            activeOpacity={0.7}
            onPress={() => onSelect(chip.id)}
            style={[
              styles.chip,
              {
                borderColor: isActive ? colors.accent : colors.border,
                backgroundColor: isActive ? colors.accent : 'transparent',
              },
            ]}
            accessibilityRole="radio"
            accessibilityLabel={`${chip.label}, ${count} ${count === 1 ? 'item' : 'items'}`}
            accessibilityState={{ selected: isActive, checked: isActive }}
          >
            <Text
              style={[
                styles.chipLabel,
                {
                  fontFamily: isActive ? FontFamily.uiSemiBold : FontFamily.ui,
                  color: isActive ? colors.background : colors.textMuted,
                },
              ]}
            >
              {chip.label}
            </Text>
            <Text style={[styles.chipCount, { color: isActive ? colors.background : colors.textSubtle }]}>
              {count}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function emptyCopy(source: SavedSourceFilter, type: SavedTypeFilter, searching: boolean): { title: string; body: string } {
  if (searching) return { title: 'No matches', body: 'Try a different word or clear the search.' };
  if (type === 'bookmarks') return { title: 'No bookmarks yet.', body: 'Tap the bookmark icon while reading to save a passage here.' };
  if (type === 'notes') return { title: 'No notes yet.', body: 'Add a note to a Bible verse to save it here.' };
  if (source === 'bible') return { title: 'Nothing saved from the Bible yet.', body: 'Tap a verse in the Bible reader to highlight it.' };
  if (source === 'devotional') return { title: 'Nothing saved from devotionals yet.', body: 'Select text while reading to highlight it.' };
  return { title: 'Nothing saved yet.', body: 'Highlights, notes and bookmarks from your reading all land here.' };
}

interface SavedSegmentProps {
  searchQuery: string;
  onRemove: (entry: SavedEntry) => void;
}

/**
 * Journal › Saved. Rendered inside the hub's list header (the hub's FlatList
 * is typed over notebook notes), so rows here are not virtualized; saved
 * collections are small and rows are memoised.
 */
export const SavedSegment = memo(function SavedSegment({ searchQuery, onRemove }: SavedSegmentProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const highlights = useUnfoldStore((s) => s.highlights);
  const bibleHighlights = useUnfoldStore((s) => s.bibleHighlights);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const [source, setSource] = useState<SavedSourceFilter>('all');
  const [type, setType] = useState<SavedTypeFilter>('all');

  const entries = useMemo(
    () => buildSavedEntries(highlights, bibleHighlights, bookmarks, devotionals),
    [highlights, bibleHighlights, bookmarks, devotionals],
  );
  const filter = useMemo(() => ({ source, type, query: searchQuery }), [source, type, searchQuery]);
  const visible = useMemo(() => filterSavedEntries(entries, filter), [entries, filter]);
  const counts = useMemo(() => countSavedEntries(entries, filter), [entries, filter]);

  const selectSource = useCallback((id: SavedSourceFilter) => {
    Haptics.selectionAsync();
    setSource(id);
  }, []);
  const selectType = useCallback((id: SavedTypeFilter) => {
    Haptics.selectionAsync();
    setType(id);
  }, []);

  const openSavedItem = useCallback(
    (item: SavedItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (item.source === 'devotional') {
        const h = item.raw as Highlight;
        router.push({
          pathname: '/(tabs)/(today)/reading',
          params: { devotionalId: h.devotionalId, dayNumber: String(h.dayNumber), highlightId: h.id },
        });
        return;
      }
      const b = item.raw as BibleHighlight;
      router.push({
        pathname: '/(tabs)/(bible)/reader',
        params: {
          bookId: String(b.bookId),
          chapter: String(b.chapter),
          verse: String(b.verseStart),
          ...(item.kind === 'note' ? { openNote: 'true', noteId: b.id } : {}),
        },
      });
    },
    [router],
  );

  const openBookmark = useCallback(
    (item: SavedBookmarkItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/(tabs)/(today)/reading',
        params: {
          devotionalId: item.raw.devotionalId,
          dayNumber: String(item.raw.dayNumber),
          bookmarkId: item.raw.id,
        },
      });
    },
    [router],
  );

  const sourceCount = useCallback(
    (id: SavedSourceFilter) => (id === 'all' ? counts.bySource.devotional + counts.bySource.bible : counts.bySource[id]),
    [counts],
  );
  const typeCount = useCallback(
    (id: SavedTypeFilter) =>
      id === 'all' ? counts.byType.highlights + counts.byType.notes + counts.byType.bookmarks : counts.byType[id],
    [counts],
  );

  const empty = emptyCopy(source, type, searchQuery.trim().length > 0);

  return (
    <View style={styles.container}>
      {entries.length > 0 && (
        <View style={styles.filters}>
          <FilterChipRow label="Source" chips={SOURCE_CHIPS} active={source} counts={sourceCount} onSelect={selectSource} />
          <FilterChipRow label="Type" chips={TYPE_CHIPS} active={type} counts={typeCount} onSelect={selectType} />
        </View>
      )}

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.inputBackground }]}>
            <HighlighterIcon size={28} color={colors.accent} weight="light" style={{ opacity: 0.5 }} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{empty.title}</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>{empty.body}</Text>
        </View>
      ) : (
        visible.map((entry) =>
          entry.kind === 'bookmark' ? (
            <SwipeToDeleteRow
              key={savedEntryKey(entry)}
              accessibilityLabel={bookmarkAccessibilityLabel(entry)}
              cardGap={SAVED_CARD_GAP}
              cardRadius={SAVED_CARD_RADIUS}
              onPress={() => openBookmark(entry)}
              onDelete={() => onRemove(entry)}
            >
              <BookmarkRow item={entry} colors={colors} onPress={openBookmark} accessibilityElementsHidden />
            </SwipeToDeleteRow>
          ) : (
            <SwipeToDeleteRow
              key={savedEntryKey(entry)}
              accessibilityLabel={savedItemAccessibilityLabel(entry)}
              cardGap={SAVED_CARD_GAP}
              cardRadius={SAVED_CARD_RADIUS}
              onPress={() => openSavedItem(entry)}
              onDelete={() => onRemove(entry)}
            >
              <SavedRow item={entry} colors={colors} isDark={isDark} onPress={openSavedItem} accessibilityElementsHidden />
            </SwipeToDeleteRow>
          ),
        )
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing['6'] },
  filters: { gap: Spacing['2'], marginBottom: Spacing['4'] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 12 },
  chipCount: { fontFamily: FontFamily.uiMedium, fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: Spacing['6'] },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['5'],
  },
  emptyTitle: { fontFamily: FontFamily.display, fontSize: 20, marginBottom: Spacing['2'], textAlign: 'center' },
  emptyBody: { fontFamily: FontFamily.ui, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
