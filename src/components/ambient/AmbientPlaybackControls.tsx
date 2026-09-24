/** @jsxImportSource react */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SkipBackIcon, SkipForwardIcon, PauseIcon, PlayIcon } from '@/components/icons';
import { useTheme } from '@/lib/theme';
import { useAmbientAudioState } from '@/lib/ambient-audio-state';
import { AMBIENT_TRACKS, formatTrackDuration } from '@/lib/ambient-audio-catalog';
import { seekAmbientSound, skipAmbientSound } from '@/lib/ambient-audio';
import { AmbientText } from './AmbientText';

export function AmbientPlaybackControls({ onToggle }: { onToggle: () => void }) {
  const { colors } = useTheme();
  const status = useAmbientAudioState((state) => state.status);
  const trackId = useAmbientAudioState((state) => state.selectedTrackId);
  const position = useAmbientAudioState((state) => state.currentTime);
  const duration = useAmbientAudioState((state) => state.duration);
  const [draft, setDraft] = useState<number | null>(null);
  const seekGeneration = useRef(0);
  const track = AMBIENT_TRACKS.find((item) => item.id === trackId);
  if (status !== 'playing' && status !== 'paused') return null;
  const time = draft ?? position;
  const disabled = duration <= 0;

  return (
    <View style={[styles.player, { borderBottomColor: colors.border }]}>
      <AmbientText style={[styles.title, { color: colors.text }]}>{track?.title}</AmbientText>
      <Slider
        accessibilityLabel="Song position"
        accessibilityValue={{ min: 0, max: duration, now: time, text: `${formatTrackDuration(time)} of ${formatTrackDuration(duration)}` }}
        minimumValue={0}
        maximumValue={Math.max(1, duration)}
        value={time}
        disabled={disabled}
        onSlidingStart={(value) => { seekGeneration.current += 1; setDraft(value); }}
        onValueChange={setDraft}
        onSlidingComplete={(value) => {
          const generation = ++seekGeneration.current;
          setDraft(value);
          void seekAmbientSound(value).finally(() => {
            if (seekGeneration.current === generation) setDraft(null);
          });
        }}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.borderStrong}
        thumbTintColor={colors.accent}
        style={styles.slider}
      />
      <View style={styles.times}>
        <AmbientText style={[styles.time, { color: colors.textMuted }]}>{formatTrackDuration(time)}</AmbientText>
        <AmbientText style={[styles.time, { color: colors.textMuted }]}>{formatTrackDuration(duration)}</AmbientText>
      </View>
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous song" onPress={() => skipAmbientSound('previous')} style={styles.button}>
          <SkipBackIcon size={24} color={colors.accent} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={status === 'playing' ? 'Pause music' : 'Resume music'} onPress={onToggle} style={styles.button}>
          {status === 'playing' ? <PauseIcon size={28} color={colors.accent} /> : <PlayIcon size={28} color={colors.accent} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next song" onPress={() => skipAmbientSound('next')} style={styles.button}>
          <SkipForwardIcon size={24} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  player: { paddingBottom: 16, marginBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 18, textAlign: 'center', marginBottom: 12 },
  slider: { width: '100%', height: 44 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 13, fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 8 },
  button: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
