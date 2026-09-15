import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RIVE_SCENE_SOURCES } from '@/components/home/AmbientArtCanvas';
import { TodayCompletionRive } from '@/components/home/TodayCompletionRive';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useTheme } from '@/lib/theme';
import { RIVE_AMBIENCE_OPTIONS, type RiveAmbience } from '@/lib/today-ambient-rive';

/**
 * Dev-only preview of one bundled completion ambience through the production
 * wrapper (same theming, same runtime). Open
 * unfold://qa-rive-ambience?scene=moon-stars-rive on a dev client, then page
 * through the rest with the buttons.
 */
export default function RiveAmbienceQaScreen() {
  const { scene } = useLocalSearchParams<{ scene?: string }>();
  const { colors, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(() => Math.max(0, RIVE_AMBIENCE_OPTIONS.indexOf(scene as RiveAmbience)));
  if (!isQaToolsEnabled()) return <Redirect href="/" />;
  const ambience = RIVE_AMBIENCE_OPTIONS[index] ?? RIVE_AMBIENCE_OPTIONS[0];
  const step = (delta: number) => setIndex((current) => (current + delta + RIVE_AMBIENCE_OPTIONS.length) % RIVE_AMBIENCE_OPTIONS.length);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TodayCompletionRive
        key={ambience}
        source={RIVE_SCENE_SOURCES[ambience]}
        active
        accentColor={colors.accent}
        backgroundColor={colors.background}
        isDark={isDark}
        width={width}
        height={height}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.chrome} pointerEvents="box-none">
        <Text accessibilityRole="header" style={[styles.label, { color: colors.textMuted }]}>Rive QA · {ambience}</Text>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => step(-1)} style={styles.button}>
            <Text style={[styles.label, { color: colors.accent }]}>Previous</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => step(1)} style={styles.button}>
            <Text style={[styles.label, { color: colors.accent }]}>Next</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: { flex: 1, justifyContent: 'space-between', padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { paddingVertical: 12, paddingHorizontal: 16 },
  label: { fontSize: 13, letterSpacing: 0.5 },
});
