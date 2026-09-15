import { useRef } from 'react';
import { TouchableOpacity, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { bookActionLabel, bookDayCaption, bookPlaceLine, heroBookSize, type BookOpeningCover } from '@/lib/book-opening';
import { useBookPageOpening } from './useBookPageOpening';
import { bookPageColors } from './book-page-colors';
import { SeriesBookCover } from '@/components/bookshelf/SeriesBookCover';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import type { BookTodayPage } from '@/lib/book-of-seasons';
import type { ColorTheme } from '@/constants/colors';

export function ActiveSeriesBookHero({
  page,
  book,
  colors,
  isDark,
  onContinue,
}: {
  page: BookTodayPage;
  book: BookOpeningCover;
  colors: ColorTheme;
  isDark: boolean;
  onContinue: (openingId?: string) => void;
}) {
  const pageRef = useRef<View>(null);
  const coverRef = useRef<View>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const size = heroBookSize(width, height, fontScale);
  const opening = useBookPageOpening({ pageRef, coverRef, page, colors, isDark, onContinue, cover: book });
  const paper = bookPageColors(colors, isDark);
  const previewScale = size.width / 256;
  const interiorCaptionStyle = [styles.interiorCaption, { color: paper.muted, fontSize: 12 * previewScale, lineHeight: 18 * previewScale }];
  const actionLabel = bookActionLabel(page.action);
  const statusLine = bookPlaceLine(page);

  return (
    <View testID="active-series-book" accessibilityLabel="Your current reading" style={styles.hero}>
      {/* The canvas covers this source atomically with its book and backdrop. */}
      <View style={styles.coverWrap}>
        <GestureDetector gesture={opening.gesture}>
          <TouchableOpacity
            testID="active-series-cover"
            accessibilityRole="button"
            accessibilityLabel={`${book.title}. ${actionLabel ?? 'Reading is being prepared'}`}
            accessibilityHint="Opens this reading. You can also swipe the book to the left."
            accessibilityState={{ disabled: !page.canOpen }}
            onPress={page.canOpen ? opening.open : undefined}
            disabled={!page.canOpen}
            activeOpacity={0.96}
          >
            <View
              onLayout={(event) => opening.onLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
              style={{ width: size.width, height: size.height }}
            >
              <View ref={pageRef} testID="book-interior-capture" cssInterop={false} collapsable={false}
                accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={[StyleSheet.absoluteFill, styles.interior, { backgroundColor: paper.surface, padding: 24 * previewScale, gap: 16 * previewScale }]}>
                <Text allowFontScaling={false} style={interiorCaptionStyle}>{bookDayCaption(page)}</Text>
                <Text allowFontScaling={false} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.6}
                  style={[styles.interiorTitle, { color: paper.ink, fontSize: 29 * previewScale, lineHeight: 34 * previewScale }]}>{page.title}</Text>
                {page.invitation ? <Text allowFontScaling={false} numberOfLines={4} style={interiorCaptionStyle}>{page.invitation}</Text> : null}
                {page.scriptureReference ? <Text allowFontScaling={false} style={[interiorCaptionStyle, { color: paper.accent }]}>{page.scriptureReference}</Text> : null}
              </View>
              <View ref={coverRef} testID="book-cover-capture" cssInterop={false} collapsable={false}>
                <SeriesBookCover devotional={book} width={size.width} height={size.height} />
              </View>
            </View>
          </TouchableOpacity>
        </GestureDetector>
      </View>
      <Text style={[styles.caption, { color: colors.textMuted }]}>{bookDayCaption(page)}</Text>
      {page.chapterName ? <Text style={[styles.chapter, { color: colors.textMuted }]}>{page.chapterName}</Text> : null}
      {page.title ? <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{page.title}</Text> : null}
      {page.invitation ? <Text style={[styles.invitation, { color: colors.textMuted }]}>{page.invitation}</Text> : null}
      {actionLabel && page.canOpen ? (
        <TouchableOpacity
          testID="book-continue-reading"
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={statusLine}
          onPress={opening.open}
          activeOpacity={0.85}
          style={styles.continue}
        >
          <Text style={[styles.continueLabel, { color: colors.text, textDecorationColor: colors.accent }]}>{actionLabel}</Text>
          {statusLine ? <Text style={[styles.status, { color: colors.textMuted }]}>{statusLine}</Text> : null}
        </TouchableOpacity>
      ) : null}
      {(!actionLabel || !page.canOpen) && statusLine ? (
        <Text style={[styles.status, { color: colors.textMuted }]}>{statusLine}</Text>
      ) : null}
      {opening.showHint && actionLabel && page.canOpen ? (
        <Text style={[styles.hint, { color: colors.textMuted }]} pointerEvents="none">
          Swipe left to open
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  interior: { justifyContent: 'center', borderRadius: 3, overflow: 'hidden' },
  interiorCaption: { fontFamily: FontFamily.body },
  interiorTitle: { fontFamily: FontFamily.display, flexShrink: 1 },
  hero: {
    marginBottom: Spacing['8'],
  },
  coverWrap: {
    alignSelf: 'center',
    marginBottom: Spacing['6'],
  },
  caption: {
    ...Typography.cardMeta,
    fontVariant: ['tabular-nums'],
    marginBottom: Spacing['2'],
  },
  chapter: {
    ...Typography.cardMeta,
    marginBottom: Spacing['2'],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['3xl'],
    lineHeight: 36,
    letterSpacing: -0.3,
    marginBottom: Spacing['2'],
  },
  invitation: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
    maxWidth: 280,
    marginBottom: Spacing['2'],
  },
  continue: {
    minHeight: 44,
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  continueLabel: {
    fontFamily: FontFamily.display,
    fontSize: FontSize.xl,
    lineHeight: 29,
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  status: {
    marginTop: Spacing['1.5'],
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: 16,
  },
  hint: {
    marginTop: Spacing['2'],
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: 15,
  },
});
