import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';

interface TomorrowPreviewProps {
  title: string;
  teaser: string;
  colors: {
    text: string;
    textMuted: string;
    border: string;
  };
}

export function TomorrowPreview({ title, teaser, colors }: TomorrowPreviewProps) {
  return (
    <View testID="tomorrow-preview" style={styles.root}>
      <View
        testID="tomorrow-divider"
        style={[styles.divider, { backgroundColor: colors.border }]}
      />
      <Text
        testID="tomorrow-label"
        style={[styles.label, { color: colors.textMuted }]}
      >
        Tomorrow
      </Text>
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
        {teaser}
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
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing['5'],
  },
  label: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    marginBottom: Spacing['2'],
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
