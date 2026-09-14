/** @jsxImportSource react */
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { ClockIcon, MusicNotesIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { formatAmbientRemaining, useAmbientAudioState } from '@/lib/ambient-audio-state';
import { useAmbientSoundChrome } from '@/lib/ambient-sound-chrome';
import { AmbientText } from './AmbientText';

export function AmbientMusicEntry() {
  const { colors } = useTheme();
  const focused = useIsFocused();
  const status = useAmbientAudioState((state) => state.status);
  const timerStatus = useAmbientAudioState((state) => state.timerStatus);
  const remainingSeconds = useAmbientAudioState((state) =>
    state.timerStatus === 'running' ? state.remainingSeconds : 0,
  );
  const openSheet = useAmbientSoundChrome((chrome) => chrome.openSheet);
  const registerEntry = useAmbientSoundChrome((chrome) => chrome.registerEntry);
  const musicRef = useRef<View>(null);
  const timerRef = useRef<View>(null);
  const playing = status === 'playing';
  const timerRunning = timerStatus === 'running';

  useEffect(() => {
    if (!focused) return;
    registerEntry(musicRef);
    return () => {
      if (useAmbientSoundChrome.getState().returnFocusRef === musicRef) registerEntry(null);
    };
  }, [focused, registerEntry]);

  return (
    <View style={styles.headerActions}>
      <Pressable
        ref={musicRef}
        testID="ambient-sound-open"
        onPress={() => openSheet('sounds', musicRef)}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Music playing. Change music' : 'Open music'}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <MusicNotesIcon
          size={19}
          color={playing ? colors.accent : colors.text}
          weight={playing ? 'fill' : 'light'}
        />
      </Pressable>
      <Pressable
        ref={timerRef}
        testID="ambient-timer-open"
        onPress={() => openSheet('timer', timerRef)}
        accessibilityRole="button"
        accessibilityLabel={
          timerRunning
            ? `${formatAmbientRemaining(remainingSeconds)} remaining. Change timer`
            : 'Set a timer'
        }
        style={({ pressed }) => [styles.timerButton, pressed && styles.pressed]}
      >
        <ClockIcon
          size={18}
          color={timerRunning ? colors.accent : colors.text}
          weight="light"
        />
        <View testID="ambient-timer-countdown-slot" style={styles.countdownSlot}>
          <AmbientText
            style={[styles.timerLabel, styles.countdownReserve]}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            30:00
          </AmbientText>
          {timerRunning ? (
            <AmbientText style={[styles.timerLabel, styles.countdownValue, { color: colors.accent }]}>
              {formatAmbientRemaining(remainingSeconds)}
            </AmbientText>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  timerButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countdownSlot: { justifyContent: 'center' },
  timerLabel: { fontFamily: FontFamily.ui, fontSize: 12, fontVariant: ['tabular-nums'] },
  countdownReserve: { color: 'transparent' },
  countdownValue: { position: 'absolute', left: 0, right: 0 },
  pressed: { opacity: 0.65 },
});
