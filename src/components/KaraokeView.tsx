import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { XIcon, PlayIcon, PauseIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useReadingFont } from '@/lib/useReadingFont';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface KaraokeViewProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  scriptureReference: string;
  scriptureText: string;
  bodyText: string;
  currentTime: number; // ms
  duration: number; // ms
  isPlaying: boolean;
  onTogglePlayback: () => void;
}

interface Sentence {
  text: string;
  isScripture: boolean;
  wordStart: number;
  wordEnd: number;
}

export function KaraokeView({
  visible,
  onClose,
  title,
  scriptureReference,
  scriptureText,
  bodyText,
  currentTime,
  duration,
  isPlaying,
  onTogglePlayback,
}: KaraokeViewProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const readingFont = useReadingFont();
  const scrollRef = useRef<ScrollView>(null);
  const sentenceYPositions = useRef<number[]>([]);
  const lastScrolledIndex = useRef(-1);

  // Split text into sentences with word offsets for timing estimation
  const sentences = useMemo(() => {
    const result: Sentence[] = [];
    let wordOffset = 0;

    // Scripture first (matches audio order)
    if (scriptureText) {
      const scriptureSentences = scriptureText
        .split(/(?<=[.!?;:])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      scriptureSentences.forEach(text => {
        const words = text.split(/\s+/).length;
        result.push({
          text,
          isScripture: true,
          wordStart: wordOffset,
          wordEnd: wordOffset + words,
        });
        wordOffset += words;
      });
    }

    // Body text
    if (bodyText) {
      const bodyParagraphs = bodyText.split(/\n\n+/).filter(p => p.trim().length > 0);
      bodyParagraphs.forEach(paragraph => {
        const bodySentences = paragraph
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);

        bodySentences.forEach(text => {
          const words = text.split(/\s+/).length;
          result.push({
            text,
            isScripture: false,
            wordStart: wordOffset,
            wordEnd: wordOffset + words,
          });
          wordOffset += words;
        });
      });
    }

    return result;
  }, [scriptureText, bodyText]);

  const totalWords = sentences.length > 0 ? sentences[sentences.length - 1].wordEnd : 1;

  // Find current sentence based on estimated timing
  const currentSentenceIndex = useMemo(() => {
    if (duration <= 0 || totalWords <= 0) return 0;
    const progress = currentTime / duration;
    const currentWord = Math.floor(progress * totalWords);
    const idx = sentences.findIndex(
      s => currentWord >= s.wordStart && currentWord < s.wordEnd
    );
    return idx >= 0 ? idx : sentences.length - 1;
  }, [currentTime, duration, totalWords, sentences]);

  // Auto-scroll to current sentence
  useEffect(() => {
    if (!visible) return;
    if (currentSentenceIndex === lastScrolledIndex.current) return;
    lastScrolledIndex.current = currentSentenceIndex;

    const y = sentenceYPositions.current[currentSentenceIndex];
    if (y != null) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - SCREEN_HEIGHT * 0.35),
        animated: true,
      });
    }
  }, [currentSentenceIndex, visible]);

  const handleSentenceLayout = useCallback(
    (index: number, y: number) => {
      sentenceYPositions.current[index] = y;
    },
    []
  );

  const formatTime = useCallback((ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { backgroundColor: isDark ? '#0A0A0A' : '#FAFAF8' }]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTitleArea}>
          <Text
            style={[styles.headerLabel, { color: colors.accent, fontFamily: FontFamily.mono }]}
          >
            LISTENING
          </Text>
          <Text
            style={[styles.headerTitle, { color: colors.text, fontFamily: FontFamily.uiSemiBold }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClose();
          }}
          style={[
            styles.headerClose,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
          ]}
        >
          <XIcon size={18} color={colors.textMuted} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Scrolling text */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 160 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Scripture header */}
        {scriptureReference && (
          <Text
            style={[
              styles.scriptureLabel,
              { color: colors.accent, fontFamily: FontFamily.mono },
            ]}
          >
            {scriptureReference}
          </Text>
        )}

        {sentences.map((sentence, i) => {
          const isCurrent = i === currentSentenceIndex;
          const isPast = i < currentSentenceIndex;
          const isScriptureSection = sentence.isScripture;

          return (
            <View
              key={`${sentence.text.slice(0, 30)}-${i}`}
              onLayout={(e) => handleSentenceLayout(i, e.nativeEvent.layout.y)}
            >
              {/* Add divider between scripture and body */}
              {i > 0 && sentence.isScripture !== sentences[i - 1].isScripture && (
                <View
                  style={[
                    styles.sectionDivider,
                    { backgroundColor: colors.accent },
                  ]}
                />
              )}
              <Text
                style={[
                  styles.sentenceText,
                  {
                    fontFamily: isScriptureSection
                      ? readingFont.bodyItalic
                      : readingFont.body,
                    color: isCurrent
                      ? colors.text
                      : isPast
                        ? isDark ? 'rgba(232,228,220,0.35)' : 'rgba(26,26,26,0.35)'
                        : isDark ? 'rgba(232,228,220,0.15)' : 'rgba(26,26,26,0.15)',
                    fontSize: isCurrent ? 26 : 22,
                    lineHeight: isCurrent ? 40 : 34,
                  },
                ]}
              >
                {sentence.text}{' '}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom controls */}
      <View
        style={[
          styles.controls,
          {
            paddingBottom: insets.bottom + 16,
            backgroundColor: isDark ? 'rgba(10,10,10,0.95)' : 'rgba(250,250,248,0.95)',
            borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <Text style={[styles.controlTime, { color: colors.textMuted, fontFamily: FontFamily.mono }]}>
          {formatTime(currentTime)}
        </Text>

        <TouchableOpacity activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onTogglePlayback();
          }}
          style={[styles.controlPlayButton, { backgroundColor: colors.accent }]}
        >
          {isPlaying ? (
            <PauseIcon size={20} color="#fff" weight="fill" />
          ) : (
            <PlayIcon size={20} color="#fff" weight="fill" style={{ marginLeft: -1 }} />
          )}
        </TouchableOpacity>

        <Text
          style={[
            styles.controlTime,
            { color: colors.textMuted, fontFamily: FontFamily.mono, textAlign: 'right' },
          ]}
        >
          {formatTime(duration)}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitleArea: {
    flex: 1,
  },
  headerLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.7,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: FontSize.base,
    letterSpacing: -0.2,
  },
  headerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 40,
  },
  scriptureLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.7,
    marginBottom: 20,
  },
  sectionDivider: {
    width: 28,
    height: 1.5,
    borderRadius: 1,
    marginVertical: 32,
    opacity: 0.4,
  },
  sentenceText: {
    marginBottom: 6,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  controlTime: {
    fontSize: FontSize.xs,
    fontVariant: ['tabular-nums'],
    width: 44,
  },
  controlPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
