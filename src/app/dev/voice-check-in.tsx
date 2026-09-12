import React, { useEffect, useState } from 'react';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MicrophoneIcon } from '@/components/icons';
import {
  VoiceCheckInSheet,
  type VoiceCheckInPhase,
} from '@/components/voice-check-in/VoiceCheckInSheet';
import { alpha } from '@/components/ui';
import { DarkColors, LightColors } from '@/constants/colors';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useGuardedBack } from '@/hooks/useGuardedBack';
import { seedVoiceCheckInDraftFromUrl } from '@/lib/voice-check-ins';

const PHASES: VoiceCheckInPhase[] = ['idle', 'recording', 'review', 'saved', 'error'];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function VoiceCheckInPrototypeScreen() {
  const router = useRouter();
  const guardedBack = useGuardedBack();
  const params = useLocalSearchParams<{ state?: string | string[]; theme?: string | string[]; transport?: string | string[]; fixtureUrl?: string | string[] }>();
  const routePhase = firstParam(params.state);
  const routeTheme = firstParam(params.theme);
  const fixtureUrl = firstParam(params.fixtureUrl);
  const usesRealTransport = firstParam(params.transport) === 'real';
  const initialPhase = PHASES.includes(routePhase as VoiceCheckInPhase)
    ? routePhase as VoiceCheckInPhase
    : 'review';
  const [phase, setPhase] = useState<VoiceCheckInPhase>(initialPhase);
  const [isDark, setIsDark] = useState(routeTheme !== 'light');
  const [sheetVisible, setSheetVisible] = useState(true);
  const [draftRefreshKey, setDraftRefreshKey] = useState(0);
  const [fixtureStatus, setFixtureStatus] = useState<string | null>(null);
  const colors = isDark ? DarkColors : LightColors;
  const previewKey = `${phase}-${isDark ? 'dark' : 'light'}`;

  useEffect(() => {
    if (routePhase && PHASES.includes(routePhase as VoiceCheckInPhase)) {
      setPhase(routePhase as VoiceCheckInPhase);
      setSheetVisible(true);
    }
  }, [routePhase]);

  useEffect(() => {
    if (routeTheme === 'dark' || routeTheme === 'light') setIsDark(routeTheme === 'dark');
  }, [routeTheme]);

  if (!isQaToolsEnabled()) {
    return <Redirect href="/(tabs)/(today)" />;
  }

  const closePreview = () => {
    setSheetVisible(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ statusBarStyle: isDark ? 'light' : 'dark' }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.devHeader}>
            <View>
              <Text style={[styles.devKicker, { color: colors.accent }]}>DEVELOPMENT PREVIEW</Text>
              <Text style={[styles.devTitle, { color: colors.text }]}>Voice check-in</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Close prototype route"
              onPress={guardedBack}
              style={[styles.routeClose, { borderColor: colors.border }]}
            >
              <Text style={[styles.routeCloseText, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlGroup}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/(tabs)/(today)', params: { voiceCheckInPrototype: '1', voiceCheckInDemo: '1' } })}
              style={styles.routeClose}
            >
              <Text style={[styles.routeCloseText, { color: colors.accent }]}>Preview on Today</Text>
            </TouchableOpacity>
            <Text style={[styles.controlLabel, { color: colors.textMuted }]}>THEME</Text>
            <View style={[styles.segmented, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              {(['dark', 'light'] as const).map((theme) => {
                const active = (theme === 'dark') === isDark;
                return (
                  <TouchableOpacity
                    key={theme}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => { setIsDark(theme === 'dark'); setSheetVisible(true); }}
                    style={[styles.segment, active && { backgroundColor: colors.backgroundElevated }]}
                  >
                    <Text style={[styles.segmentText, { color: active ? colors.text : colors.textMuted }]}>{theme}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {usesRealTransport ? (
            <View style={styles.controlGroup}>
              <Text style={[styles.controlLabel, { color: colors.textMuted }]}>REAL QA TRANSPORT</Text>
              <Text style={[styles.todayBody, { color: colors.textMuted }]}>Loads a synthetic local recording into the persisted draft flow. Send uses the configured backend.</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Load synthetic recording fixture"
                disabled={!fixtureUrl || fixtureStatus === 'Loading fixture…'}
                onPress={() => {
                  if (!fixtureUrl) return;
                  setFixtureStatus('Loading fixture…');
                  void seedVoiceCheckInDraftFromUrl(fixtureUrl)
                    .then(() => {
                      setFixtureStatus('Synthetic draft ready');
                      setDraftRefreshKey((value) => value + 1);
                      setSheetVisible(true);
                    })
                    .catch(() => setFixtureStatus('Fixture could not be loaded'));
                }}
                style={[styles.routeClose, { borderColor: colors.accent, opacity: fixtureUrl ? 1 : 0.5 }]}
              >
                <Text style={[styles.routeCloseText, { color: colors.accent }]}>Load synthetic draft</Text>
              </TouchableOpacity>
              <Text accessibilityLiveRegion="polite" style={[styles.controlLabel, { color: colors.textMuted }]}>{fixtureStatus ?? (fixtureUrl ? 'Fixture URL ready' : 'Add fixtureUrl to this route')}</Text>
            </View>
          ) : null}

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

          <View style={[styles.todayCard, { backgroundColor: colors.backgroundElevated, borderColor: alpha(colors.accent, 0.2) }]}>
            <Text style={[styles.todayEyebrow, { color: colors.textMuted }]}>TODAY · MATTHEW 6:34</Text>
            <Text style={[styles.todayTitle, { color: colors.text }]}>The grace of enough</Text>
            <Text style={[styles.todayBody, { color: colors.textMuted }]}>“Do not worry about tomorrow, for tomorrow will worry about itself.”</Text>
            <View style={[styles.todayAction, { borderColor: colors.border }]}>
              <Text style={[styles.todayActionText, { color: colors.text }]}>Continue reading</Text>
            </View>
          </View>

          <View style={[styles.companionCard, { backgroundColor: alpha(colors.accent, 0.06), borderColor: alpha(colors.accent, 0.22) }]}>
            <View style={[styles.companionIcon, { backgroundColor: alpha(colors.accent, 0.12) }]}>
              <MicrophoneIcon size={18} color={colors.accent} weight="regular" />
            </View>
            <View style={styles.companionCopy}>
              <Text style={[styles.companionEyebrow, { color: colors.textMuted }]}>COMPANION NOTE</Text>
              <Text style={[styles.companionTitle, { color: colors.text }]}>How’s your day going?</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Open voice check-in preview"
              onPress={() => setSheetVisible(true)}
              style={[styles.openButton, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.openButtonText, { color: colors.background }]}>Open</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      <VoiceCheckInSheet
        key={previewKey}
        visible={sheetVisible}
        onClose={closePreview}
        demoMode={!usesRealTransport}
        initialDemoPhase={phase}
        previewColors={colors}
        previewIsDark={isDark}
        draftRefreshKey={draftRefreshKey}
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
  segmented: { alignSelf: 'flex-start', flexDirection: 'row', borderRadius: Radius.full, borderWidth: StyleSheet.hairlineWidth, padding: 3 },
  segment: { minWidth: 68, minHeight: 36, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, textTransform: 'capitalize' },
  phaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'] },
  phaseChip: { minHeight: 36, paddingHorizontal: Spacing['3'], borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  phaseText: { fontFamily: FontFamily.uiMedium, fontSize: 11, textTransform: 'capitalize' },
  todayCard: { borderRadius: Radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['5'], gap: Spacing['3'] },
  todayEyebrow: { fontFamily: FontFamily.uiSemiBold, fontSize: 10, letterSpacing: 1.1 },
  todayTitle: { fontFamily: FontFamily.display, fontSize: 27, lineHeight: 33 },
  todayBody: { fontFamily: FontFamily.body, fontSize: FontSize.sm, lineHeight: 22 },
  todayAction: { alignSelf: 'flex-start', borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing['4'], minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  todayActionText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs },
  companionCard: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['3'], flexDirection: 'row', alignItems: 'center', gap: Spacing['3'] },
  companionIcon: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  companionCopy: { flex: 1, gap: 2 },
  companionEyebrow: { fontFamily: FontFamily.uiSemiBold, fontSize: 9, letterSpacing: 1 },
  companionTitle: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm },
  openButton: { minHeight: 40, borderRadius: Radius.full, paddingHorizontal: Spacing['4'], alignItems: 'center', justifyContent: 'center' },
  openButtonText: { fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.xs },
});
