import { StyleSheet } from 'react-native';
import { ReaderText as Text } from '@/components/reading/ReaderText';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useReaderScripture } from '@/hooks/useReaderScripture';
import { preventOrphan, stripOuterQuotes } from '@/lib/cn';
import { FONT_SIZE_VALUES, useUnfoldStore, type DevotionalDay } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';

// DevotionalContent's scripture leading.
const SCRIPTURE_LEADING = 1.75;

interface DayPassageProps {
  day: Pick<DevotionalDay, 'dayNumber' | 'title' | 'scriptureReference' | 'scriptureText'>;
}

/**
 * The head of a page that faces writing or conversation: the running head,
 * then the day's reference and passage, set and worded as the reader shows
 * them.
 */
export function DayPassage({ day }: DayPassageProps) {
  const { colors, isDark } = useTheme();
  const readingFont = useReadingFont();
  const fontSize = useUnfoldStore((s) => s.user?.fontSize ?? 'medium');
  const scriptureSize = FONT_SIZE_VALUES[fontSize].scripture;
  const passage = useReaderScripture(day.scriptureReference, day.scriptureText);

  return (
    <>
      <Text accessibilityRole="header" numberOfLines={2} style={[styles.runningHead, { color: colors.textMuted }]}>
        {`Day ${day.dayNumber} · ${day.title}`}
      </Text>
      {day.scriptureReference ? (
        <Text style={[styles.reference, { color: colors.accent }]}>{day.scriptureReference}</Text>
      ) : null}
      {passage ? (
        <Text
          testID="day-passage-text"
          style={{
            fontFamily: readingFont.body,
            fontSize: scriptureSize,
            lineHeight: scriptureSize * SCRIPTURE_LEADING,
            color: isDark ? colors.text : colors.textMuted,
          }}
        >
          {`“${preventOrphan(stripOuterQuotes(passage))}”`}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  runningHead: { ...Typography.cardMeta, marginBottom: Spacing['6'] },
  reference: { ...Typography.cardMeta, marginBottom: Spacing['3.5'] },
});
