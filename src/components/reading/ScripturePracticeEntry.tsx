import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { BookOpenIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme';

interface ScripturePracticeEntryProps {
  reference: string;
  onBegin: () => void;
}

export function ScripturePracticeEntry({ reference, onBegin }: ScripturePracticeEntryProps) {
  const { colors } = useTheme();
  const passage = reference.trim() || 'the assigned passage';

  return (
    <View
      style={styles.wrap}
      testID="scripture-practice-entry"
      accessibilityRole="summary"
    >
      <Text style={[styles.kicker, { color: colors.accent }]}>
        Begin with Scripture
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {`If you have a Bible, read ${passage} there first. You can also read in Unfold. This practice is optional, and your notes stay on this device.`}
      </Text>
      <TouchableOpacity
        onPress={onBegin}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Begin with Scripture. Read ${passage} first.`}
        testID="scripture-practice-begin"
        style={[styles.button, { backgroundColor: colors.accent }]}
      >
        <BookOpenIcon size={18} color={colors.background} weight="light" />
        <Text style={[styles.buttonLabel, { color: colors.background }]}>
          Begin with Scripture
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: Spacing['6'],
    marginBottom: Spacing['2'],
    gap: Spacing['3'],
  },
  kicker: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.2,
  },
  body: {
    ...Typography.bodyMd,
    lineHeight: 24,
  },
  button: {
    minHeight: 44,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    alignSelf: 'flex-start',
  },
  buttonLabel: {
    ...Typography.uiLg,
  },
});
