import React, { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Play, Pause, SkipBack, SkipForward, ChevronDown } from 'lucide-react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { streamDevotionalAudio, WordTimestamp, CARTESIA_VOICES } from '@/lib/cartesia';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { AudioWaveform } from './AudioWaveform';

const { width, height } = Dimensions.get('window');

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
  const { colors, isDark } = useTheme();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snap points for the bottom sheet
  const snapPoints = useMemo(() => ['25%', '50%', '90%'], []);

  // Combine devotional content with scripture for full audio
  const fullText = useMemo(() => {
    return `${content}\n\n${scriptureReference}: ${scriptureText}`;
  }, [content, scriptureReference, scriptureText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(async () => {
    // Stop progress tracking
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Stop and unload sound
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (error) {
        logger.warn('Error cleaning up audio:', error);
      }
      soundRef.current = null;
    }

    // Revoke audio URL
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

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

      // Cleanup any existing audio
      await cleanup();

      // Track audio play start
      Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_STARTED, {
        devotional_title: title,
        voice_id: voiceId,
      });

      // Stream audio from Cartesia
      const result = await streamDevotionalAudio(
        fullText,
        voiceId,
        (word, timestamp) => {
          // Find word index for karaoke effect
          const index = wordTimestamps.findIndex(wt => wt.word === word && Math.abs(wt.start - timestamp) < 0.1);
          if (index !== -1) {
            setActiveWordIndex(index);
          }
        }
      );

      // Store word timestamps for karaoke effect
      setWordTimestamps(result.wordTimestamps);

      // Create audio URL and load
      audioUrlRef.current = result.audioUrl;

      const { sound } = await Audio.Sound.createAsync(
        { uri: result.audioUrl },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      setIsPlaying(true);
      setDuration(result.duration * 1000); // Convert to milliseconds

      // Set up playback status listener
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded) {
          setCurrentTime(status.positionMillis);
          setIsPlaying(status.isPlaying);

          // Update active word based on timestamp
          if (result.wordTimestamps.length > 0 && status.positionMillis) {
            const currentSeconds = status.positionMillis / 1000;
            const currentWord = result.wordTimestamps.findIndex(
              (wt) => currentSeconds >= wt.start && currentSeconds <= wt.end
            );
            if (currentWord !== -1) {
              setActiveWordIndex(currentWord);
            }
          }

          // Handle completion
          if (status.didJustFinish) {
            setIsPlaying(false);
            setCurrentTime(0);
            setActiveWordIndex(-1);
            Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_COMPLETED, {
              devotional_title: title,
              voice_id: voiceId,
            });
          }
        }
      });

      // Start progress tracking
      progressIntervalRef.current = setInterval(async () => {
        if (soundRef.current) {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded) {
            setCurrentTime(status.positionMillis);
          }
        }
      }, 100);

    } catch (error) {
      logger.error('Error loading audio:', error);
      setHasError(true);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load audio');
    } finally {
      setIsLoading(false);
    }
  }, [isPremium, fullText, voiceId, title, wordTimestamps, cleanup]);

  const togglePlayback = useCallback(async () => {
    if (!soundRef.current) {
      await loadAndPlayAudio();
      return;
    }

    try {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded) {
        if (status.isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
          Analytics.logEvent(AnalyticsEvents.AUDIO_PAUSED, {
            devotional_title: title,
            position_ms: status.positionMillis,
          });
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (error) {
      logger.error('Error toggling playback:', error);
    }
  }, [loadAndPlayAudio, title]);

  const skipBackward = useCallback(async () => {
    if (!soundRef.current) return;
    
    try {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded) {
        const newPosition = Math.max(0, status.positionMillis - 10000);
        await soundRef.current.setPositionAsync(newPosition);
      }
    } catch (error) {
      logger.error('Error skipping backward:', error);
    }
  }, []);

  const skipForward = useCallback(async () => {
    if (!soundRef.current) return;
    
    try {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded) {
        const newPosition = Math.min(
          status.durationMillis || 0,
          status.positionMillis + 10000
        );
        await soundRef.current.setPositionAsync(newPosition);
      }
    } catch (error) {
      logger.error('Error skipping forward:', error);
    }
  }, []);

  const formatTime = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  // Get voice name
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
      onClose={onClose}
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
        {/* Close button */}
        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronDown size={24} color={colors.textMuted} />
        </Pressable>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: FontFamily.body }]}>
            {subtitle}
          </Text>
        </View>

        {/* Karaoke-style text display */}
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

        {/* Audio Waveform Visualization */}
        <AudioWaveform
          isPlaying={isPlaying}
          activeWordIndex={activeWordIndex}
          totalWords={wordTimestamps.length}
          color={colors.accent}
          barCount={24}
        />

        {/* Progress bar */}
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
            <Text style={[styles.timeText, { color: colors.textMuted }]}>
              {formatTime(currentTime)}
            </Text>
            <Text style={[styles.timeText, { color: colors.textMuted }]}>
              {formatTime(duration)}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controlsContainer}>
          <Pressable
            onPress={skipBackward}
            style={styles.controlButton}
            disabled={!soundRef.current}
          >
            <SkipBack size={24} color={soundRef.current ? colors.text : colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={togglePlayback}
            style={[
              styles.playButton,
              { backgroundColor: colors.accent },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : isPlaying ? (
              <Pause size={24} color="#000" />
            ) : (
              <Play size={24} color="#000" fill="#000" />
            )}
          </Pressable>

          <Pressable
            onPress={skipForward}
            style={styles.controlButton}
            disabled={!soundRef.current}
          >
            <SkipForward size={24} color={soundRef.current ? colors.text : colors.textMuted} />
          </Pressable>
        </View>

        {/* Voice info */}
        <View style={styles.voiceContainer}>
          <Text style={[styles.voiceText, { color: colors.textMuted }]}>
            Voice: {voiceName}
          </Text>
        </View>

        {/* Error message */}
        {hasError && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>
              {errorMessage}
            </Text>
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
