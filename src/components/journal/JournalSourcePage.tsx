import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ReaderText as Text } from '@/components/reading/ReaderText';
import { DayPassage } from '@/components/reading/DayPassage';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { ADAPTIVE_READABLE_MEASURE, READER_PAGE_PADDING, adaptiveFrameStyle } from '@/lib/adaptive-layout';
import type { DevotionalDay } from '@/lib/store';
import { useTheme } from '@/lib/theme';

interface JournalSourcePageProps {
  day: Pick<DevotionalDay, 'dayNumber' | 'title' | 'scriptureReference' | 'scriptureText' | 'quotableLine'>;
  /** Clearance below the last line for the home indicator. */
  bottomInset: number;
}

/**
 * The source page of the journal writing desk: the day the person is writing
 * from, in the reader's typography. It faces the draft on a paired window and
 * scrolls on its own, so reading it never moves the draft.
 */
export const JournalSourcePage = memo(function JournalSourcePage({ day, bottomInset }: JournalSourcePageProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      testID="journal-source-page"
      style={styles.fill}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + Spacing['16'] }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={adaptiveFrameStyle(ADAPTIVE_READABLE_MEASURE)}>
        <DayPassage day={day} />
        {day.quotableLine ? (
          <Text testID="journal-source-line" style={[styles.line, { color: colors.textMuted }]}>
            {day.quotableLine}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: READER_PAGE_PADDING, paddingTop: Spacing['10'] },
  line: { ...Typography.displayMd, marginTop: Spacing['10'] },
});
