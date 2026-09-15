import { useRef } from 'react';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { bookDayCaption } from '@/lib/book-opening';
import { useBookPageOpening } from './useBookPageOpening';
import { TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { LinearGradient as PageGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import type { BookTodayPage } from '@/lib/book-of-seasons';
import { bookPageColors, type BookPageColors } from './book-page-colors';
import type { ColorTheme } from '@/constants/colors';

const ACTION_LABEL: Record<Exclude<BookTodayPage['action'], null>, string> = {
  continue: 'Continue reading',
  'read-again': 'Read again',
};

function placeLine(page: BookTodayPage): string | undefined {
  if (page.seriesComplete) return 'You can return to any page.';
  if (page.completedToday) return 'Your next reading will be here tomorrow.';
  if (!page.contentReady) return 'This page is still being prepared.';
  return undefined;
}

function PageEngraving({ color }: { color: string }) {
  return (
    <View style={styles.engraving} pointerEvents="none" accessibilityElementsHidden>
      <Svg viewBox="0 0 248 78" width="100%" height="70">
        <Defs>
          <RadialGradient id="book-dawn-glow"><Stop stopColor={color} stopOpacity={0.3} /><Stop offset="1" stopColor={color} stopOpacity={0} /></RadialGradient>
          <LinearGradient id="book-dawn-horizon"><Stop stopColor={color} stopOpacity={0} /><Stop offset="0.5" stopColor={color} stopOpacity={0.75} /><Stop offset="1" stopColor={color} stopOpacity={0} /></LinearGradient>
        </Defs>
        <Ellipse cx="124" cy="47" rx="47" ry="29" fill="url(#book-dawn-glow)" />
        <Path d="M105 51a19 19 0 0 1 38 0M124 20v4M99 29l3 3M149 29l-3 3" stroke={color} strokeWidth="0.7" fill="none" />
        <Path d="M30 52h188" stroke="url(#book-dawn-horizon)" strokeWidth="0.7" />
        <Path d="M103 59q21 2 42 0" stroke={color} strokeWidth="0.7" strokeOpacity={0.2} fill="none" />
      </Svg>
    </View>
  );
}

function PageTurnCorner({ page }: { page: BookPageColors }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden style={styles.turnCorner}>
      <Svg viewBox="0 0 64 64" width={59} height={59}>
        <Defs>
          <LinearGradient id="book-page-fold" x1="0" y1="0" x2="1" y2="1">
            <Stop stopColor={page.light} /><Stop offset="0.7" stopColor={page.fold} /><Stop offset="1" stopColor={page.rim} />
          </LinearGradient>
        </Defs>
        <Path d="M0 64Q43 55 64 0V64Z" fill="#000" opacity={0.12} />
        <Path d="M0 64Q42 57 64 0Q61 61 0 64Z" fill="url(#book-page-fold)" />
      </Svg>
    </View>
  );
}

export function OpenReadingPage({
  page,
  colors,
  isDark,
  onContinue,
}: {
  page: BookTodayPage;
  colors: ColorTheme;
  isDark: boolean;
  onContinue: (openingId?: string) => void;
}) {
  const pageRef = useRef<View>(null);
  const opening = useBookPageOpening({ pageRef, page, colors, isDark, onContinue });
  const paper = bookPageColors(colors, isDark);
  const actionLabel = page.action ? ACTION_LABEL[page.action] : null;
  const statusLine = placeLine(page);

  return (
    <View style={styles.book} accessibilityLabel="Your current reading">
      <Animated.View style={[styles.frame, { borderColor: paper.rim, opacity: opening.hidden ? 0 : 1 }, opening.sourceStyle]}>
      <View
        ref={pageRef}
        testID="book-page-capture"
        cssInterop={false}
        collapsable={false}
        onLayout={(event) => opening.onLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
        style={[
          styles.page,
          {
            backgroundColor: paper.surface,
          },
        ]}
      >
        <PageGradient
          colors={[paper.light, `${paper.light}00`]}
          start={{ x: 0.6, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={styles.pageWash}
          pointerEvents="none"
        />
        <View style={[styles.gutter, { backgroundColor: paper.rule }]} pointerEvents="none" />
        <PageEngraving color={paper.accent} />
        <Text style={[styles.caption, { color: paper.muted }]}>
          {bookDayCaption(page)}
        </Text>
        {page.chapterName ? <Text style={[styles.chapter, { color: paper.muted }]}>{page.chapterName}</Text> : null}
        {page.title ? (
          <Text style={[styles.title, { color: paper.ink }]}>{page.title}</Text>
        ) : null}
        {page.invitation ? (
          <Text style={[styles.invitation, { color: paper.muted }]}>
            {page.invitation}
          </Text>
        ) : null}
        {page.scriptureReference ? (
          <Text style={[styles.meta, { color: paper.muted }]}>
            {page.scriptureReference}
          </Text>
        ) : null}
        {actionLabel && page.canOpen ? (
          <TouchableOpacity
            testID="book-continue-reading"
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityHint={statusLine}
            onPress={opening.open}
            activeOpacity={1}
            style={styles.readingTurn}
          >
            <View style={styles.turnLine}>
              <Text style={[styles.turnLabel, { color: paper.ink, textDecorationColor: paper.accent }]}>{actionLabel}</Text>

            </View>
            {statusLine ? <Text style={[styles.savedPlace, { color: paper.muted }]}>{statusLine}</Text> : null}
          </TouchableOpacity>
        ) : null}
        {(!actionLabel || !page.canOpen) && statusLine ? <Text style={[styles.place, { color: paper.muted }]}>{statusLine}</Text> : null}
      </View>
        {actionLabel && page.canOpen ? (
          <>
            {opening.showHint ? <Text style={[styles.hint, { color: paper.muted }]} pointerEvents="none">Tap or drag the corner to read</Text> : null}
            <GestureDetector gesture={opening.gesture}>
              <TouchableOpacity
                testID="book-page-corner"
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
                accessibilityHint="Opens this reading. You can also drag this corner to the left."
                onPress={opening.open}
                activeOpacity={0.85}
                style={styles.cornerButton}
              >
                <PageTurnCorner page={paper} />
              </TouchableOpacity>
            </GestureDetector>
          </>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  book: {
    position: 'relative',
    marginLeft: Spacing['1'],
    marginBottom: Spacing['8'],
  },
  frame: {
    overflow: 'hidden',
    borderRadius: 3,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
  },
  page: {
    position: 'relative',
    paddingTop: Spacing['5'],
    paddingRight: Spacing['5'],
    paddingBottom: Spacing['3.5'],
    paddingLeft: Spacing['6'],
  },
  pageWash: {
    ...StyleSheet.absoluteFill,
  },
  gutter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 7,
    width: 1,
    opacity: 0.65,
  },
  engraving: {
    height: 70,
    marginBottom: Spacing['3'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    ...Typography.cardMeta,
    fontVariant: ['tabular-nums'],
    marginBottom: Spacing['2'],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['4xl'],
    lineHeight: 40,
    letterSpacing: -0.4,
    marginBottom: Spacing['2'],
  },
  invitation: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 22,
    maxWidth: 280,
  },
  meta: {
    ...Typography.cardMeta,
    marginTop: Spacing['4'],
    marginBottom: Spacing['4'],
  },
  readingTurn: {
    position: 'relative',
    marginLeft: -Spacing['6'],
    marginRight: -Spacing['5'],
    marginBottom: -Spacing['3.5'],
    paddingLeft: Spacing['6'],
    paddingRight: Spacing['5'],
    paddingBottom: 44,
    minHeight: 92,
  },
  turnLine: {
    minHeight: 58,
    paddingRight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing['4'],
  },
  turnLabel: {
    fontFamily: FontFamily.display,
    fontSize: FontSize.xl,
    lineHeight: 29,
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
    flex: 1,
    flexShrink: 1,
  },
  savedPlace: {
    paddingRight: 62,
    fontFamily: FontFamily.ui,
    fontSize: 10,
    lineHeight: 14,
  },
  chapter: { ...Typography.cardMeta, marginBottom: Spacing['2'] },
  hint: { position: 'absolute', left: 24, right: 78, bottom: 12, fontFamily: FontFamily.ui, fontSize: 11, lineHeight: 15 },
  cornerButton: { position: 'absolute', right: 0, bottom: 0, width: 76, height: 76 },
  turnCorner: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 59,
    height: 59,
  },
  place: {
    marginTop: Spacing['2.5'],
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
