import { View, Text } from 'react-native';
import type { ViewStyle } from 'react-native';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme';

/** Section label rendered above each grouped settings card. */
export function SettingsSectionHeader({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View>
      <Text
        style={{
          ...Typography.sectionHeader,
          color: colors.text,
          marginBottom: Spacing['3'],
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Grouped-card chrome shared by the settings section cards. */
export function getSettingsCardStyle(colors: { inputBackground: string; border: string }): ViewStyle {
  return {
    backgroundColor: colors.inputBackground,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing['6'],
  };
}
