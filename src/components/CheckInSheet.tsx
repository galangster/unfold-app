import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  useWindowDimensions,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  AccessibilityInfo,
  Keyboard,
  type LayoutChangeEvent,
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
  useReducedMotion,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
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
  CaretLeftIcon,
} from '@/components/icons';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adaptiveFrameStyle, adaptiveSafeGutterStyle, resolveAdaptiveLayout } from '@/lib/adaptive-layout';
import {
  CHECKIN_CELEBRATION_MESSAGES,
  CHECKIN_NOT_SAVED_REASON,
  CHECKIN_NOT_SAVED_TITLE,
  CHECKIN_NOT_SAVED_WORDS_HINT,
} from '@/constants/check-in-messages';
import { VoiceInputBar } from '@/components/VoiceInputBar';
import { alpha } from '@/components/ui';
import { SheetHandle } from '@/components/ui/SheetHandle';

// iOS may update glyph sizes before invalidating native text measurements.
// Remount text leaves on scale changes without resetting answers or inputs.
function CheckInText(props: React.ComponentProps<typeof Text>) {
  const { fontScale } = useWindowDimensions();
  return <Text key={fontScale} {...props} />;
}

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
  /**
   * Saves the answer. Returns false when it could not be saved: the sheet then
   * shows why, with the words the reader wrote, for as long as it stays visible.
   */
  onComplete: (data: {
    mood: MoodValue;
    moodLabel: string;
    chipAnswer?: string;
    freeText?: string;
  }) => boolean | void;
  question?: string;
  chips?: string[];
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
  const { fontScale } = useWindowDimensions();
  const moodWidth = 76 * Math.max(1, Math.min(fontScale, 1.8));
  const [hoveredMood, setHoveredMood] = useState<MoodValue | null>(null);
  // Persists the tapped mood so it stays visually selected through the
  // 300ms auto-advance delay, instead of only highlighting during the
  // press (onPressIn/onPressOut) window.
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null);
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={styles.stepContent}>
      <CheckInText
        style={[
          styles.stepTitle,
          { color: colors.text, fontFamily: FontFamily.display },
        ]}
      >
        How are you today?
      </CheckInText>
      <CheckInText
        style={[
          styles.stepSubtitle,
          { color: colors.textMuted, fontFamily: FontFamily.body },
        ]}
      >
        Tap the one that fits
      </CheckInText>
      <View
        style={styles.moodRow}
        accessibilityRole="radiogroup"
        accessibilityLabel="Mood"
      >
        {MOOD_OPTIONS.map(({ value, label, Icon }) => {
          const isSelected = selectedMood === value || hoveredMood === value;
          return (
            <TouchableOpacity activeOpacity={0.7}
              key={value}
              onPressIn={() => setHoveredMood(value)}
              onPressOut={() => setHoveredMood(null)}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedMood(value);
                onSelect(value);
              }}
              style={[
                styles.moodItem,
                { width: moodWidth },
                {
                  backgroundColor: isSelected
                    ? alpha(colors.text, isDark ? 0.08 : 0.04)
                    : 'transparent',
                },
              ]}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected: isSelected }}
            >
              <Icon
                size={32}
                color={isSelected ? colors.accent : colors.textMuted}
                weight={isSelected ? 'fill' : 'light'}
              />
              <CheckInText
                style={[
                  styles.moodLabel,
                  {
                    color: isSelected ? colors.text : colors.textMuted,
                    fontFamily: FontFamily.ui,
                  },
                ]}
              >
                {label}
              </CheckInText>
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
  onAnswer,
  colors,
  isDark,
}: {
  question: string;
  chips: string[];
  /** `typed` tells an answer the reader wrote from a suggestion they tapped. */
  onAnswer: (answer: string, typed: boolean) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}) {
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const inputRef = useRef<TextInput>(null);
  const chipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

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
      chipTimerRef.current = setTimeout(() => onAnswer(chip, false), 300);
    },
    [onAnswer]
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
      onAnswer(typedAnswer.trim(), true);
    }
  }, [typedAnswer, onAnswer]);

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={styles.stepContent}>
      <CheckInText
        style={[
          styles.stepTitle,
          { color: colors.text, fontFamily: FontFamily.display },
        ]}
      >
        {question}
      </CheckInText>

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
                    : alpha(colors.text, isDark ? 0.06 : 0.04),
                  borderColor: isSelected
                    ? colors.accent
                    : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={chip}
              accessibilityState={{ selected: isSelected }}
            >
              <CheckInText
                style={[
                  styles.chipText,
                  {
                    color: isSelected
                      ? colors.background
                      : colors.text,
                    fontFamily: isSelected
                      ? FontFamily.uiMedium
                      : FontFamily.ui,
                  },
                ]}
              >
                {chip}
              </CheckInText>
            </TouchableOpacity>
          );
        })}
      </View>

      {isTyping ? (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={styles.typeOwnContainer}>
          <TextInput
            ref={inputRef}
            value={typedAnswer}
            onChangeText={setTypedAnswer}
            placeholder="Type your answer..."
            placeholderTextColor={colors.textHint}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
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
            keyboardAppearance={isDark ? 'dark' : 'light'}
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
            <CheckInText
              style={[
                styles.submitTypedText,
                {
                  color:
                    typedAnswer.trim().length > 0
                      ? colors.background
                      : colors.textMuted,
                  fontFamily: FontFamily.uiMedium,
                },
              ]}
            >
              Done
            </CheckInText>
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
          <CheckInText
            style={[
              styles.typeOwnText,
              { color: colors.textMuted, fontFamily: FontFamily.ui },
            ]}
          >
            Type my own
          </CheckInText>
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
  isDark,
}: {
  onSubmit: (text: string) => void;
  onSkip: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}) {
  const [noteText, setNoteText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const reducedMotion = useReducedMotion();

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
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={styles.stepContent}>
      <CheckInText
        style={[
          styles.stepTitle,
          { color: colors.text, fontFamily: FontFamily.display },
        ]}
      >
        Anything on your heart?
      </CheckInText>
      <CheckInText
        style={[
          styles.stepSubtitle,
          { color: colors.textMuted, fontFamily: FontFamily.body },
        ]}
      >
        Optional -- just for you
      </CheckInText>

      <TextInput
        ref={inputRef}
        value={noteText}
        onChangeText={setNoteText}
        placeholder="Write or speak a thought, prayer, or feeling..."
        placeholderTextColor={colors.textHint}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
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
        keyboardAppearance={isDark ? 'dark' : 'light'}
      />
      <VoiceInputBar value={noteText} onChangeText={setNoteText} />

      <View style={styles.noteActions}>
        <TouchableOpacity activeOpacity={0.7}
          onPress={handleSkip}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel="Skip this step"
        >
          <CheckInText
            style={[
              styles.skipText,
              { color: colors.textMuted, fontFamily: FontFamily.uiMedium },
            ]}
          >
            Skip
          </CheckInText>
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
          <CheckInText
            style={[
              styles.doneButtonText,
              {
                color:
                  noteText.trim().length > 0
                    ? colors.background
                    : colors.textMuted,
                fontFamily: FontFamily.uiSemiBold,
              },
            ]}
          >
            Done
          </CheckInText>
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
  const reducedMotion = useReducedMotion();
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
        {reducedMotion ? (
          <CheckInText
            style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.xl,
              color: colors.text,
              lineHeight: 30,
              textAlign: 'center',
            }}
          >
            {message}
          </CheckInText>
        ) : (
          message.split('').map((char, i) => (
            <MagicChar key={`${char}-${i}`} char={char} delay={charDelays[i]} colors={colors} />
          ))
        )}
      </View>
      <CheckInText
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.xs,
          color: colors.textHint,
          marginTop: 28,
        }}
      >
        Tap anywhere to continue
      </CheckInText>
    </TouchableOpacity>
  );
}

function NotSavedButton({
  label,
  primary,
  onPress,
  colors,
}: {
  label: string;
  primary: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <TouchableOpacity activeOpacity={0.7}
      onPress={onPress}
      style={primary ? [styles.doneButton, { backgroundColor: colors.accent }] : styles.skipButton}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <CheckInText
        style={primary
          ? [styles.doneButtonText, { color: colors.background, fontFamily: FontFamily.uiSemiBold }]
          : [styles.skipText, { color: colors.textMuted, fontFamily: FontFamily.uiMedium }]}
      >
        {label}
      </CheckInText>
    </TouchableOpacity>
  );
}

const COPIED_MS = 2000;

/**
 * Shown in place of the steps when the answer could not be saved: the reason,
 * the words the reader wrote, and the actions. The actions stay in view below
 * the scrolling words.
 */
function NotSavedPanel({
  words,
  onClose,
  colors,
  bottomInset,
}: {
  words: string;
  onClose: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  bottomInset: number;
}) {
  const reducedMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const holdsWords = words.length > 0;
  const reason = holdsWords ? `${CHECKIN_NOT_SAVED_REASON} ${CHECKIN_NOT_SAVED_WORDS_HINT}` : CHECKIN_NOT_SAVED_REASON;

  // Says what the panel shows, and never the reader's words.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${CHECKIN_NOT_SAVED_TITLE}. ${reason}`);
  }, [reason]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  // The words go to the clipboard and nowhere else. A copy that fails leaves
  // them on screen, where the reader can copy again or select them.
  const handleCopy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Clipboard.setStringAsync(words).then((didCopy) => {
      if (!didCopy) return;
      setCopied(true);
      AccessibilityInfo.announceForAccessibility('Copied');
    }, () => undefined);
  }, [words]);

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.stepContainer, { paddingBottom: Spacing['4'] }]}>
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={styles.stepContent}>
          <CheckInText
            accessibilityRole="header"
            style={[
              styles.stepTitle,
              { color: colors.text, fontFamily: FontFamily.display },
            ]}
          >
            {CHECKIN_NOT_SAVED_TITLE}
          </CheckInText>
          <CheckInText
            style={[
              styles.notSavedReason,
              { color: colors.textMuted, fontFamily: FontFamily.body },
            ]}
          >
            {reason}
          </CheckInText>
          {holdsWords && (
            <View
              style={[
                styles.keptWords,
                { backgroundColor: colors.inputBackground, borderColor: colors.border },
              ]}
            >
              <CheckInText
                selectable
                style={[
                  styles.keptWordsText,
                  { color: colors.text, fontFamily: FontFamily.body },
                ]}
              >
                {words}
              </CheckInText>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.notSavedActions,
          {
            justifyContent: holdsWords ? 'space-between' : 'flex-end',
            paddingBottom: Spacing['4'] + bottomInset,
            borderTopColor: colors.border,
          },
        ]}
      >
        <NotSavedButton label="Close" primary={!holdsWords} onPress={onClose} colors={colors} />
        {holdsWords && (
          <NotSavedButton label={copied ? 'Copied' : 'Copy my words'} primary onPress={handleCopy} colors={colors} />
        )}
      </View>
    </>
  );
}

/**
 * CheckInSheet -- A 3-step bottom sheet for midday check-ins.
 *
 * Step 1: Mood selection (auto-advances on tap after 300ms).
 * Step 2: Question with tappable chips or freeform text input.
 * Step 3: Optional freeform note with Skip / Done.
 * Then: Brief celebration before dismissing. An answer the caller could not
 * save shows the reason instead, with the words the reader wrote.
 */
export function CheckInSheet({
  visible,
  onClose,
  onComplete,
  question = 'What are you carrying today?',
  chips = ['Work stress', 'Relationship', 'Health'],
}: CheckInSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: screenHeight, fontScale } = useWindowDimensions();
  const adaptiveLayout = resolveAdaptiveLayout({
    width: windowWidth,
    height: screenHeight,
    fontScale,
    insetLeft: insets.left,
    insetRight: insets.right,
  });
  const sheetMaxWidth = adaptiveLayout.sheetMaxWidth;
  const [containerHeight, setContainerHeight] = useState(0);
  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerHeight(event.nativeEvent.layout.height);
  }, []);
  const sheetHeight = Math.min(
    screenHeight * Math.min(0.85, 0.5 * Math.max(1, fontScale)),
    containerHeight || Math.max(0, screenHeight - insets.top),
  );
  const reducedMotion = useReducedMotion();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null);
  // A typed answer is the reader's own words. A tapped suggestion is not.
  const [answer, setAnswer] = useState<{ text: string; typed: boolean } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  // Set when the caller could not save the answer, with the words the reader
  // wrote: a typed answer and the note.
  const [notSaved, setNotSaved] = useState<{ words: string } | null>(null);

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

  // Auto-advance timer. Retained so a close/reopen inside the 300ms window
  // (or an unmount) cannot advance the freshly reset sheet.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearAdvanceTimer, [clearAdvanceTimer]);

  // Reset state when the sheet opens. A closed sheet keeps none of the
  // reader's words.
  useEffect(() => {
    if (visible) {
      clearAdvanceTimer();
      setCurrentStep(0);
      setSelectedMood(null);
      setShowCelebration(false);
    } else {
      setAnswer(null);
      setNotSaved(null);
    }
  }, [clearAdvanceTimer, visible]);

  const advanceAfterDelay = useCallback((step: number) => {
    clearAdvanceTimer();
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      setCurrentStep(step);
    }, 300);
  }, [clearAdvanceTimer]);

  const handleMoodSelect = useCallback((mood: MoodValue) => {
    setSelectedMood(mood);
    // Auto-advance after a short delay so user sees their selection
    advanceAfterDelay(1);
  }, [advanceAfterDelay]);

  const handleAnswer = useCallback((text: string, typed: boolean) => {
    setAnswer({ text, typed });
    advanceAfterDelay(2);
  }, [advanceAfterDelay]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep((step) => Math.max(0, step - 1));
  }, []);

  const submitCheckIn = useCallback(
    (data: { mood: MoodValue; moodLabel: string; chipAnswer?: string; freeText?: string }) => {
      // An answer that was not saved is no success: no haptic, no celebration.
      // The sheet says why and keeps the words the reader wrote.
      if (onComplete(data) === false) {
        Keyboard.dismiss();
        setNotSaved({ words: [answer?.typed ? answer.text : undefined, data.freeText].filter(Boolean).join('\n\n') });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCelebration(true);
    },
    [answer, onComplete]
  );

  const handleNoteSubmit = useCallback(
    (text: string) => {
      if (selectedMood == null) return;
      submitCheckIn({
        mood: selectedMood,
        moodLabel: MOOD_LABELS[selectedMood - 1],
        chipAnswer: answer?.text,
        freeText: text.length > 0 ? text : undefined,
      });
    },
    [selectedMood, answer, submitCheckIn]
  );

  const handleNoteSkip = useCallback(() => {
    if (selectedMood == null) return;
    submitCheckIn({
      mood: selectedMood,
      moodLabel: MOOD_LABELS[selectedMood - 1],
      chipAnswer: answer?.text,
      freeText: undefined,
    });
  }, [selectedMood, answer, submitCheckIn]);

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
        <View style={[styles.modalContainer, { width: '100%', marginTop: insets.top }]} onLayout={handleContainerLayout}>
        {/* Backdrop. A stray tap must not drop words that exist only in this sheet. */}
        <TouchableOpacity
          testID="check-in-backdrop"
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={notSaved?.words ? undefined : handleClose}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: alpha('#000000', 0.5) },
              backdropStyle,
            ]}
          />
        </TouchableOpacity>

        {/* Sheet */}
        {visible && (
          <View pointerEvents="box-none" style={[adaptiveSafeGutterStyle(insets.left, insets.right), { width: '100%' }]}>
          <Animated.View
            accessibilityViewIsModal
            onAccessibilityEscape={handleClose}
            entering={reducedMotion ? undefined : SlideInDown.duration(Duration.normal).easing(Ease.out)}
            exiting={reducedMotion ? undefined : SlideOutDown.duration(Duration.fast).easing(Ease.out)}
            style={[
              styles.sheet,
              adaptiveFrameStyle(sheetMaxWidth),
              {
                height: sheetHeight,
                backgroundColor: isDark
                  ? colors.backgroundElevated
                  : colors.backgroundPure,
                borderColor: colors.border,
              },
            ]}
          >
            <SheetHandle />

            {/* Header row: back + step dots + close button. The steps are over once an answer was not saved. */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {!showCelebration && !notSaved && currentStep > 0 && (
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={handleBack}
                    style={styles.backButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                  >
                    <CaretLeftIcon size={18} color={colors.textMuted} weight="light" />
                  </TouchableOpacity>
                )}
                {!notSaved && (
                  <StepDots
                    currentStep={currentStep}
                    totalSteps={TOTAL_STEPS}
                    accentColor={colors.accent}
                    mutedColor={alpha(colors.text, isDark ? 0.12 : 0.08)}
                  />
                )}
              </View>
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleClose}
                style={styles.closeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close check-in"
              >
                <XIcon size={20} color={colors.textMuted} weight="light" />
              </TouchableOpacity>
            </View>

            {/* Step content */}
            {notSaved ? (
              <NotSavedPanel words={notSaved.words} onClose={handleClose} colors={colors} bottomInset={insets.bottom} />
            ) : (
              <ScrollView key={showCelebration ? 'celebration' : currentStep} style={{ flex: 1 }} contentContainerStyle={[styles.stepContainer, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
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
                        onAnswer={handleAnswer}
                        colors={colors}
                        isDark={isDark}
                      />
                    )}
                    {currentStep === 2 && (
                      <NoteStep
                        onSubmit={handleNoteSubmit}
                        onSkip={handleNoteSkip}
                        colors={colors}
                        isDark={isDark}
                      />
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </Animated.View>
          </View>
        )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },

  /* Sheet card */
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  backButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
  },
  stepContent: {
    flexGrow: 1,
  },
  stepTitle: {
    fontSize: 21,
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
    textAlign: 'center',
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
    minHeight: 44,
    paddingVertical: 10,
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

  /* Answer that was not saved */
  notSavedReason: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing['4'],
  },
  keptWords: {
    borderRadius: Radius.card,
    borderWidth: 1,
    paddingHorizontal: Spacing['4'],
    paddingVertical: 14,
  },
  keptWordsText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  notSavedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default CheckInSheet;
