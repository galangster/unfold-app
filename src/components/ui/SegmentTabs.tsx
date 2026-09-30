import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';

export type SegmentTab<T extends string> = { id: T; label: string };

interface SegmentTabsProps<T extends string> {
  tabs: readonly SegmentTab<T>[];
  value: T;
  onChange: (id: T) => void;
  testID?: string;
}

/**
 * Tabs on a hairline rule, the selected one underlined in accent, as the
 * Journal hub draws its segments. Labels wrap to a second line at large text
 * sizes instead of being cut.
 */
function SegmentTabsRow<T extends string>({ tabs, value, onChange, testID }: SegmentTabsProps<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" testID={testID} style={[styles.row, { borderBottomColor: colors.border }]}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => {
              if (selected) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(tab.id);
            }}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tab.label} tab, ${index + 1} of ${tabs.length}`}
            style={[styles.tab, { borderBottomColor: selected ? colors.accent : 'transparent' }]}
          >
            <Text numberOfLines={2} style={[styles.label, { color: selected ? colors.text : colors.textMuted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const SegmentTabs = memo(SegmentTabsRow) as typeof SegmentTabsRow;

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2'],
    borderBottomWidth: 2,
  },
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
});
