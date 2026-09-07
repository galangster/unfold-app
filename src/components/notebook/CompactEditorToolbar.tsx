import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { BookBookmarkIcon, TextAaIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';

export function CompactEditorToolbar({
  onOpenFormatting,
  onInsertScripture,
  formattingExpanded = false,
}: {
  onOpenFormatting: () => void;
  onInsertScripture: () => void;
  formattingExpanded?: boolean;
}) {
  const { colors } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const stackActions = fontScale >= 1.3 || width < 360;

  return (
    <View
      testID="compact-editor-toolbar"
      style={[
        styles.container,
        { backgroundColor: colors.backgroundElevated, borderColor: colors.border },
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={formattingExpanded ? 'Close formatting' : 'Formatting'}
        accessibilityState={{ expanded: formattingExpanded }}
        activeOpacity={0.65}
        onPress={onOpenFormatting}
        style={[styles.action, stackActions && styles.actionStacked]}
      >
        <TextAaIcon size={21} color={colors.accent} weight="light" />
        <Text style={[styles.label, { color: colors.text }]}>Formatting</Text>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Insert Scripture"
        activeOpacity={0.65}
        onPress={onInsertScripture}
        style={[styles.action, stackActions && styles.actionStacked]}
      >
        <BookBookmarkIcon size={20} color={colors.accent} weight="light" />
        <Text style={[styles.label, { color: colors.text }]}>Insert Scripture</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    marginHorizontal: Spacing['3'],
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: Spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  actionStacked: {
    flexDirection: 'column',
    paddingVertical: Spacing['1.5'],
    gap: Spacing['1'],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: Spacing['2'],
  },
  label: {
    flexShrink: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
