import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { BookmarkSimpleIcon, CaretRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';

interface ReaderLibraryRowProps {
  label: string;
  count?: number;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function ReaderLibraryRow({
  label,
  count,
  onPress,
  accessibilityLabel,
  testID = 'reader-library-row',
}: ReaderLibraryRowProps) {
  const { colors, isDark } = useTheme();
  const backgroundColor = isDark ? 'rgba(245, 240, 235, 0.06)' : 'rgba(28, 23, 16, 0.05)';

  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.row, { backgroundColor, borderColor: colors.border }]}
      activeOpacity={0.72}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}${count != null ? `, ${count} saved` : ''}`}
      accessibilityState={{ disabled: false }}
    >
      <BookmarkSimpleIcon size={18} color={colors.text} weight="regular" />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {count != null && count > 0 ? (
        <View style={[styles.countPill, { borderColor: colors.borderStrong }]}> 
          <Text style={[styles.countText, { color: colors.textMuted }]}>{count}</Text>
        </View>
      ) : null}
      <CaretRightIcon size={14} color={colors.textSubtle} weight="regular" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['3.5'],
    paddingVertical: Spacing['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
  },
  label: {
    flex: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  countPill: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: Spacing['1.5'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
});
