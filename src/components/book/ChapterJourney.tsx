import { TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { CaretRightIcon, CheckIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import type { ColorTheme } from '@/constants/colors';
import {
  chapterStatusLabel,
  type BookChapter,
} from '@/lib/book-of-seasons';

function chapterNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function ChapterJourney({
  chapters,
  colors,
  canOpenChapter,
  onOpenChapter,
}: {
  chapters: readonly BookChapter[];
  colors: ColorTheme;
  canOpenChapter: (chapter: BookChapter) => boolean;
  onOpenChapter: (chapter: BookChapter) => void;
}) {
  if (chapters.length === 0) return null;

  const countLabel =
    chapters.length === 1 ? '1 chapter' : `${chapters.length} chapters`;

  return (
    <View testID="book-chapter-journey" accessibilityLabel="In this season">
      <View style={styles.heading}>
        <Text style={[styles.headingTitle, { color: colors.text }]}>
          In this season
        </Text>
        <Text style={[styles.headingCount, { color: colors.textMuted }]}>
          {countLabel}
        </Text>
      </View>
      {chapters.map((chapter, index) => {
        const openable = canOpenChapter(chapter);
        const current = chapter.status === 'current';
        return (
          <View
            key={`${chapter.fromDay}-${chapter.name}`}
            style={[
              styles.rowWrap,
              index > 0 ? { borderTopColor: colors.border, borderTopWidth: 1 } : null,
            ]}
          >
            <TouchableOpacity
              testID={`book-chapter-${chapter.fromDay}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !openable }}
              accessibilityLabel={`${chapter.name}, ${chapterStatusLabel(chapter)}`}
              disabled={!openable}
              onPress={() => {
                if (openable) onOpenChapter(chapter);
              }}
              activeOpacity={0.7}
              style={styles.row}
            >
              <View style={styles.numberSlot}>
                {chapter.status === 'done' ? (
                  <CheckIcon size={18} color={colors.accent} weight="regular" />
                ) : (
                  <Text
                    style={[
                      styles.number,
                      { color: current ? colors.accent : colors.textMuted },
                    ]}
                  >
                    {chapterNumber(index)}
                  </Text>
                )}
              </View>
              <View style={styles.info}>
                <Text
                  style={[styles.title, { color: colors.text }]}
                >
                  {chapter.name}
                </Text>
                <Text
                  style={[
                    styles.status,
                    { color: current ? colors.accent : colors.textMuted },
                  ]}
                >
                  {chapterStatusLabel(chapter)}
                </Text>
              </View>
              {current ? (
                <View
                  style={[styles.marker, { backgroundColor: colors.accent }]}
                  accessibilityLabel="Current chapter"
                />
              ) : openable ? (
                <CaretRightIcon
                  size={14}
                  color={colors.textMuted}
                  weight="regular"
                />
              ) : null}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing['2.5'],
    marginBottom: Spacing['2'],
  },
  headingTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    lineHeight: 26,
    flexShrink: 1,
  },
  headingCount: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: 16,
    flexShrink: 0,
  },
  rowWrap: {},
  row: {
    minHeight: 56,
    paddingVertical: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  numberSlot: {
    minWidth: 22,
    alignItems: 'center',
  },
  number: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: Spacing['1'],
  },
  title: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  status: {
    ...Typography.cardMeta,
    fontSize: 11,
    lineHeight: 16,
  },
  marker: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing['1'],
  },
});
