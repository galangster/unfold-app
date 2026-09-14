import { StyleSheet, View } from 'react-native';

import { ReaderText as Text } from './ReaderText';

import { SunIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';

interface TomorrowPreviewProps {
  title: string;
  teaser: string;
  colors: {
    accent: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

function previewExcerpt(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 240) return normalized;
  const excerpt = normalized.slice(0, 240);
  const boundary = excerpt.lastIndexOf(' ');
  return `${excerpt.slice(0, boundary > 0 ? boundary : 240).trimEnd()}…`;
}

export function TomorrowPreview({ title, teaser, colors }: TomorrowPreviewProps) {
  return (
    <View testID="tomorrow-preview" style={styles.root}>
      <View
        testID="tomorrow-divider"
        style={[styles.divider, { borderBottomColor: colors.border }]}
      />
      <View testID="tomorrow-label-row" style={styles.labelRow}>
        <View testID="tomorrow-sun" accessible={false} pointerEvents="none">
          <SunIcon size={12} color={colors.accent} weight="light" />
        </View>
        <Text
          testID="tomorrow-label"
          style={[styles.label, { color: colors.textMuted }]}
        >
          Tomorrow
        </Text>
      </View>
      <Text
        textBreakStrategy="highQuality"
        lineBreakStrategyIOS="standard"
        testID="tomorrow-title"
        style={[styles.title, { color: colors.text }]}
      >
        {title}
      </Text>
      <Text
        testID="tomorrow-teaser"
        style={[styles.teaser, { color: colors.textMuted }]}
      >
        {previewExcerpt(teaser)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: Spacing['8'],
    alignItems: 'stretch',
  },
  divider: {
    // A whole-point box prevents fractional layout from clipping the last text line.
    height: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing['5'],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing['1'],
    marginBottom: Spacing['2'],
  },
  label: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    textAlign: 'left',
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    lineHeight: 23,
    marginBottom: Spacing['2'],
    textAlign: 'left',
  },
  teaser: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
    textAlign: 'left',
  },
});
