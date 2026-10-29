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
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';
import { weekRowSpokenLabel, weekRowTitle, weeksHeadingLabel, withholdsWeekPromise, type SeriesWeeks } from '@/lib/series-weeks';

function chapterNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function ChapterJourney({
  chapters,
  colors,
  canOpenChapter,
  onOpenChapter,
  seriesPaused = false,
  premiumPolicy,
  weeks = null,
}: {
  chapters: readonly BookChapter[];
  colors: ColorTheme;
  canOpenChapter: (chapter: BookChapter) => boolean;
  onOpenChapter: (chapter: BookChapter) => void;
  /** A paused series promises no planning (R4) and marks no current row. */
  seriesPaused?: boolean;
  /** Week promises need granted premium (R4). The current marker does not. */
  premiumPolicy: PremiumAccessPolicy;
  /** The weeks of a chaptered series; null keeps the legacy list (R6). */
  weeks?: SeriesWeeks | null;
}) {
  if (chapters.length === 0) return null;

  const withholdsPromise = withholdsWeekPromise(seriesPaused, premiumPolicy);

  const countLabel = weeks
    ? weeksHeadingLabel(weeks)
    : chapters.length === 1 ? '1 part' : `${chapters.length} parts`;

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
        const week = weeks ? chapter.week : undefined;
        const title = week ? weekRowTitle(week, { withholdsPromise }) : chapter.name;
        const label = week
          ? weekRowSpokenLabel(week, chapter.status, chapter.readCount, { withholdsPromise })
          : `${chapter.name}, ${chapterStatusLabel(chapter)}`;
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
              accessibilityLabel={label}
              disabled={!openable}
              onPress={() => {
                if (openable) onOpenChapter(chapter);
              }}
              activeOpacity={0.7}
              style={styles.row}
            >
              {week ? null : <View style={styles.numberSlot}>
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
              </View>}
              <View style={styles.info}>
                <Text
                  style={[styles.title, { color: colors.text }]}
                >
                  {title}
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
              {current && !seriesPaused ? (
                <View
                  style={[styles.marker, { backgroundColor: colors.accent }]}
                  accessibilityLabel={week ? 'Current week' : 'Current part'}
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
