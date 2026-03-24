import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  SmileySadIcon,
  SmileyNervousIcon,
  SmileyBlankIcon,
  SmileyIcon,
  SmileyMehIcon,
  SmileyWinkIcon,
  HeartIcon,
  SunIcon,
  XIcon,
  PencilSimpleIcon,
} from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { CHECKIN_CELEBRATION_MESSAGES } from '@/constants/check-in-messages';
import { VoiceInputBar } from '@/components/VoiceInputBar';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.5;
const TOTAL_STEPS = 3;

type MoodValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const MOOD_LABELS: string[] = ['Struggling', 'Anxious', 'Tired', 'Low', 'Okay', 'Peaceful', 'Good', 'Grateful'];

const MOOD_OPTIONS: Array<{
  value: MoodValue;
  label: string;
  Icon: typeof SmileySadIcon;
}> = [
  { value: 1, label: 'Struggling', Icon: SmileySadIcon },
  { value: 2, label: 'Anxious', Icon: SmileyNervousIcon },
  { value: 3, label: 'Tired', Icon: SmileyBlankIcon },
  { value: 4, label: 'Low', Icon: SmileyMehIcon },
  { value: 5, label: 'Okay', Icon: SmileyIcon },
  { value: 6, label: 'Peaceful', Icon: SunIcon },
  { value: 7, label: 'Good', Icon: SmileyWinkIcon },
  { value: 8, label: 'Grateful', Icon: HeartIcon },
];

export interface CheckInSheetProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (data: {
    mood: MoodValue;
    moodLabel: string;
    chipAnswer?: string;
    freeText?: string;
  }) => void;
  question?: string;
  chips?: string[];
  devotionalId: string;
  dayNumber: number;
}

/** Step indicator dots rendered at the top of the sheet. */
function StepDots({
  currentStep,
  totalSteps,
  accentColor,
  mutedColor,
}: {
  currentStep: number;
  totalSteps: number;
  accentColor: string;
  mutedColor: string;
}) {
  return (
    <View style={styles.stepDotsContainer}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            {
              backgroundColor: i <= currentStep ? accentColor : mutedColor,
              width: i === currentStep ? 20 : 8,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Step 1 -- Mood Selection */
function MoodStep({
  onSelect,
  colors,
  isDark,
}: {
  onSelect: (mood: MoodValue) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}) {
  const [hoveredMood, setHoveredMood] = useState<MoodValue | null>(null);

  return (
    <Animated.View entering={FadeIn.duration(Duration.normal)} style={styles.stepContent}>
      <Text
        style={[
          styles.stepTitle,
          { color: colors.text, fontFamily: FontFamily.display },
        ]}
      >
        How are you today?
      </Text>
      <Text
        style={[
          styles.stepSubtitle,
          { color: colors.textMuted, fontFamily: FontFamily.body },
        ]}
      >
        Tap the one that fits
      </Text>
      <View style={styles.moodRow}>
        {MOOD_OPTIONS.map(({ value, label, Icon }) => {
          const isHovered = hoveredMood === value;
          return (
            <TouchableOpacity activeOpacity={0.7}
              key={value}
              onPressIn={() => setHoveredMood(value)}
              onPressOut={() => setHoveredMood(null)}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(value);
              }}
              style={[
                styles.moodItem,
                {
                  backgroundColor: isHovered
                    ? isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.04)'
                    : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Icon
                size={32}
                color={isHovered ? colors.accent : colors.textMuted}
                weight={isHovered ? 'fill' : 'light'}
              />
              <Text
                style={[
                  styles.moodLabel,
                  {
                    color: isHovered ? colors.text : colors.textMuted,
                    fontFamily: FontFamily.ui,
                  },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

/** Step 2 -- Question with chip answers */
function QuestionStep({
  question,
  chips,
  onSelectChip,
  colors,
  isDark,
}: {
  question: string;
  chips: string[];
  onSelectChip: (chip: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}) {
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const inputRef = useRef<TextInput>(null);
  const chipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (chipTimerRef.current) clearTimeout(chipTimerRef.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, []);

  const handleChipPress = useCallback(
    (chip: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedChip(chip);
      // Short delay so the user sees the selection before advancing
      if (chipTimerRef.current) clearTimeout(chipTimerRef.current);
      chipTimerRef.current = setTimeout(() => onSelectChip(chip), 300);
    },
    [onSelectChip]
  );

  const handleTypeOwn = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsTyping(true);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmitTyped = useCallback(() => {
    if (typedAnswer.trim().length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelectChip(typedAnswer.trim());
    }
  }, [typedAnswer, onSelectChip]);

  return (
    <Animated.View entering={FadeIn.duration(Duration.normal)} style={styles.stepContent}>
      <Text
        style={[
          styles.stepTitle,
          { color: colors.text, fontFamily: FontFamily.display },
        ]}
      >
        {question}
      </Text>

      <View style={styles.chipsContainer}>
        {chips.map((chip) => {
          const isSelected = selectedChip === chip;
          return (
            <TouchableOpacity activeOpacity={0.7}
              key={chip}
              onPress={() => handleChipPress(chip)}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected
                    ? colors.accent
                    : isDark
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(0,0,0,0.04)',
                  borderColor: isSelected
                    ? colors.accent
                    : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={chip}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isSelected ? '#FFFFFF' : colors.text,
                    fontFamily: isSelected
                      ? FontFamily.uiMedium
                      : FontFamily.ui,
                  },
                ]}
              >
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isTyping ? (
        <Animated.View entering={FadeIn.duration(Duration.normal)} style={styles.typeOwnContainer}>
          <TextInput
            ref={inputRef}
            value={typedAnswer}
            onChangeText={setTypedAnswer}
            placeholder="Type your answer..."
            placeholderTextColor={colors.textHint}
            style={[
              styles.typeOwnInput,
              {
                color: colors.text,
                backgroundColor: colors.inputBackground,
                borderColor: colors.borderFocused,
                fontFamily: FontFamily.body,
              },
            ]}
            returnKeyType="done"
            onSubmitEditing={handleSubmitTyped}
            maxLength={200}
            autoCorrect
          />
          <TouchableOpacity activeOpacity={0.7}
            onPress={handleSubmitTyped}
            disabled={typedAnswer.trim().length === 0}
            style={[
              styles.submitTypedButton,
              {
                backgroundColor:
                  typedAnswer.trim().length > 0
                    ? colors.accent
                    : colors.buttonBackground,
                opacity: typedAnswer.trim().length > 0 ? 1 : 0.5,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Submit answer"
            accessibilityState={{ disabled: typedAnswer.trim().length === 0 }}
          >
            <Text
              style={[
                styles.submitTypedText,
                {
                  color:
                    typedAnswer.trim().length > 0 ? '#FFFFFF' : colors.textMuted,
                  fontFamily: FontFamily.uiMedium,
                },
              ]}
            >
              Done
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <TouchableOpacity activeOpacity={0.7}
          onPress={handleTypeOwn}
          style={styles.typeOwnButton}
          accessibilityRole="button"
          accessibilityLabel="Type my own answer"
        >
          <PencilSimpleIcon size={16} color={colors.textMuted} weight="light" />
          <Text
            style={[
              styles.typeOwnText,
              { color: colors.textMuted, fontFamily: FontFamily.ui },
            ]}
          >
            Type my own
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

/** Step 3 -- Freeform note */
function NoteStep({
  onSubmit,
  onSkip,
  colors,
}: {
  onSubmit: (text: string) => void;
  onSkip: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [noteText, setNoteText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(noteText.trim());
  }, [noteText, onSubmit]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSkip();
  }, [onSkip]);

  return (
    <Animated.View entering={FadeIn.duration(Duration.normal)} style={styles.stepContent}>
      <Text
        style={[
          styles.stepTitle,
          { color: colors.text, fontFamily: FontFamily.display },
        ]}
      >
        Anything on your heart?
      </Text>
      <Text
        style={[
          styles.stepSubtitle,
          { color: colors.textMuted, fontFamily: FontFamily.body },
        ]}
      >
        Optional -- just for you
      </Text>

      <TextInput
        ref={inputRef}
        value={noteText}
        onChangeText={setNoteText}
        placeholder="Write or speak a thought, prayer, or feeling..."
        placeholderTextColor={colors.textHint}
        style={[
          styles.noteInput,
          {
            color: colors.text,
            backgroundColor: colors.inputBackground,
            borderColor: colors.border,
            fontFamily: FontFamily.body,
          },
        ]}
        multiline
        maxLength={500}
        textAlignVertical="top"
        autoCorrect
      />
      <VoiceInputBar value={noteText} onChangeText={setNoteText} />

      <View style={styles.noteActions}>
        <TouchableOpacity activeOpacity={0.7}
          onPress={handleSkip}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel="Skip this step"
        >
          <Text
            style={[
              styles.skipText,
              { color: colors.textMuted, fontFamily: FontFamily.uiMedium },
            ]}
          >
            Skip
          </Text>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7}
          onPress={handleSubmit}
          disabled={noteText.trim().length === 0}
          style={[
            styles.doneButton,
            {
              backgroundColor:
                noteText.trim().length > 0
                  ? colors.accent
                  : colors.buttonBackground,
              opacity: noteText.trim().length > 0 ? 1 : 0.5,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Submit note"
          accessibilityState={{ disabled: noteText.trim().length === 0 }}
        >
          <Text
            style={[
              styles.doneButtonText,
              {
                color:
                  noteText.trim().length > 0 ? '#FFFFFF' : colors.textMuted,
                fontFamily: FontFamily.uiSemiBold,
              },
            ]}
          >
            Done
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

/** Single character in the magic text reveal */
function MagicChar({ char, delay, colors }: { char: string; delay: number; colors: ReturnType<typeof useTheme>['colors'] }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
    scale.value = withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, [delay, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.Text
      style={[
        {
          fontFamily: FontFamily.body,
          fontSize: FontSize.xl,
          color: colors.text,
          lineHeight: 30,
        },
        style,
      ]}
    >
      {char}
    </Animated.Text>
  );
}

/** Gentle celebration shown within the sheet after completing check-in */
function CheckInCelebration({ colors, onDismiss }: { colors: ReturnType<typeof useTheme>['colors']; onDismiss: () => void }) {
  const message = useMemo(
    () => CHECKIN_CELEBRATION_MESSAGES[Math.floor(Math.random() * CHECKIN_CELEBRATION_MESSAGES.length)],
    []
  );

  // Generate staggered delays with slight randomness for a sparkle feel
  const charDelays = useMemo(() => {
    const delays: number[] = [];
    let cumulative = 400; // initial pause before text starts
    for (let i = 0; i < message.length; i++) {
      delays.push(cumulative);
      // Base interval per character + small random jitter
      cumulative += message[i] === ' ' ? 20 : 30 + Math.random() * 25;
    }
    return delays;
  }, [message]);

  return (
    <TouchableOpacity activeOpacity={1} onPress={onDismiss} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {message.split('').map((char, i) => (
          <MagicChar key={`${char}-${i}`} char={char} delay={charDelays[i]} colors={colors} />
        ))}
      </View>
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.xs,
          color: colors.textHint,
          marginTop: 28,
        }}
      >
        Tap anywhere to continue
      </Text>
    </TouchableOpacity>
  );
}

/**
 * CheckInSheet -- A 3-step bottom sheet for midday check-ins.
 *
 * Step 1: Mood selection (auto-advances on tap after 300ms).
 * Step 2: Question with tappable chips or freeform text input.
 * Step 3: Optional freeform note with Skip / Done.
 * Then: Brief celebration before dismissing.
 */
export function CheckInSheet({
  visible,
  onClose,
  onComplete,
  question = 'What are you carrying today?',
  chips = ['Work stress', 'Relationship', 'Health'],
  devotionalId: _devotionalId,
  dayNumber: _dayNumber,
}: CheckInSheetProps) {
  const { colors, isDark } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null);
  const [chipAnswer, setChipAnswer] = useState<string | undefined>(undefined);
  const [showCelebration, setShowCelebration] = useState(false);
  const completionDataRef = useRef<{
    mood: MoodValue;
    moodLabel: string;
    chipAnswer?: string;
    freeText?: string;
  } | null>(null);

  // Animated backdrop opacity
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: Duration.slow });
    } else {
      backdropOpacity.value = withTiming(0, { duration: Duration.normal });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Reset state when the sheet opens
  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
      setSelectedMood(null);
      setChipAnswer(undefined);
      setShowCelebration(false);
      completionDataRef.current = null;
    }
  }, [visible]);

  const handleMoodSelect = useCallback((mood: MoodValue) => {
    setSelectedMood(mood);
    // Auto-advance after a short delay so user sees their selection
    setTimeout(() => setCurrentStep(1), 300);
  }, []);

  const handleChipAnswer = useCallback((chip: string) => {
    setChipAnswer(chip);
    setTimeout(() => setCurrentStep(2), 300);
  }, []);

  const triggerCelebration = useCallback(
    (data: { mood: MoodValue; moodLabel: string; chipAnswer?: string; freeText?: string }) => {
      completionDataRef.current = data;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete(data);
      setShowCelebration(true);
    },
    [onComplete]
  );

  const handleNoteSubmit = useCallback(
    (text: string) => {
      if (selectedMood == null) return;
      triggerCelebration({
        mood: selectedMood,
        moodLabel: MOOD_LABELS[selectedMood - 1],
        chipAnswer,
        freeText: text.length > 0 ? text : undefined,
      });
    },
    [selectedMood, chipAnswer, triggerCelebration]
  );

  const handleNoteSkip = useCallback(() => {
    if (selectedMood == null) return;
    triggerCelebration({
      mood: selectedMood,
      moodLabel: MOOD_LABELS[selectedMood - 1],
      chipAnswer,
      freeText: undefined,
    });
  }, [selectedMood, chipAnswer, triggerCelebration]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        {/* Backdrop */}
        <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={handleClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.5)' },
              backdropStyle,
            ]}
          />
        </TouchableOpacity>

        {/* Sheet */}
        {visible && (
          <Animated.View
            entering={SlideInDown.duration(400).easing(Easing.out(Easing.cubic))}
            exiting={SlideOutDown.duration(Duration.normal)}
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
              <View
                style={[
                  styles.handleBar,
                  { backgroundColor: colors.textHint },
                ]}
              />
            </View>

            {/* Header row: step dots + close button */}
            <View style={styles.headerRow}>
              <StepDots
                currentStep={currentStep}
                totalSteps={TOTAL_STEPS}
                accentColor={colors.accent}
                mutedColor={
                  isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
                }
              />
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close check-in"
              >
                <XIcon size={20} color={colors.textMuted} weight="light" />
              </TouchableOpacity>
            </View>

            {/* Step content */}
            <View style={styles.stepContainer}>
              {showCelebration ? (
                <CheckInCelebration colors={colors} onDismiss={handleClose} />
              ) : (
                <>
                  {currentStep === 0 && (
                    <MoodStep
                      onSelect={handleMoodSelect}
                      colors={colors}
                      isDark={isDark}
                    />
                  )}
                  {currentStep === 1 && (
                    <QuestionStep
                      question={question}
                      chips={chips}
                      onSelectChip={handleChipAnswer}
                      colors={colors}
                      isDark={isDark}
                    />
                  )}
                  {currentStep === 2 && (
                    <NoteStep
                      onSubmit={handleNoteSubmit}
                      onSkip={handleNoteSkip}
                      colors={colors}
                    />
                  )}
                </>
              )}
            </View>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  /* Sheet card */
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
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

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
    paddingBottom: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },

  /* Step dots */
  stepDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    height: 4,
    borderRadius: 2,
  },

  /* Step content */
  stepContainer: {
    flex: 1,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: FontSize['2xl'],
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: FontSize.sm,
    marginBottom: Spacing['6'],
  },

  /* Mood row — wraps into 2 rows of 4 */
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    paddingTop: Spacing['2'],
    rowGap: 6,
  },
  moodItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: Radius.card,
    width: 76,
  },
  moodLabel: {
    fontSize: FontSize.xs,
    marginTop: Spacing['2'],
  },

  /* Chips */
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: Spacing['4'],
    marginBottom: Spacing['5'],
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FontSize.sm,
  },

  /* Type own answer */
  typeOwnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    paddingVertical: Spacing['2'],
  },
  typeOwnText: {
    fontSize: FontSize.sm,
  },
  typeOwnContainer: {
    gap: 10,
  },
  typeOwnInput: {
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: FontSize.sm,
  },
  submitTypedButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing['5'],
    paddingVertical: 10,
    borderRadius: Radius.xl,
  },
  submitTypedText: {
    fontSize: FontSize.sm,
  },

  /* Note step */
  noteInput: {
    height: 100,
    borderRadius: Radius.card,
    borderWidth: 1,
    paddingHorizontal: Spacing['4'],
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing['4'],
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: Spacing['4'],
  },
  skipText: {
    fontSize: FontSize.sm,
  },
  doneButton: {
    paddingHorizontal: Spacing['7'],
    paddingVertical: Spacing['3'],
    borderRadius: Radius['2xl'],
  },
  doneButtonText: {
    fontSize: FontSize.sm,
  },
});

export default CheckInSheet;
