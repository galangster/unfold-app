import { useCallback, useRef, type RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { ReaderText as Text } from './ReaderText';
import { InlineReflectionJournal } from './InlineReflectionJournal';
import type { ReflectionKeyboardToolbarState } from './ReflectionQuestionNav';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { ADAPTIVE_READABLE_MEASURE, adaptiveFrameStyle } from '@/lib/adaptive-layout';
import type { FontSize } from '@/lib/store';
import { useTheme } from '@/lib/theme';

/** Horizontal padding of a reader page, shared with the reading column. */
export const READER_PAGE_PADDING = Spacing['6'];
/** Room kept above a focused answer so its question stays in view. */
const FOCUS_TOP_INSET = Spacing['16'];

interface ReflectionFacingPageProps {
  /** The day's questions. None leaves a quiet page with the day's line. */
  questions: string[];
  devotionalId: string;
  dayNumber: number;
  dayTitle?: string;
  /** Shown as an epigraph when the day has no questions. */
  quotableLine?: string;
  fontSize: FontSize;
  onOpenFullJournal: (focusQuestion?: number) => void;
  onKeyboardToolbarChange?: (toolbar: ReflectionKeyboardToolbarState | null) => void;
  initialExpandedIndex?: number | null;
  onExpandedIndexChange?: (index: number | null) => void;
  /** False on a pane handoff, so the questions do not replay their entrance. */
  animateEntrance?: boolean;
  /** Lets the reader scroll this page, for example from the Contents sheet. */
  scrollViewRef: RefObject<ScrollView | null>;
  /** Clearance below the last question for the tab bar and home indicator. */
  bottomInset: number;
}

/**
 * The reflection desk: the day's questions and the response on their own page,
 * facing the reading. It scrolls on its own, so writing never moves the
 * reading, and it hosts the only InlineReflectionJournal while it is shown.
 * A day without questions keeps the page, quiet: the running head and the
 * day's line.
 */
export function ReflectionFacingPage({
  questions,
  devotionalId,
  dayNumber,
  dayTitle,
  quotableLine,
  fontSize,
  onOpenFullJournal,
  onKeyboardToolbarChange,
  initialExpandedIndex,
  onExpandedIndexChange,
  animateEntrance,
  scrollViewRef,
  bottomInset,
}: ReflectionFacingPageProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const contentRef = useRef<View | null>(null);

  const handleFocusInput = useCallback((contentY: number) => {
    scrollViewRef.current?.scrollTo({ y: Math.max(0, contentY - FOCUS_TOP_INSET), animated: !reducedMotion });
  }, [reducedMotion, scrollViewRef]);

  return (
    <ScrollView
      ref={scrollViewRef}
      testID="reflection-facing-page"
      style={styles.fill}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + Spacing['16'] }]}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <View ref={contentRef} collapsable={false} style={adaptiveFrameStyle(ADAPTIVE_READABLE_MEASURE)}>
        {dayTitle ? (
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.runningHead, { color: colors.textMuted }]}
          >
            {`Day ${dayNumber} · ${dayTitle}`}
          </Text>
        ) : null}
        {questions.length > 0 ? (
          <InlineReflectionJournal
            questions={questions}
            devotionalId={devotionalId}
            dayNumber={dayNumber}
            onOpenFullJournal={onOpenFullJournal}
            fontSize={fontSize}
            scrollContentRef={contentRef}
            onFocusInput={handleFocusInput}
            onKeyboardToolbarChange={onKeyboardToolbarChange}
            initialExpandedIndex={initialExpandedIndex}
            onExpandedIndexChange={onExpandedIndexChange}
            animateEntrance={animateEntrance}
          />
        ) : quotableLine ? (
          <Text testID="reflection-facing-epigraph" style={[styles.epigraph, { color: colors.textMuted }]}>
            {quotableLine}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: READER_PAGE_PADDING, paddingTop: Spacing['10'] },
  runningHead: { ...Typography.cardMeta, marginBottom: Spacing['6'] },
  epigraph: { ...Typography.displayMd },
});
