import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useRevealActivity } from '@/hooks/useRevealActivity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RevealGradientSurface } from '@/components/reveal/RevealBackdrop';
import { REVEAL_GRADIENT_VARIANTS, isRevealGradientVariant } from '@/lib/reveal-gradient-palette';
import { ACCENT_THEMES } from '@/lib/store';
import { DarkColors, LightColors } from '@/constants/colors';
import { FontFamily } from '@/constants/fonts';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { getRevealRuntimeEffect } from '@/components/reveal/reveal-gradient-shader';

export default function RevealGradientPreview() {
  const params = useLocalSearchParams<{ variant?: string; theme?: string; accent?: string; motion?: string; chrome?: string; scene?: string }>();
  const [variant, setVariant] = useState(isRevealGradientVariant(params.variant ?? '') ? params.variant! : 'prism');
  const [accentId, setAccentId] = useState(params.accent ?? 'gold');
  const [isDark, setIsDark] = useState(params.theme !== 'light');
  const [paused, setPaused] = useState(params.motion === 'off');
  const [chrome, setChrome] = useState(params.chrome !== '0');
  const [series, setSeries] = useState(params.scene !== 'daily');
  const [reading, setReading] = useState(false);
  const [compiled] = useState(() => isQaToolsEnabled()
    ? REVEAL_GRADIENT_VARIANTS.filter((family) => getRevealRuntimeEffect(family) !== null).length
    : 0);
  const focused = useRevealActivity();
  const { reducedMotion } = useAccessibleAnimation();
  const colors = isDark ? DarkColors : LightColors;
  const accent = ACCENT_THEMES.find((option) => option.id === accentId) ?? ACCENT_THEMES[0];
  const accentColor = isDark ? accent.dark : accent.light;

  if (!isQaToolsEnabled()) return <Redirect href="/" />;

  const control = (label: string, action: () => void, selected = false) => (
    <Pressable key={label} onPress={action} accessibilityRole="button"
      accessibilityState={{ selected }} accessibilityLabel={label}
      style={[styles.control, { borderColor: selected ? accentColor : colors.border }]}>
      <Text style={[styles.controlText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false, animation: 'none' }} />
      {!reading && isRevealGradientVariant(variant) && <RevealGradientSurface
        variant={variant} accent={accentColor} background={colors.background}
        isDark={isDark} active={focused} reducedMotion={reducedMotion || paused} soften={15} />}
      <SafeAreaView style={styles.root}>
        <Pressable onPress={() => setChrome(!chrome)} accessibilityRole="button" accessibilityLabel="Toggle preview controls" style={styles.previewLabel}>
          <Text style={[styles.controlText, { color: colors.textMuted }]}>Unfold · reveal study</Text>
        </Pressable>
        {chrome && <View style={styles.controls}>
          <Text style={[styles.controlText, { color: compiled === 7 ? colors.textMuted : colors.text }]}>
            {compiled}/7 shaders compiled · 15px softness
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRow}>
            {REVEAL_GRADIENT_VARIANTS.map((name) => control(name, () => { setVariant(name); setReading(false); }, variant === name))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRow}>
            {ACCENT_THEMES.map((option) => control(option.name, () => setAccentId(option.id), accentId === option.id))}
          </ScrollView>
          <View style={styles.controlRow}>
            {control(isDark ? 'Dark' : 'Light', () => setIsDark(!isDark))}
            {control(paused ? 'Still' : 'Motion', () => setPaused(!paused))}
            {control(series ? 'Series' : 'Daily', () => setSeries(!series))}
          </View>
        </View>}
        <View style={[styles.content, !series && styles.center]}>
          <Text style={[styles.eyebrow, { color: colors.text }]}>
            {reading ? 'PSALM 46:10' : series ? 'YOUR 7-DAY SERIES' : 'A LITTLE MORE STILLNESS'}
          </Text>
          <Text style={[styles.title, !series && styles.centerText, { color: colors.text }]}>
            {reading ? 'Be still, and know.' : series ? 'A little more\nstillness.' : 'Room to\nbegin again.'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {reading ? 'The reading begins here.' : series ? 'A new beginning, one day at a time.' : 'Day 3 of 7'}
          </Text>
        </View>
        <Pressable onPress={() => setReading(!reading)} accessibilityRole="button"
          accessibilityLabel={reading ? 'Replay reveal' : 'Begin reading'}
          style={[styles.begin, { backgroundColor: colors.buttonBackground }]}>
          <Text style={[styles.beginText, { color: colors.background }]}>{reading ? 'Replay reveal' : 'Begin reading'}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  previewLabel: { minHeight: 44, paddingHorizontal: 28, justifyContent: 'center' },
  controls: { gap: 6, paddingHorizontal: 20 },
  controlRow: { flexDirection: 'row', gap: 6 },
  control: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  controlText: { fontFamily: FontFamily.ui, fontSize: 12 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', padding: 32 },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  eyebrow: { fontFamily: FontFamily.ui, fontSize: 11, letterSpacing: 1.6, marginBottom: 24 },
  title: { fontFamily: FontFamily.display, fontSize: 45, lineHeight: 53, letterSpacing: -0.4 },
  subtitle: { fontFamily: FontFamily.bodyItalic, fontSize: 17, lineHeight: 24, marginTop: 24 },
  begin: { minHeight: 54, marginHorizontal: 32, marginBottom: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  beginText: { fontFamily: FontFamily.uiMedium, fontSize: 15 },
});
