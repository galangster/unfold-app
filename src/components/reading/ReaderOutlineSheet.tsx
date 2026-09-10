import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Sheet } from '@/components/ui';
import { BookOpenIcon, HighlighterIcon, PencilLineIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { HIGHLIGHT_COLOR_LABELS, type DevotionalDay, type Highlight, type JournalEntry } from '@/lib/store';
import { highlightSwatch } from '@/lib/highlight-palette';
import { stripOuterQuotes } from '@/lib/cn';
import { formatRelativeDate } from '@/lib/format-relative-date';
import type { ReaderSection } from '@/components/reading/DevotionalContent';
import { buildReaderContents } from '@/lib/reader-contents';

type OutlineTab = 'contents' | 'highlights' | 'notes';

const TABS: { id: OutlineTab; label: string }[] = [
  { id: 'contents', label: 'Contents' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'notes', label: 'Notes' },
];

interface ReaderOutlineSheetProps {
  visible: boolean;
  onClose: () => void;
  day: DevotionalDay | undefined;
  /** Sections that have laid out and can be jumped to. */
  availableSections: ReadonlySet<ReaderSection>;
  highlights: Highlight[];
  entries: JournalEntry[];
  onJumpToSection: (section: ReaderSection) => void;
  onJumpToHighlight: (highlight: Highlight) => void;
  onOpenEntry: (entry: JournalEntry) => void;
  onWriteReflection: () => void;
}

function entryPreview(entry: JournalEntry): string {
  const text = entry.content?.trim()
    || entry.questionResponses?.find((r) => r.response?.trim())?.response
    || entry.soapResponses?.application
    || '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Reader outline behind the book icon: jump to a section, a highlight, or a
 * reflection written for this day.
 */
export function ReaderOutlineSheet({
  visible,
  onClose,
  day,
  availableSections,
  highlights,
  entries,
  onJumpToSection,
  onJumpToHighlight,
  onOpenEntry,
  onWriteReflection,
}: ReaderOutlineSheetProps) {
  const { colors, isDark } = useTheme();
  const [tab, setTab] = useState<OutlineTab>('contents');

  // Open on Highlights when the reading has any (what the sheet exists to
  // surface), else Contents. Only on open: a count change while the sheet is
  // up must not move the reader's tab.
  const highlightCountRef = useRef(highlights.length);
  highlightCountRef.current = highlights.length;
  useEffect(() => {
    if (visible) setTab(highlightCountRef.current > 0 ? 'highlights' : 'contents');
  }, [visible]);

  const contents = useMemo(() => (day ? buildReaderContents(day) : []), [day]);
  const sortedHighlights = useMemo(
    () => [...highlights].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [highlights],
  );
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [entries],
  );

  const select = (next: OutlineTab) => {
    Haptics.selectionAsync();
    setTab(next);
  };

  const counts: Record<OutlineTab, number> = {
    contents: contents.length,
    highlights: sortedHighlights.length,
    notes: sortedEntries.length,
  };

  return (
    <Sheet visible={visible} onClose={onClose} contentPadding={Spacing['5']} bottomPadding={Spacing['6']}>
      <Text style={[styles.title, { color: colors.text }]}>{day?.title ?? 'This reading'}</Text>
      {day?.scriptureReference ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{day.scriptureReference}</Text>
      ) : null}

      <View style={[styles.tabs, { borderColor: colors.border }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => select(t.id)}
              style={[styles.tab, active && { borderBottomColor: colors.accent }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t.label}, ${counts[t.id]} ${counts[t.id] === 1 ? 'item' : 'items'}`}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.text : colors.textSubtle, fontFamily: active ? FontFamily.uiMedium : FontFamily.ui },
                ]}
              >
                {t.label}
              </Text>
              <Text style={[styles.tabCount, { color: active ? colors.textMuted : colors.textSubtle }]}>{counts[t.id]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'contents' &&
        contents.map((row) => {
          const ready = availableSections.has(row.section);
          return (
            <TouchableOpacity
              key={row.section}
              activeOpacity={0.7}
              disabled={!ready}
              onPress={() => onJumpToSection(row.section)}
              style={[styles.row, { borderBottomColor: colors.border, opacity: ready ? 1 : 0.45 }]}
              accessibilityRole="button"
              accessibilityLabel={row.detail ? `${row.label}, ${row.detail}` : row.label}
              accessibilityHint={ready ? 'Scrolls the reading to this section' : 'This section has not loaded yet'}
            >
              <Text style={[styles.rowLabel, { color: colors.text }]}>{row.label}</Text>
              {row.detail ? (
                <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={1}>
                  {row.detail}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}

      {tab === 'highlights' &&
        (sortedHighlights.length === 0 ? (
          <EmptyRow
            icon={<HighlighterIcon size={22} color={colors.accent} weight="light" />}
            title="No highlights in this reading yet."
            body="Select a line you want to keep and choose Highlight."
            colors={colors}
          />
        ) : (
          sortedHighlights.map((h) => {
            const ink = highlightSwatch(h.color, isDark);
            return (
              <TouchableOpacity
                key={h.id}
                activeOpacity={0.7}
                onPress={() => onJumpToHighlight(h)}
                style={[styles.row, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={`${HIGHLIGHT_COLOR_LABELS[h.color ?? 'yellow']} highlight: ${h.highlightedText}`}
                accessibilityHint="Scrolls the reading to this highlight"
              >
                <View style={styles.highlightRow}>
                  <View style={[styles.dot, { backgroundColor: ink }]} />
                  <Text style={[styles.highlightText, { color: colors.text }]} numberOfLines={3}>
                    {stripOuterQuotes(h.highlightedText)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        ))}

      {tab === 'notes' && (
        <>
          {sortedEntries.length === 0 ? (
            <EmptyRow
              icon={<PencilLineIcon size={22} color={colors.accent} weight="light" />}
              title="No reflections for this day yet."
              body="Your journal entries for this reading will gather here."
              colors={colors}
            />
          ) : (
            sortedEntries.map((entry) => {
              const preview = entryPreview(entry);
              return (
                <TouchableOpacity
                  key={entry.id}
                  activeOpacity={0.7}
                  onPress={() => onOpenEntry(entry)}
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Reflection from ${formatRelativeDate(entry.updatedAt)}: ${preview || 'no text'}`}
                >
                  <Text style={[styles.rowDetail, { color: colors.textMuted, marginBottom: 4 }]}>
                    {formatRelativeDate(entry.updatedAt)}
                  </Text>
                  <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={3}>
                    {preview || 'Untitled reflection'}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onWriteReflection}
            style={[styles.cta, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Write a reflection"
            accessibilityHint="Opens the journal for this reading"
          >
            <BookOpenIcon size={16} color={colors.background} weight="regular" />
            <Text style={[styles.ctaLabel, { color: colors.background }]}>Write a reflection</Text>
          </TouchableOpacity>
        </>
      )}
    </Sheet>
  );
}

function EmptyRow({
  icon,
  title,
  body,
  colors,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.inputBackground }]}>{icon}</View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.textMuted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FontFamily.display, fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing['4'],
    marginBottom: Spacing['2'],
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 14, letterSpacing: 0.1 },
  tabCount: { fontFamily: FontFamily.uiMedium, fontSize: 11 },
  row: { paddingVertical: Spacing['3'], borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, lineHeight: 22 },
  rowDetail: { fontFamily: FontFamily.ui, fontSize: FontSize.xs, marginTop: 2 },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['3'] },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 7 },
  highlightText: { flex: 1, fontFamily: FontFamily.bodyItalic, fontSize: FontSize.base, lineHeight: 24 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    marginTop: Spacing['4'],
    paddingVertical: 14,
    borderRadius: Radius.md,
  },
  ctaLabel: { fontFamily: FontFamily.uiSemiBold, fontSize: 15 },
  empty: { alignItems: 'center', paddingVertical: Spacing['8'], paddingHorizontal: Spacing['4'] },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing['3'] },
  emptyTitle: { fontFamily: FontFamily.display, fontSize: 18, textAlign: 'center', marginBottom: Spacing['1'] },
  emptyBody: { fontFamily: FontFamily.ui, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
