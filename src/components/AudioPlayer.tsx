import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Play, Pause, SkipBack, SkipForward, X, ChevronDown } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { streamDevotionalAudio, WordTimestamp, CARTESIA_VOICES } from '@/lib/cartesia';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';

const { width, height } = Dimensions.get('window');

interface AudioPlayerProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  content: string; // Full devotional text
  scriptureReference: string;
  scriptureText: string;
  voiceId: string;
  isPremium: boolean;
}

export function AudioPlayer({
  visible,
  onClose,
  title,
  subtitle,
  content,
  scriptureReference,
  scriptureText,
  voiceId,
  isPremium,
}: AudioPlayerProps) {
  const { colors, isDark } = useTheme();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<Audio.Sound | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<any>(null);
  const wordRefs = useRef<Map<number, any>>(new Map());
  
  // Parse content into words for highlighting
  const words = content.split(/(\s+)/).filter(w => w.trim());
  
  useEffect(() => {
    if (visible && !audioUrl) {
      loadAudio();
    }
    
    return () => {
      // Cleanup audio on unmount
      if (audioRef.current) {
        audioRef.current.unloadAsync();
      }
    };
  }, [visible]);
  
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(updateProgress, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying, wordTimestamps]);
  
  const loadAudio = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Track audio load started
      Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_STARTED, {
        devotional_title: title,
        voice_id: voiceId,
      });
      
      const result = await streamDevotionalAudio(content, voiceId);
      setAudioUrl(result.audioUrl);
      setWordTimestamps(result.wordTimestamps);
      setDuration(result.duration);
      
      // Load audio into expo-av
      const { sound } = await Audio.Sound.createAsync(
        { uri: result.audioUrl },
        { shouldPlay: false }
      );
      
      audioRef.current = sound;
      
      // Set up playback status listener
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setIsBuffering(status.isBuffering);
          
          if (status.didJustFinish) {
            setIsPlaying(false);
            setProgress(0);
            setCurrentWordIndex(-1);
            
            // Track completion
            Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_COMPLETED, {
              devotional_title: title,
              duration: result.duration,
            });
          }
        }
      });
      
      setIsLoading(false);
    } catch (err) {
      logger.error('[AudioPlayer] Error loading audio', { error: err });
      setError('Unable to load audio. Please try again.');
      setIsLoading(false);
    }
  };
  
  const updateProgress = async () => {
    if (!audioRef.current) return;
    
    const status = await audioRef.current.getStatusAsync();
    if (status.isLoaded) {
      const currentTime = status.positionMillis / 1000;
      const progressPercent = (currentTime / duration) * 100;
      setProgress(progressPercent);
      
      // Find current word based on timestamp
      const wordIndex = wordTimestamps.findIndex(
        (wt, index) => 
          currentTime >= wt.start && 
          currentTime < wt.end
      );
      
      if (wordIndex !== -1 && wordIndex !== currentWordIndex) {
        setCurrentWordIndex(wordIndex);
        
        // Scroll to current word
        const wordRef = wordRefs.current.get(wordIndex);
        if (wordRef) {
          wordRef.measureLayout(
            scrollViewRef.current,
            (x: number, y: number) => {
              scrollViewRef.current?.scrollTo({ y: y - 200, animated: true });
            },
            () => {}
          );
        }
      }
    }
  };
  
  const togglePlayback = async () => {
    if (!audioRef.current) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (isPlaying) {
      await audioRef.current.pauseAsync();
      setIsPlaying(false);
      
      // Track pause
      Analytics.logEvent(AnalyticsEvents.AUDIO_PAUSED, {
        devotional_title: title,
        progress_percent: Math.round(progress),
      });
    } else {
      await audioRef.current.playAsync();
      setIsPlaying(true);
    }
  };
  
  const seekBackward = async () => {
    if (!audioRef.current) return;
    const status = await audioRef.current.getStatusAsync();
    if (status.isLoaded) {
      const newPosition = Math.max(0, status.positionMillis - 15000);
      await audioRef.current.setPositionAsync(newPosition);
    }
  };
  
  const seekForward = async () => {
    if (!audioRef.current) return;
    const status = await audioRef.current.getStatusAsync();
    if (status.isLoaded) {
      const newPosition = Math.min(duration * 1000, status.positionMillis + 15000);
      await audioRef.current.setPositionAsync(newPosition);
    }
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pauseAsync();
      setIsPlaying(false);
    }
    onClose();
  };
  
  if (!visible) return null;
  
  const voiceName = CARTESIA_VOICES.find(v => v.id === voiceId)?.name || 'Default';
  
  return (
    <View style={styles.overlay}>
      <BlurView intensity={isDark ? 80 : 60} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
        <LinearGradient
          colors={isDark ? ['rgba(26,26,46,0.95)', 'rgba(15,52,96,0.98)'] : ['rgba(255,255,255,0.95)', 'rgba(240,240,240,0.98)']}
          style={styles.container}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <ChevronDown size={28} color={colors.text} />
            </Pressable>
            
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
            </View>
            
            <View style={styles.placeholder} />
          </View>
          
          {/* Scripture */}
          <View style={[styles.scriptureContainer, { backgroundColor: colors.inputBackground }]}>
            <Text style={[styles.scriptureText, { color: colors.text, fontFamily: FontFamily.bodyItalic }]}>
              "{scriptureText}"
            </Text>
            <Text style={[styles.scriptureRef, { color: colors.accent }]}>
              — {scriptureReference}
            </Text>
          </View>
          
          {/* Content with Karaoke Highlighting */}
          <View style={styles.contentContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                  Preparing audio...
                </Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                <Pressable onPress={loadAudio} style={[styles.retryButton, { backgroundColor: colors.accent }]}>
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </Pressable>
              </View>
            ) : (
              <Animated.ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.wordsContainer}>
                  {words.map((word, index) => (
                    <Text
                      key={index}
                      ref={(ref) => {
                        if (ref) wordRefs.current.set(index, ref);
                      }}
                      style={[
                        styles.word,
                        { 
                          color: index === currentWordIndex 
                            ? colors.accent 
                            : colors.textMuted,
                          fontFamily: index === currentWordIndex 
                            ? FontFamily.uiSemiBold 
                            : FontFamily.body,
                          fontSize: index === currentWordIndex ? 18 : 16,
                          textShadowColor: index === currentWordIndex 
                            ? colors.accent + '40'
                            : 'transparent',
                          textShadowOffset: index === currentWordIndex 
                            ? { width: 0, height: 0 } 
                            : { width: 0, height: 0 },
                          textShadowRadius: index === currentWordIndex ? 10 : 0,
                        },
                      ]}
                    >
                      {word}
                    </Text>
                  ))}
                </View>
              </Animated.ScrollView>
            )}
          </View>
          
          {/* Progress Bar */}
          {!isLoading && !error && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    { 
                      backgroundColor: colors.accent,
                      width: `${progress}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.timeContainer}>
                <Text style={[styles.timeText, { color: colors.textMuted }]}>
                  {formatTime((progress / 100) * duration)}
                </Text>
                <Text style={[styles.timeText, { color: colors.textMuted }]}>
                  {formatTime(duration)}
                </Text>
              </View>
            </View>
          )}
          
          {/* Voice Info */}
          <View style={styles.voiceContainer}>
            <Text style={[styles.voiceLabel, { color: colors.textMuted }]}>Voice</Text>
            <Text style={[styles.voiceName, { color: colors.text }]}>{voiceName}</Text>
          </View>
          
          {/* Controls */}
          <View style={styles.controls}>
            <Pressable 
              onPress={seekBackward} 
              style={styles.controlButton}
              disabled={isLoading}
            >
              <SkipBack size={28} color={colors.text} />
            </Pressable>
            
            <Pressable 
              onPress={togglePlayback} 
              style={[styles.playButton, { backgroundColor: colors.accent }]}
              disabled={isLoading || isBuffering}
            >
              {isBuffering ? (
                <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
              ) : isPlaying ? (
                <Pause size={28} color={isDark ? '#000' : '#fff'} />
              ) : (
                <Play size={28} color={isDark ? '#000' : '#fff'} fill={isDark ? '#000' : '#fff'} />
              )}
            </Pressable>
            
            <Pressable 
              onPress={seekForward} 
              style={styles.controlButton}
              disabled={isLoading}
            >
              <SkipForward size={28} color={colors.text} />
            </Pressable>
          </View>
          
          {/* Premium Badge */}
          {!isPremium && (
            <Pressable style={[styles.premiumBanner, { backgroundColor: colors.accent + '20' }]}>
              <Text style={[styles.premiumText, { color: colors.accent }]}>
                ✨ Upgrade to unlock 6 more voices
              </Text>
            </Pressable>
          )}
        </LinearGradient>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  blur: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  closeButton: {
    padding: 8,
    width: 44,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    marginTop: 4,
  },
  placeholder: {
    width: 44,
  },
  scriptureContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
  },
  scriptureText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  scriptureRef: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 13,
  },
  contentContainer: {
    flex: 1,
    marginHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20,
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  word: {
    marginRight: 4,
    lineHeight: 28,
    paddingVertical: 2,
    transition: 'all 0.1s ease',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
    color: '#000',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    fontFamily: FontFamily.mono,
    fontSize: 12,
  },
  voiceContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  voiceLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  voiceName: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 14,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 32,
  },
  controlButton: {
    padding: 12,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  premiumBanner: {
    marginHorizontal: 20,
    marginBottom: 30,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  premiumText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 14,
  },
});
