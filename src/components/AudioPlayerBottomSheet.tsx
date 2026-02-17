import React, { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Play, Pause, SkipBack, SkipForward, ChevronDown } from 'lucide-react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { streamDevotionalAudio, WordTimestamp, CARTESIA_VOICES } from '@/lib/cartesia';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { AudioWaveform } from './AudioWaveform';

interface AudioPlayerProps {
  title: string;
  subtitle: string;
  content: string;
  scriptureReference: string;
  scriptureText: string;
  voiceId: string;
  isPremium: boolean;
  onClose: () => void;
}

export const AudioPlayer = forwardRef<BottomSheet, AudioPlayerProps>(({
  title,
  subtitle,
  content,
  scriptureReference,
  scriptureText,
  voiceId,
  isPremium,
  onClose,
}, ref) => {
  const { colors } = useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const shouldAutoplayRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);

  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const currentTime = status.currentTime * 1000;
  const duration = status.duration * 1000;

  const snapPoints = useMemo(() => ['25%', '50%', '90%'], []);

  const fullText = useMemo(() => {
    return `${content}\n\n${scriptureReference}: ${scriptureText}`;
  }, [content, scriptureReference, scriptureText]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsRecording: false,
      interruptionMode: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    if (!status.isLoaded || !audioUrl || !shouldAutoplayRef.current) return;
    player.play();
    shouldAutoplayRef.current = false;
  }, [status.isLoaded, audioUrl, player]);

  useEffect(() => {
    if (!wordTimestamps.length) {
      setActiveWordIndex(-1);
      return;
    }
    const currentSeconds = currentTime / 1000;
    const currentWord = wordTimestamps.findIndex(
      (wt) => currentSeconds >= wt.start && currentSeconds <= wt.end
    );
    setActiveWordIndex(currentWord);
  }, [currentTime, wordTimestamps]);

  useEffect(() => {
    if (status.didJustFinish) {
      setActiveWordIndex(-1);
      Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_COMPLETED, {
        devotional_title: title,
        voice_id: voiceId,
      });
    }
  }, [status.didJustFinish, title, voiceId]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, [player]);

  const loadAndPlayAudio = useCallback(async () => {
    if (!isPremium) {
      setHasError(true);
      setErrorMessage('Audio playback is a premium feature. Upgrade to listen.');
      return;
    }

    try {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage('');

      if (audioUrlRef.current) {
        try {
          player.pause();
        } catch {}
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }

      Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_STARTED, {
        devotional_title: title,
        voice_id: voiceId,
      });

      const result = await streamDevotionalAudio(fullText, voiceId);
      setWordTimestamps(result.wordTimestamps);

      shouldAutoplayRef.current = true;
      setAudioUrl(result.audioUrl);
    } catch (error) {
      logger.error('Error loading audio:', error);
      setHasError(true);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load audio');
    } finally {
      setIsLoading(false);
    }
  }, [isPremium, fullText, voiceId, title, player]);

  const togglePlayback = useCallback(async () => {
    if (!audioUrl || !status.isLoaded) {
      await loadAndPlayAudio();
      return;
    }

    try {
      if (status.playing) {
        player.pause();
        Analytics.logEvent(AnalyticsEvents.AUDIO_PAUSED, {
          devotional_title: title,
          position_ms: currentTime,
        });
      } else {
        // Replay behavior when at end
        if (status.duration > 0 && Math.abs(status.currentTime - status.duration) < 0.05) {
          await player.seekTo(0);
        }
        player.play();
      }
    } catch (error) {
      logger.error('Error toggling playback:', error);
    }
  }, [audioUrl, status, loadAndPlayAudio, player, title, currentTime]);

  const skipBackward = useCallback(async () => {
    if (!audioUrl || !status.isLoaded) return;
    try {
      const newPositionSec = Math.max(0, status.currentTime - 10);
      await player.seekTo(newPositionSec);
    } catch (error) {
      logger.error('Error skipping backward:', error);
    }
  }, [audioUrl, status, player]);

  const skipForward = useCallback(async () => {
    if (!audioUrl || !status.isLoaded) return;
    try {
      const newPositionSec = Math.min(status.duration || 0, status.currentTime + 10);
      await player.seekTo(newPositionSec);
    } catch (error) {
      logger.error('Error skipping forward:', error);
    }
  }, [audioUrl, status, player]);

  const handleClose = useCallback(() => {
    try {
      player.pause();
    } catch {}
    onClose();
  }, [player, onClose]);

  const formatTime = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const voiceName = useMemo(() => {
    const voice = CARTESIA_VOICES.find((v) => v.id === voiceId);
    return voice?.name || 'Default Voice';
  }, [voiceId]);

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      onClose={handleClose}
      backgroundStyle={{
        backgroundColor: colors.background,
      }}
      handleStyle={{
        backgroundColor: colors.background,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.textMuted,
        width: 40,
        height: 4,
        borderRadius: 2,
      }}
    >
      <BottomSheetView style={[styles.container, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={handleClose}
          style={styles.closeButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronDown size={24} color={colors.textMuted} />
        </Pressable>

        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: FontFamily.body }]}> 
            {subtitle}
          </Text>
        </View>

        <View style={styles.textContainer}>
          {wordTimestamps.length > 0 ? (
            <Text style={[styles.karaokeText, { fontFamily: FontFamily.body }]}> 
              {wordTimestamps.map((wt, index) => (
                <Text
                  key={index}
                  style={{
                    color: index === activeWordIndex ? colors.accent : colors.textMuted,
                  }}
                >
                  {wt.word + ' '}
                </Text>
              ))}
            </Text>
          ) : (
            <Text style={[styles.placeholderText, { color: colors.textMuted }]}> 
              {isLoading ? 'Loading audio...' : 'Press play to start listening'}
            </Text>
          )}
        </View>

        <AudioWaveform
          isPlaying={isPlaying}
          activeWordIndex={activeWordIndex}
          totalWords={wordTimestamps.length}
          color={colors.accent}
          barCount={24}
        />

        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}> 
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
                },
              ]}
            />
          </View>
          <View style={styles.timeContainer}>
            <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(currentTime)}</Text>
            <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <Pressable onPress={skipBackward} style={styles.controlButton} disabled={!audioUrl || !status.isLoaded}>
            <SkipBack size={24} color={audioUrl && status.isLoaded ? colors.text : colors.textMuted} />
          </Pressable>

          <Pressable onPress={togglePlayback} style={[styles.playButton, { backgroundColor: colors.accent }]}> 
            {isLoading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : isPlaying ? (
              <Pause size={24} color="#000" />
            ) : (
              <Play size={24} color="#000" fill="#000" />
            )}
          </Pressable>

          <Pressable onPress={skipForward} style={styles.controlButton} disabled={!audioUrl || !status.isLoaded}>
            <SkipForward size={24} color={audioUrl && status.isLoaded ? colors.text : colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.voiceContainer}>
          <Text style={[styles.voiceText, { color: colors.textMuted }]}>Voice: {voiceName}</Text>
        </View>

        {hasError && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}> 
            <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});

AudioPlayer.displayName = 'AudioPlayer';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  closeButton: {
    alignSelf: 'center',
    padding: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  textContainer: {
    flex: 1,
    marginBottom: 24,
  },
  karaokeText: {
    fontSize: 16,
    lineHeight: 24,
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 24,
  },
  controlButton: {
    padding: 12,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceContainer: {
    alignItems: 'center',
  },
  voiceText: {
    fontSize: 12,
  },
  errorContainer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
