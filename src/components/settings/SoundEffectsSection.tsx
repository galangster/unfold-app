import { useState } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';
import { getSoundEffectsEnabled, setSoundEffectsEnabled } from '@/lib/success-cues';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { SettingsSectionHeader, getSettingsCardStyle } from './SettingsSectionHeader';

export function SoundEffectsSection() {
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(getSoundEffectsEnabled);
  return (
    <View>
      <SettingsSectionHeader label="Sound" />
      <View style={[getSettingsCardStyle(colors), styles.row]}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>Sound effects</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            Gentle sounds for new readings and moments of completion. Quiet in Silent mode.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Sound effects"
          accessibilityHint="Plays gentle sounds when a reading appears or you complete a day"
          value={enabled}
          trackColor={{ true: colors.accent }}
          onValueChange={(next) => {
            setSoundEffectsEnabled(next);
            setEnabled(next);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing['4'], gap: Spacing['4'], minHeight: 64 },
  copy: { flex: 1 },
  title: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.base },
  description: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, lineHeight: 20, marginTop: Spacing['1'] },
});
