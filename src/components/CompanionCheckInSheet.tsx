import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  FadeIn,
  SlideInDown,
  SlideOutDown,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { XIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { CompanionOrb } from './CompanionOrb';
import {
  COMPANION_MOODS,
  selectCompanionQuestion,
  getCompanionResponse,
  COMPANION_SUGGESTIONS,
  type CompanionMoodLabel,
  type CompanionContext,
} from '@/constants/companion-messages';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.55;

export interface CompanionCheckInSheetProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (data: { mood: number; moodLabel: string; chipAnswer?: string }) => void;
  hasActiveSeries: boolean;
  hasReadToday: boolean;
  daysSinceLastOpen: number;
  streakCurrent: number;
  isFirstCompanionCheckIn: boolean;
}

type SheetStep = 'question' | 'response';

export function CompanionCheckInSheet({
  visible,
  onClose,
  onComplete,
  hasActiveSeries,
  hasReadToday,
  daysSinceLastOpen,
  streakCurrent,
  isFirstCompanionCheckIn,
}: CompanionCheckInSheetProps) {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState<SheetStep>('question');
  const [selectedMood, setSelectedMood] = useState<CompanionMoodLabel | null>(null);
  const [selectedMoodValue, setSelectedMoodValue] = useState<number>(0);
  const [responseText, setResponseText] = useState('');
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backdropOpacity = useSharedValue(0);

  const question = selectCompanionQuestion({
    isFirstCompanionCheckIn,
    daysSinceLastOpen,
    hasActiveSeries,
    hasReadToday,
    streakCurrent,
  });

  const contextBucket: CompanionContext = !hasActiveSeries
    ? 'between_series'
    : isFirstCompanionCheckIn
      ? 'first_time'
      : daysSinceLastOpen >= 3
        ? 'returning_after_gap'
        : 'has_active_series';

  const suggestions = COMPANION_SUGGESTIONS[contextBucket];

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 300 });
      setStep('question');
      setSelectedMood(null);
      setSelectedMoodValue(0);
      setResponseText('');
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, backdropOpacity]);

  // Auto-close after response is shown
  useEffect(() => {
    if (step === 'response') {
      autoCloseTimerRef.current = setTimeout(() => {
        if (selectedMood) {
          onComplete({ mood: selectedMoodValue, moodLabel: selectedMood });
        }
      }, 4000);
    }
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, [step, selectedMood, selectedMoodValue, onComplete]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleMoodSelect = useCallback(
    (moodLabel: CompanionMoodLabel, moodValue: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedMood(moodLabel);
      setSelectedMoodValue(moodValue);

      const response = getCompanionResponse(moodLabel, contextBucket);
      setResponseText(response);

      setTimeout(() => setStep('response'), 350);
    },
    [contextBucket],
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      onComplete({
        mood: selectedMoodValue,
        moodLabel: selectedMood || '',
        chipAnswer: suggestion,
      });
    },
    [selectedMoodValue, selectedMood, onComplete],
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
    }
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        {/* Backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.5)' },
              backdropStyle,
            ]}
          />
        </Pressable>

        {/* Sheet */}
        {visible && (
          <Animated.View
            entering={SlideInDown.duration(400).easing(Easing.out(Easing.cubic))}
            exiting={SlideOutDown.duration(250)}
            style={[
              styles.sheet,
              {
                height: SHEET_HEIGHT,
                backgroundColor: isDark
                  ? colors.backgroundElevated
                  : colors.backgroundPure,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Handle bar */}
            <View style={styles.handleBarContainer}>
              <View style={[styles.handleBar, { backgroundColor: colors.textHint }]} />
            </View>

            {/* Close button */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={handleClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <XIcon size={20} color={colors.textMuted} weight="light" />
              </Pressable>
            </View>

            {/* Orb at top center */}
            <View style={styles.orbContainer}>
              <CompanionOrb
                accentColor={colors.accent}
                size={96}
                isActive
              />
            </View>

            {/* Content */}
            <View style={styles.contentContainer}>
              {step === 'question' && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.stepContent}>
                  {/* Question */}
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 17,
                      color: colors.text,
                      textAlign: 'center',
                      lineHeight: 26,
                      marginBottom: 28,
                      paddingHorizontal: 16,
                    }}
                  >
                    {question}
                  </Text>

                  {/* Emotion pills — 2 rows of 3 */}
                  <View style={styles.moodGrid}>
                    {COMPANION_MOODS.map(({ value, label }) => (
                      <Pressable
                        key={label}
                        onPress={() => handleMoodSelect(label as CompanionMoodLabel, value)}
                        style={{
                          paddingHorizontal: 22,
                          paddingVertical: 12,
                          borderRadius: 24,
                          borderWidth: 1.5,
                          minWidth: 100,
                          alignItems: 'center',
                          backgroundColor: isDark
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(0,0,0,0.05)',
                          borderColor: isDark
                            ? 'rgba(255,255,255,0.22)'
                            : 'rgba(0,0,0,0.12)',
                        }}
                        android_ripple={{ color: colors.accent + '30' }}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                      >
                        {({ pressed }) => (
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 14,
                              color: pressed ? colors.accent : colors.text,
                            }}
                          >
                            {label}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </Animated.View>
              )}

              {step === 'response' && (
                <Animated.View entering={FadeIn.duration(400)} style={styles.stepContent}>
                  {/* Companion response */}
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 17,
                      color: colors.text,
                      textAlign: 'center',
                      lineHeight: 26,
                      marginBottom: 28,
                      paddingHorizontal: 16,
                    }}
                  >
                    {responseText}
                  </Text>

                  {/* Suggestion pills */}
                  <View style={styles.suggestionRow}>
                    {suggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        onPress={() => handleSuggestion(suggestion)}
                        style={{
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 20,
                          borderWidth: 1.5,
                          backgroundColor: colors.accent + '25',
                          borderColor: colors.accent + '50',
                        }}
                        android_ripple={{ color: colors.accent + '30' }}
                      >
                        {({ pressed }) => (
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 13,
                              color: pressed ? colors.text : colors.accent,
                            }}
                          >
                            {suggestion}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </Animated.View>
              )}
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  handleBarContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  orbContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    overflow: 'visible',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stepContent: {
    flex: 1,
    alignItems: 'center',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
});
