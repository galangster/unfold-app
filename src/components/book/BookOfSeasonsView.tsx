import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { firstReadingLabel } from '@/lib/bookshelf';
import { Spacing } from '@/constants/spacing';
import type { ColorTheme } from '@/constants/colors';
import type { Devotional } from '@/lib/store';
import type { AdaptivePanes } from '@/lib/adaptive-layout';
import { FacingPanes } from '@/components/ui/FacingPanes';
import {
  buildBookOfSeasonsModel,
  resolveBookOpenDayNumber,
} from '@/lib/book-of-seasons';
import { OpenReadingPage } from './OpenReadingPage';
import { ActiveSeriesBookHero } from './ActiveSeriesBookHero';
import { ChapterJourney } from './ChapterJourney';
import { BookDayList } from './BookDayList';

export function BookOfSeasonsView({
  devotional,
  seriesPaused,
  now,
  colors,
  isDark,
  onOpenDay,
  headerAccessory,
  showAllReadings = false,
  spread = null,
}: {
  devotional: Devotional;
  seriesPaused: boolean;
  now: Date;
  colors: ColorTheme;
  isDark: boolean;
  onOpenDay: (dayNumber: number, openingId?: string) => void;
  headerAccessory?: ReactNode;
  showAllReadings?: boolean;
  /**
   * Row geometry from resolveAdaptivePanes. It opens the book: the current
   * page on the left, the chapters or days on the right. Place the view flush
   * with the safe-area edges when it is set.
   */
  spread?: AdaptivePanes | null;
}) {
  const model = buildBookOfSeasonsModel(devotional, now, seriesPaused);
  const today = model?.page;
  const chapters = model?.chapters ?? [];
  const theme = devotional.seriesArc?.overarchingTheme?.trim();
  const openBook = spread?.axis === 'row' ? spread : null;
  const accessory = !showAllReadings && headerAccessory
    ? <View style={styles.accessoryRow}>{headerAccessory}</View>
    : null;

  // The current page keeps one tree position in every layout, so opening or
  // closing the device never remounts it or its page-curl capture.
  const currentPage = (
    <View testID="book-current-page" style={openBook ? styles.page : undefined}>
      {showAllReadings ? <View style={styles.season}>
        {firstReadingLabel(devotional) ? (
          <Text style={[styles.subtitle, { color: colors.textMuted, marginTop: 0, marginBottom: Spacing['2'] }]}>
            {firstReadingLabel(devotional)}
          </Text>
        ) : null}
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>{devotional.title}</Text>
          {headerAccessory}
        </View>
        {theme ? (
          <Text
            style={[styles.subtitle, { color: colors.textMuted }]}
          >
            {theme}
          </Text>
        ) : null}
      </View> : null}
      {today ? (
        showAllReadings ? (
          <OpenReadingPage
            page={today}
            colors={colors}
            isDark={isDark}
            onContinue={(openingId) => onOpenDay(today.dayNumber, openingId)}
          />
        ) : (
          <ActiveSeriesBookHero
            page={today}
            book={devotional}
            colors={colors}
            isDark={isDark}
            onContinue={(openingId) => onOpenDay(today.dayNumber, openingId)}
          />
        )
      ) : null}
    </View>
  );
  const contents = chapters.length > 0 && !showAllReadings ? <ChapterJourney
    chapters={chapters}
    colors={colors}
    canOpenChapter={(chapter) => resolveBookOpenDayNumber(devotional, chapter, now) != null}
    onOpenChapter={(chapter) => {
      const dayNumber = resolveBookOpenDayNumber(devotional, chapter, now);
      if (dayNumber != null) onOpenDay(dayNumber);
    }}
  /> : <BookDayList devotional={devotional} seriesPaused={seriesPaused} now={now} colors={colors} onOpenDay={onOpenDay} />;

  return (
    <View testID="book-of-seasons">
      {openBook ? null : accessory}
      <FacingPanes
        panes={openBook}
        first={currentPage}
        second={openBook ? (
          <View testID="book-contents-page" style={styles.page}>
            {accessory}
            {contents}
          </View>
        ) : undefined}
      />
      {openBook ? null : contents}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: Spacing['6'],
  },
  accessoryRow: {
    alignItems: 'flex-end',
    minHeight: 44,
    marginBottom: Spacing['3'],
  },
  season: {
    marginBottom: Spacing['6'],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: FontFamily.display,
    fontSize: FontSize['3xl'],
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: Spacing['2'],
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
});
