import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LifeContextInput } from '@/components/LifeContextInput';
import { Button } from '@/components/ui';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { useGuardedBack } from '@/hooks/useGuardedBack';
import { useCreationGate } from '@/hooks/useCreationGate';
import { FontFamily } from '@/constants/fonts';
import { useHasHydrated, useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { canSaveLifeContext, hasLifeContextAnswer, LIFE_CONTEXT_INVITATION, LIFE_CONTEXT_QUESTION } from '@/lib/life-context';
import { captureSyncSession, isSyncSessionCurrent } from '@/lib/sync-session-fence';

export default function LifeUpdateScreen() {
  const hydrated = useHasHydrated();
  const user = useUnfoldStore((state) => state.user);
  if (!hydrated) return null;
  if (!user?.hasCompletedOnboarding) return <Redirect href="/onboarding" />;
  return <LifeUpdateForm />;
}

function LifeUpdateForm() {
  const router = useRouter();
  const close = useGuardedBack();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const newSeries = next === 'series';
  const { colors, isDark } = useTheme();
  const { gate, showExclusiveOffer, dismissOffer, handleOfferVerifiedExit } = useCreationGate();
  // Each intake keeps its own unsent text. "Share an update" edits the saved
  // context; a new series asks afresh and opens blank unless it has unsent text.
  const readDraft = () => {
    const state = useUnfoldStore.getState();
    return newSeries ? state.newSeriesLifeDraft : state.lifeContextDraft;
  };
  const writeDraft = (value: string | null) => {
    const state = useUnfoldStore.getState();
    // An emptied new-series field is no unsent writing.
    if (newSeries) state.setNewSeriesLifeDraft(value || null);
    else state.setLifeContextDraft(value);
  };
  const [text, setText] = useState(() => readDraft() ?? (newSeries ? '' : useUnfoldStore.getState().user?.currentSituation ?? ''));
  const [saved, setSaved] = useState(false);
  const session = useRef(captureSyncSession());
  const leaving = useRef(false);

  const finish = (save: boolean) => {
    if (leaving.current || !isSyncSessionCurrent(session.current)) return;
    if (save && !canSaveLifeContext(text)) return;
    const state = useUnfoldStore.getState();
    if (!state.user) return;
    if (save && (!newSeries || hasLifeContextAnswer(text))) {
      state.updateUser({ currentSituation: text });
    }
    // Saving ends the unsent text; so does skipping a new series' question.
    if (save || newSeries) writeDraft(null);
    if (newSeries) {
      // The last intake's deeper answers and read feed only a new series' first
      // plan. Retire them before the gate: its paywall routes can start it too.
      state.updateUser({ diagnosticAnswers: undefined, mirrorWorkingRead: undefined, mirrorCorrection: undefined });
      if (!gate()) return;
      leaving.current = true;
      router.replace('/generating');
    } else if (save) {
      setSaved(true);
    } else {
      close();
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Button variant="ghost" label="Close" onPress={close} accessibilityLabel="Close life update" />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>{newSeries ? 'BEFORE YOUR NEXT SERIES' : 'A MOMENT FOR YOU'}</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{saved ? 'Your update is saved.' : LIFE_CONTEXT_QUESTION}</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {saved ? 'Unfold will use it to shape your upcoming devotionals.' : LIFE_CONTEXT_INVITATION}
          </Text>
          {saved ? (
            <Button size="lg" label="Done" onPress={close} />
          ) : (
            <>
              <LifeContextInput value={text} colors={colors} isDark={isDark} onChangeText={(value) => {
                if (!isSyncSessionCurrent(session.current)) return;
                setText(value);
                writeDraft(value);
              }} />
              <Button size="lg" label={newSeries ? 'Save and create series' : 'Save update'} disabled={!canSaveLifeContext(text)} onPress={() => finish(true)} />
              <Button variant="ghost" size="lg" label="Skip for now" onPress={() => finish(false)} />
              <Text style={[styles.note, { color: colors.textMuted }]}>
                Skipping keeps your saved context.{!newSeries && ' Unfinished edits stay on this device.'}
              </Text>
              {readDraft() !== null && (
                <Button variant="ghost" label="Discard unfinished edits" onPress={() => {
                  Alert.alert('Discard these edits?', 'Your saved life context will stay unchanged.', [
                    { text: 'Keep editing', style: 'cancel' },
                    { text: 'Discard', style: 'destructive', onPress: () => {
                      writeDraft(null);
                      close();
                    } },
                  ]);
                }} />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <ExclusiveOfferSheet visible={showExclusiveOffer} onDismiss={dismissOffer} onPurchaseSuccess={handleOfferVerifiedExit} surface="churned_sheet" context="churned" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'flex-end', paddingHorizontal: 12 },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 32, gap: 20 },
  eyebrow: { fontFamily: FontFamily.ui, fontSize: 11, letterSpacing: 1.4 },
  title: { fontFamily: FontFamily.display, fontSize: 32, lineHeight: 40 },
  body: { fontFamily: FontFamily.body, fontSize: 17, lineHeight: 25 },
  note: { fontFamily: FontFamily.ui, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
