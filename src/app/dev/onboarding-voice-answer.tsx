import React, { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VoiceAnswerButton } from '@/components/onboarding/VoiceAnswerButton';
import {
  OnboardingVoiceAnswerSheet,
  type OnboardingVoiceAnswerPhase,
} from '@/components/onboarding/OnboardingVoiceAnswerSheet';
import { alpha } from '@/components/ui';
import { DarkColors, createThemedColors } from '@/constants/colors';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { goBackOr } from '@/lib/navigation';

const PHASES: OnboardingVoiceAnswerPhase[] = ['idle', 'recording', 'review', 'transcribing', 'transcript', 'error'];
const OVER_LIMIT_TRANSCRIPT = `${'I want a quieter morning and more room to notice what is already good. '.repeat(40)}`;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function OnboardingVoiceAnswerPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ state?: string | string[]; existing?: string | string[] }>();
  const routePhase = firstParam(params.state);
  const existingPreset = firstParam(params.existing);
  const initialPhase = PHASES.includes(routePhase as OnboardingVoiceAnswerPhase)
    ? routePhase as OnboardingVoiceAnswerPhase
    : 'review';
  const [phase, setPhase] = useState<OnboardingVoiceAnswerPhase>(initialPhase);
  const [sheetVisible, setSheetVisible] = useState(true);
  const [accepted, setAccepted] = useState<string | null>(null);
  const colors = createThemedColors(DarkColors, DarkColors.accent);
  const existingText = existingPreset === 'typed'
    ? 'I am a dad, and I have been tired lately.'
    : '';
  const demoTranscript = existingPreset === 'overLimit' ? OVER_LIMIT_TRANSCRIPT : undefined;
  const previewKey = `${phase}-${existingPreset ?? 'empty'}`;

  useEffect(() => {
    if (routePhase && PHASES.includes(routePhase as OnboardingVoiceAnswerPhase)) {
      setPhase(routePhase as OnboardingVoiceAnswerPhase);
      setSheetVisible(true);
    }
  }, [existingPreset, routePhase]);

  if (!isQaToolsEnabled()) {
    return <Redirect href="/(tabs)/(today)" />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.devHeader}>
            <View>
              <Text style={[styles.devKicker, { color: colors.accent }]}>DEVELOPMENT PREVIEW</Text>
              <Text style={[styles.devTitle, { color: colors.text }]}>Onboarding voice answer</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Close prototype route"
              onPress={() => goBackOr(router, '/(tabs)/(today)')}
              style={[styles.routeClose, { borderColor: colors.border }]}
            >
              <Text style={[styles.routeCloseText, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push('/onboarding?startAt=aboutMe')}
            style={[styles.routeClose, { borderColor: colors.border }]}
          >
            <Text style={[styles.routeCloseText, { color: colors.textMuted }]}>Open About me onboarding</Text>
          </TouchableOpacity>

          <View style={styles.controlGroup}>
            <Text style={[styles.controlLabel, { color: colors.textMuted }]}>STATE · MICROPHONE OFF</Text>
            <View style={styles.phaseRow}>
              {PHASES.map((item) => {
                const active = item === phase;
                return (
                  <TouchableOpacity
                    key={item}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => { setPhase(item); setSheetVisible(true); }}
                    style={[
                      styles.phaseChip,
                      { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? alpha(colors.accent, 0.1) : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.phaseText, { color: active ? colors.text : colors.textMuted }]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.fieldCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
            <Text style={[styles.fieldEyebrow, { color: colors.textMuted }]}>ABOUT ME</Text>
            <Text style={[styles.fieldTitle, { color: colors.text }]}>Tell me about yourself.</Text>
            <Text style={[styles.fieldBody, { color: colors.textMuted }]}>
              {accepted ?? (existingText || 'Typed answer stays here until Use this answer.')}
            </Text>
            <VoiceAnswerButton key={sheetVisible ? 'open' : 'closed'} colors={colors} onPress={() => setSheetVisible(true)} />
          </View>
        </ScrollView>
      </SafeAreaView>

      <OnboardingVoiceAnswerSheet
        key={previewKey}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        existingText={existingText}
        onAccept={(text) => { setAccepted(text); setSheetVisible(false); }}
        demoMode
        initialDemoPhase={phase}
        demoTranscript={demoTranscript}
        previewColors={colors}
        previewIsDark
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'], paddingBottom: 160, gap: Spacing['5'] },
  devHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  devKicker: { fontFamily: FontFamily.uiSemiBold, fontSize: 10, letterSpacing: 1.3, marginBottom: 4 },
  devTitle: { fontFamily: FontFamily.display, fontSize: FontSize['3xl'] },
  routeClose: { minHeight: 44, paddingHorizontal: Spacing['4'], borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  routeCloseText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm },
  controlGroup: { gap: Spacing['2'] },
  controlLabel: { fontFamily: FontFamily.uiSemiBold, fontSize: 10, letterSpacing: 1.1 },
  phaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'] },
  phaseChip: { minHeight: 36, paddingHorizontal: Spacing['3'], borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  phaseText: { fontFamily: FontFamily.uiMedium, fontSize: 11, textTransform: 'capitalize' },
  fieldCard: { borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['5'], gap: Spacing['3'] },
  fieldEyebrow: { fontFamily: FontFamily.uiSemiBold, fontSize: 10, letterSpacing: 1.1 },
  fieldTitle: { fontFamily: FontFamily.display, fontSize: 27, lineHeight: 33 },
  fieldBody: { fontFamily: FontFamily.body, fontSize: FontSize.sm, lineHeight: 22 },
});
