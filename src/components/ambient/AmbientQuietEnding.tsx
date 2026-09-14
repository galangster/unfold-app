import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CaretDownIcon,
  CheckIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
} from '@/components/icons';
import { AmbientText } from './AmbientText';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useAmbientAudioState } from '@/lib/ambient-audio-state';
import { getAmbientTrack } from '@/lib/ambient-audio-catalog';
import { setAmbientTimer, stopAmbientSound } from '@/lib/ambient-audio';
import {
  AmbientSoundSheet,
  ambientStatusText,
  useAmbientSoundActions,
} from './AmbientSoundControls';

export function AmbientQuietEnding({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [quiet, setQuiet] = useState(false);
  const [settings, setSettings] = useState(false);
  const settingsTrigger = useRef<View>(null);
  const state = useAmbientAudioState();
  const toggle = useAmbientSoundActions();
  const track = getAmbientTrack(state.selectedTrackId);

  useEffect(() => {
    if (visible) {
      setQuiet(false);
      setSettings(false);
    }
  }, [visible]);

  const finish = () => {
    stopAmbientSound();
    setAmbientTimer(0);
    onClose();
  };

  const back = () => {
    if (settings) setSettings(false);
    else finish();
  };

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={back}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          contentContainerStyle={styles.container}
          accessibilityElementsHidden={settings}
          importantForAccessibility={settings ? 'no-hide-descendants' : 'auto'}
        >
          <View style={styles.symbol}>
            {quiet ? (
              <MoonIcon size={29} color={colors.accent} weight="light" />
            ) : (
              <CheckIcon size={29} color={colors.accent} />
            )}
          </View>
          <AmbientText
            accessibilityRole="header"
            style={[styles.heading, { color: colors.text }]}
          >
            {quiet ? 'A little longer\nin the quiet.' : 'Let that be enough\nfor tonight.'}
          </AmbientText>
          {quiet ? (
            <>
              <AmbientText style={[styles.verse, { color: colors.text }]}>
                “I will both lay me down{'\n'}in peace, and sleep.”
              </AmbientText>
              <AmbientText style={[styles.source, { color: colors.textMuted }]}>
                PSALM 4:8 · KJV
              </AmbientText>
              <AmbientText style={[styles.body, { color: colors.textMuted }]}>
                Nothing more to finish.{'\n'}Stay here with God for a moment.
              </AmbientText>
              <Pressable
                onPress={() => toggle()}
                disabled={state.status === 'loading'}
                accessibilityRole="button"
                accessibilityLabel={`${state.status === 'playing' ? 'Pause' : 'Play'} ${track.title}`}
                style={[styles.play, { borderColor: colors.borderStrong }]}
              >
                {state.status === 'playing' ? (
                  <PauseIcon size={27} color={colors.accent} />
                ) : (
                  <PlayIcon size={27} color={colors.accent} />
                )}
              </Pressable>
              <Pressable
                ref={settingsTrigger}
                onPress={() => setSettings(true)}
                accessibilityRole="button"
                accessibilityLabel="Change background sound"
                style={styles.track}
              >
                <AmbientText style={[styles.label, { color: colors.text }]}>
                  {track.title}
                </AmbientText>
                <CaretDownIcon size={16} color={colors.textMuted} />
              </Pressable>
              <AmbientText
                accessibilityLiveRegion="polite"
                style={[styles.label, { color: colors.textMuted }]}
              >
                {state.status === 'off'
                  ? 'Play only if you would like'
                  : ambientStatusText(state)}
              </AmbientText>
              <Pressable onPress={finish} accessibilityRole="button" style={styles.finish}>
                <AmbientText style={[styles.label, { color: colors.textMuted }]}>
                  Finish for tonight
                </AmbientText>
              </Pressable>
            </>
          ) : (
            <>
              <AmbientText style={[styles.body, { color: colors.textMuted }]}>
                Your reflection has a place here.{'\n'}Return whenever you need.
              </AmbientText>
              <Pressable
                onPress={() => setQuiet(true)}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.accent }]}
              >
                <AmbientText style={[styles.label, { color: colors.background }]}>
                  Stay a little longer
                </AmbientText>
              </Pressable>
              <Pressable onPress={finish} accessibilityRole="button" style={styles.finish}>
                <AmbientText style={[styles.label, { color: colors.textMuted }]}>
                  Return to Today
                </AmbientText>
              </Pressable>
            </>
          )}
        </ScrollView>
        <AmbientSoundSheet
          visible={settings}
          onClose={() => setSettings(false)}
          contained
          returnFocusRef={settingsTrigger}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  symbol: { marginBottom: 28 },
  heading: {
    fontFamily: FontFamily.display,
    fontSize: 43,
    lineHeight: 48,
    textAlign: 'center',
  },
  verse: {
    fontFamily: FontFamily.display,
    fontSize: 25,
    lineHeight: 35,
    textAlign: 'center',
    marginTop: 34,
  },
  source: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    marginTop: 15,
    letterSpacing: 1,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 27,
    textAlign: 'center',
    marginTop: 31,
    marginBottom: 30,
  },
  play: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    marginTop: 9,
  },
  label: { fontFamily: FontFamily.ui, fontSize: 14, textAlign: 'center' },
  finish: { minHeight: 48, justifyContent: 'center', marginTop: 19 },
  primary: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    minHeight: 50,
    justifyContent: 'center',
    padding: 14,
  },
});
