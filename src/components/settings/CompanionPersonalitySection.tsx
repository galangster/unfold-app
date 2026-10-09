import { Text, View, StyleSheet } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { COMPANION_PERSONALITIES, resolveCompanionPersonality } from '@/lib/companion-personality';
import { SettingsSectionHeader, getSettingsCardStyle } from './SettingsSectionHeader';

export function CompanionPersonalitySection() {
  const { colors } = useTheme();
  const user = useUnfoldStore((state) => state.user);
  const updateUser = useUnfoldStore((state) => state.updateUser);
  const stored = user?.companionPersonality;
  const selected = resolveCompanionPersonality(stored);

  return (
    <>
      <SettingsSectionHeader label="Companion" />
      <Text style={[styles.description, { color: colors.textMuted }]}>
        Choose how your Companion talks with you. Change it anytime. Your devotional writing stays the same.
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Companion personality" style={getSettingsCardStyle(colors)}>
        {COMPANION_PERSONALITIES.map((option, index) => (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            accessibilityState={{ checked: selected === option.value, disabled: !user }}
            disabled={!user}
            activeOpacity={0.7}
            onPress={() => {
              if (stored === option.value) return;
              void Haptics.selectionAsync();
              updateUser({ companionPersonality: option.value });
            }}
            style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          >
            <View style={styles.copy}>
              <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
              <Text style={[styles.optionDescription, { color: colors.textMuted }]}>{option.description}</Text>
            </View>
            <View accessible={false} style={[styles.radio, { borderColor: selected === option.value ? colors.accent : colors.textMuted }]}>
              {selected === option.value && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  description: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, marginBottom: Spacing['3'] },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, padding: Spacing['4'], gap: Spacing['3'] },
  copy: { flex: 1, minWidth: 0 },
  label: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.base },
  optionDescription: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, marginTop: Spacing['1'] },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
