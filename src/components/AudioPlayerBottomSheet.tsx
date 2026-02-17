import React, { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Play, Pause } from 'lucide-react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/lib/theme';
import { streamDevotionalAudio, WordTimestamp } from '@/lib/cartesia';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  content,
  scriptureReference,
  scriptureText,
  voiceId,
  isPremium,
  onClose,
}, ref) => {
  const { colors, isDark } = useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);

  const shouldAutoplayRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);
  const progressBarRef = useRef<View>(null);
  const progressBarWidthRef = useRef(0);

  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const currentTime = status.currentTime * 1000;
  const duration = status.duration * 1000;

  const snapPoints = useMemo(() => ['12%', '25%'], []);

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
    if (status.didJustFinish) {
      Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_COMPLETED, {
        voice_id: voiceId,
      });
    }
  }, [status.didJustFinish, voiceId]);

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

  // Auto-load and play if premium
  useEffect(() => {
    if (isPremium && !audioUrl && !hasError) {
      loadAndPlayAudio();
    } else if (!isPremium) {
      setHasError(true);
      setErrorMessage('Audio playback is a premium feature. Upgrade to listen.');
    }
  }, []);

  const loadAndPlayAudio = useCallback(async () => {
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
  }, [isPremium, fullText, voiceId, player]);

  const togglePlayback = useCallback(async () => {
    if (!audioUrl || !status.isLoaded) {
      await loadAndPlayAudio();
      return;
    }

    try {
      if (status.playing) {
        player.pause();
        Analytics.logEvent(AnalyticsEvents.AUDIO_PAUSED, {
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
  }, [audioUrl, status, loadAndPlayAudio, player, currentTime]);

  const handleProgressBarLayout = useCallback((event: any) => {
    progressBarWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  const handleProgressPress = useCallback(async (event: any) => {
    if (!audioUrl || !status.isLoaded || duration <= 0) return;
    
    const { locationX } = event.nativeEvent;
    const progress = Math.max(0, Math.min(1, locationX / progressBarWidthRef.current));
    const newPositionSec = (progress * duration) / 1000;
    
    try {
      await player.seekTo(newPositionSec);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      logger.error('Error seeking:', error);
    }
  }, [audioUrl, status.isLoaded, duration, player]);

  const formatTime = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      onClose={onClose}
      backgroundStyle={{
        backgroundColor: 'transparent',
      }}
      handleStyle={{
        backgroundColor: 'transparent',
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.textMuted,
        width: 40,
        height: 4,
        borderRadius: 2,
      }}
    >
      <BottomSheetView style={styles.container}>
        {/* Blur background */}
        <BlurView
          intensity={80}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)' }]}
        />

        {/* Content over blur */}
        <View style={styles.content}>
          {/* Progress bar - full width, scrubbable */}
          <View style={styles.progressSection}>
            <Pressable
              ref={progressBarRef}
              onLayout={handleProgressBarLayout}
              onPress={handleProgressPress}
              style={[styles.progressBarContainer, { backgroundColor: colors.border }]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${progressPercent}%`,
                  },
                ]}
              />
              {/* Progress thumb */}
              <View
                style={[
                  styles.progressThumb,
                  {
                    backgroundColor: colors.accent,
                    left: `${progressPercent}%`,
                    transform: [{ translateX: -8 }],
                  },
                ]}
              />
            </Pressable>
            
            {/* Time labels */}
            <View style={styles.timeContainer}>
              <Text style={[styles.timeText, { color: colors.textMuted }]}>
                {formatTime(currentTime)}
              </Text>
              <Text style={[styles.timeText, { color: colors.textMuted }]}>
                {formatTime(duration)}
              </Text>
            </View>
          </View>

          {/* Single play/pause button */}
          <View style={styles.controlsContainer}>
            <Pressable
              onPress={togglePlayback}
              style={[styles.playButton, { backgroundColor: colors.accent }]}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : isPlaying ? (
                <Pause size={28} color="#fff" fill="#fff" />
              ) : (
                <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
              )}
            </Pressable>
          </View>

          {/* Error message - fixed contrast */}
          {hasError && (
            <View style={[styles.errorContainer, { backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)' }]}>
              <Text style={[styles.errorText, { color: isDark ? '#ef4444' : '#dc2626' }]}>
                {errorMessage}
              </Text>
            </View>
          )}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

AudioPlayer.displayName = 'AudioPlayer';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  progressSection: {
    marginTop: 8,
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controlsContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  errorContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default AudioPlayer;
