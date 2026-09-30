/**
 * CompanionReadingPage
 * The day's reading beside the conversation on a paired window: the
 * Companion row of the Duo design (DESIGN.md, "pinned source beside
 * conversation; history can collapse"). Read only. Selection, highlights and
 * sharing stay in the reader.
 */

import React, { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { DayPassage } from '@/components/reading/DayPassage';
import { ReaderText } from '@/components/reading/ReaderText';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { READER_PAGE_PADDING } from '@/lib/adaptive-layout';
import { FONT_SIZE_VALUES, useUnfoldStore, type DevotionalDay } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';

// The reader's body measure and section headers (DevotionalWebView), in lines
// of body leading: 1.75 leading, just under one line between paragraphs, and a
// header at 0.85 of the body size with 1.2 lines above it and 0.4 below.
const BODY_LEADING = 1.75;
const PARAGRAPH_GAP = 0.95;
const HEADER_SCALE = 0.85;
const HEADER_GAP_ABOVE = 1.2;
const HEADER_GAP_BELOW = 0.4;

type BodyBlock = { text: string; header: boolean };

/**
 * The reflection as plain blocks: blank lines split them and `---` dividers
 * drop. A paragraph that is all bold is a practice section header, as in the
 * reader; other `*` / `**` emphasis keeps only its words.
 */
function bodyBlocks(bodyText: string | undefined): BodyBlock[] {
  return (bodyText ?? '')
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !/^-{3,}$/.test(paragraph))
    .map((paragraph) => {
      const header = /^\*\*([^*]+)\*\*$/.exec(paragraph);
      return header
        ? { text: header[1], header: true }
        : { text: paragraph.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1'), header: false };
    });
}

interface CompanionReadingPageProps {
  day: DevotionalDay;
}

export const CompanionReadingPage = memo(function CompanionReadingPage({ day }: CompanionReadingPageProps) {
  const { colors } = useTheme();
  const readingFont = useReadingFont();
  const fontSize = useUnfoldStore((s) => s.user?.fontSize ?? 'medium');
  const bodySize = FONT_SIZE_VALUES[fontSize].body;
  const bodyLineHeight = Math.round(bodySize * BODY_LEADING);
  const paragraphStyle = {
    fontFamily: readingFont.body,
    fontSize: bodySize,
    lineHeight: bodyLineHeight,
    color: colors.text,
    marginBottom: Math.round(bodyLineHeight * PARAGRAPH_GAP),
  };
  const headerStyle = {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: Math.round(bodySize * HEADER_SCALE),
    color: colors.textMuted,
    // The paragraph above already leaves PARAGRAPH_GAP.
    marginTop: Math.round(bodyLineHeight * (HEADER_GAP_ABOVE - PARAGRAPH_GAP)),
    marginBottom: Math.round(bodyLineHeight * HEADER_GAP_BELOW),
  };

  return (
    <ScrollView
      testID="companion-reading-page"
      style={styles.fill}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <DayPassage day={day} />
      <View style={styles.body}>
        {bodyBlocks(day.bodyText).map((block, index) => (
          <ReaderText
            key={index}
            accessibilityRole={block.header ? 'header' : undefined}
            style={block.header ? headerStyle : paragraphStyle}
          >
            {block.text}
          </ReaderText>
        ))}
      </View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: READER_PAGE_PADDING,
    paddingTop: Spacing['6'],
    paddingBottom: Spacing['10'],
  },
  body: { marginTop: Spacing['8'] },
});
