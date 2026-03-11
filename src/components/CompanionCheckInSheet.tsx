import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  FadeIn,
  SlideInDown,
  SlideOutDown,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { XIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';
import { CompanionOrb } from './CompanionOrb';
import {
  COMPANION_MOODS,
  selectCompanionQuestion,
  getCompanionResponse,
  COMPANION_SUGGESTIONS,
  type CompanionMoodLabel,
  type CompanionContext,
} from '@/constants/companion-messages';
import {
  generateCompanionResponse,
  type CompanionMood,
  type CompanionResponseContext,
} from '@/lib/companion-service';

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

type SheetStep = 'question' | 'loading' | 'response';

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
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store selectors
  const companionName = useUnfoldStore((s) => s.companionName);
  const userName = useUnfoldStore((s) => s.user?.name ?? null);
  const recentCompanionCheckIns = useUnfoldStore((s) => s.recentCompanionCheckIns);
  const addRecentCompanionCheckIn = useUnfoldStore((s) => s.addRecentCompanionCheckIn);
  const currentSeriesTheme = useUnfoldStore((s) => {
    const dev = s.devotionals.find((d) => d.id === s.currentDevotionalId);
    return dev?.title ?? null;
  });

  const backdropOpacity = useSharedValue(0);
  const loadingPulse = useSharedValue(0);

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

  const fallbackSuggestions = COMPANION_SUGGESTIONS[contextBucket];

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 300 });
      setStep('question');
      setSelectedMood(null);
      setSelectedMoodValue(0);
      setResponseText('');
      setAiSuggestions(null);
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, backdropOpacity]);

  // Pulse animation for loading state
  useEffect(() => {
    if (step === 'loading') {
      loadingPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      loadingPulse.value = 0;
    }
  }, [step, loadingPulse]);

  // Auto-close after response is shown
  useEffect(() => {
    if (step === 'response') {
      autoCloseTimerRef.current = setTimeout(() => {
        if (selectedMood) {
          onComplete({ mood: selectedMoodValue, moodLabel: selectedMood });
        }
      }, 5000);
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
    async (moodLabel: CompanionMoodLabel, moodValue: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedMood(moodLabel);
      setSelectedMoodValue(moodValue);

      // Push to recent companion check-ins
      addRecentCompanionCheckIn({
        mood: String(moodValue),
        moodLabel,
      });

      // Show loading state while AI generates response
      setStep('loading');

      // Determine time of day
      const hour = new Date().getHours();
      let timeOfDay: 'morning' | 'afternoon' | 'evening' = 'morning';
      if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
      else if (hour >= 17) timeOfDay = 'evening';

      // Determine AI context
      let aiContext: CompanionResponseContext = 'has_active_series';
      if (isFirstCompanionCheckIn) aiContext = 'first_time';
      else if (daysSinceLastOpen >= 3) aiContext = 'returning_after_gap';
      else if (!hasActiveSeries) aiContext = 'between_series';
      else if (streakCurrent > 0 && streakCurrent % 7 === 0) aiContext = 'streak_milestone';

      try {
        const aiResult = await generateCompanionResponse({
          mood: moodLabel as CompanionMood,
          companionName,
          userName,
          currentSeriesTheme,
          recentCheckIns: recentCompanionCheckIns,
          timeOfDay,
          context: aiContext,
        });

        if (aiResult) {
          setResponseText(aiResult.response);
          if (aiResult.suggestions.length >= 1) {
            setAiSuggestions(aiResult.suggestions);
          }
        } else {
          // Fallback to hardcoded responses
          const response = getCompanionResponse(moodLabel, contextBucket);
          setResponseText(response);
        }
      } catch {
        // Fallback to hardcoded responses on any error
        const response = getCompanionResponse(moodLabel, contextBucket);
        setResponseText(response);
      }

      setStep('response');
    },
    [
      contextBucket,
      companionName,
      userName,
      currentSeriesTheme,
      recentCompanionCheckIns,
      isFirstCompanionCheckIn,
      daysSinceLastOpen,
      hasActiveSeries,
      streakCurrent,
      addRecentCompanionCheckIn,
    ],
  );

  const activeSuggestions = aiSuggestions ?? fallbackSuggestions;

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

                  {/* Emotion pills -- 2 rows of 3 */}
                  <View style={styles.moodGrid}>
                    {COMPANION_MOODS.map(({ value, label }) => (
                      <MoodPill
                        key={label}
                        label={label}
                        onPress={() => handleMoodSelect(label as CompanionMoodLabel, value)}
                        accentColor={colors.accent}
                        textColor={colors.text}
                        isDark={isDark}
                      />
                    ))}
                  </View>
                </Animated.View>
              )}

              {step === 'loading' && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.stepContent}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 20 }}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: 14,
                        color: colors.textMuted,
                        marginTop: 12,
                      }}
                    >
                      ...
                    </Text>
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
                    {activeSuggestions.map((suggestion) => (
                      <SuggestionPill
                        key={suggestion}
                        label={suggestion}
                        onPress={() => handleSuggestion(suggestion)}
                        accentColor={colors.accent}
                        textColor={colors.text}
                      />
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

/** Mood pill with static style (avoids Pressable children render function bug) */
function MoodPill({
  label,
  onPress,
  accentColor,
  textColor,
  isDark,
}: {
  label: string;
  onPress: () => void;
  accentColor: string;
  textColor: string;
  isDark: boolean;
}) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
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
      android_ripple={{ color: accentColor + '30' }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={{
          fontFamily: FontFamily.uiMedium,
          fontSize: 14,
          color: isPressed ? accentColor : textColor,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Suggestion pill with static style (avoids Pressable children render function bug) */
function SuggestionPill({
  label,
  onPress,
  accentColor,
  textColor,
}: {
  label: string;
  onPress: () => void;
  accentColor: string;
  textColor: string;
}) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={{
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1.5,
        backgroundColor: accentColor + '25',
        borderColor: accentColor + '50',
      }}
      android_ripple={{ color: accentColor + '30' }}
    >
      <Text
        style={{
          fontFamily: FontFamily.uiMedium,
          fontSize: 13,
          color: isPressed ? textColor : accentColor,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
