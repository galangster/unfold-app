import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, Keyboard, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CheckCircleIcon, PencilSimpleLineIcon, ArrowRightIcon, NotePencilIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useUnfoldStore, FONT_SIZE_VALUES, FontSize } from '@/lib/store';
import { useReadingFont } from '@/lib/useReadingFont';
import { preventOrphan } from '@/lib/cn';

interface InlineReflectionJournalProps {
  questions: string[];
  devotionalId: string;
  dayNumber: number;
  onOpenFullJournal: (focusQuestion?: number) => void;
  fontSize?: FontSize;
}

/**
 * Interactive inline reflection journal that appears in the reading screen.
 * Each question is a tappable prompt that reveals a TextInput for quick capture.
 * Responses auto-save to the same store used by the full journal editor.
 */
export function InlineReflectionJournal({
  questions,
  devotionalId,
  dayNumber,
  onOpenFullJournal,
  fontSize = 'medium',
}: InlineReflectionJournalProps) {
  const { colors } = useTheme();
  const readingFont = useReadingFont();
  const fontSizes = FONT_SIZE_VALUES[fontSize];

  // Store actions
  const getJournalEntry = useUnfoldStore((s) => s.getJournalEntry);
  const addJournalEntry = useUnfoldStore((s) => s.addJournalEntry);
  const updateQuestionResponse = useUnfoldStore((s) => s.updateQuestionResponse);

  const existingEntry = getJournalEntry(devotionalId, dayNumber);
  const savedEntryIdRef = useRef<string | null>(existingEntry?.id ?? null);

  // Track which question is expanded
  // Auto-open the first question so users discover the inline journal
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  // Local response state (before debounced save)
  const [localResponses, setLocalResponses] = useState<Map<number, string>>(new Map());
  const localResponsesRef = useRef<Map<number, string>>(localResponses);
  localResponsesRef.current = localResponses;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSaveRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefs = useRef<Map<number, TextInput | null>>(new Map());

  // Load existing responses from store
  useEffect(() => {
    if (existingEntry?.questionResponses) {
      const initial = new Map<number, string>();
      for (const qr of existingEntry.questionResponses) {
        const idx = questions.findIndex((q) => q === qr.question);
        if (idx >= 0) {
          initial.set(idx, qr.response);
        }
      }
      if (initial.size > 0) {
        setLocalResponses(initial);
      }
    }
  }, [existingEntry?.id]);

  // Ensure a journal entry exists to attach responses to
  const ensureEntry = useCallback((): string | null => {
    if (savedEntryIdRef.current) return savedEntryIdRef.current;

    addJournalEntry({ devotionalId, dayNumber, content: '' });
    const entry = getJournalEntry(devotionalId, dayNumber);
    if (entry) {
      savedEntryIdRef.current = entry.id;
      return entry.id;
    }
    return null;
  }, [devotionalId, dayNumber, addJournalEntry, getJournalEntry]);

  // Auto-save a response after 800ms of inactivity
  const saveResponse = useCallback(
    (index: number, question: string, response: string) => {
      const entryId = ensureEntry();
      if (entryId) {
        updateQuestionResponse(entryId, question, response);
      }
    },
    [ensureEntry, updateQuestionResponse]
  );
  const saveResponseRef = useRef(saveResponse);
  saveResponseRef.current = saveResponse;

  const handleResponseChange = useCallback(
    (index: number, question: string, text: string) => {
      setLocalResponses((prev) => {
        const next = new Map(prev);
        next.set(index, text);
        return next;
      });

      // Debounced save
      hasPendingSaveRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveResponse(index, question, text);
        hasPendingSaveRef.current = false;
      }, 800);
    },
    [saveResponse]
  );

  const handleQuestionTap = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (expandedIndex === index) {
        // Collapse
        Keyboard.dismiss();
        setExpandedIndex(null);
      } else {
        // Expand and focus — 400ms delay lets the expand animation finish
        // and layout settle so KeyboardAwareScrollView can measure properly
        setExpandedIndex(index);
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        focusTimerRef.current = setTimeout(() => {
          inputRefs.current.get(index)?.focus();
        }, 400);
      }
    },
    [expandedIndex]
  );

  // Save any pending responses on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Flush all local responses on unmount if there's a pending debounced save.
      // Uses refs to access the latest values (not stale closure from mount time).
      // Saves empty responses too so deletions persist.
      if (hasPendingSaveRef.current) {
        localResponsesRef.current.forEach((response, index) => {
          if (index < questions.length) {
            saveResponseRef.current(index, questions[index], response);
          }
        });
      }
    };
  }, [questions]);

  const getResponse = useCallback(
    (index: number, question: string): string => {
      const local = localResponses.get(index);
      if (local != null) return local;
      if (existingEntry?.questionResponses) {
        const persisted = existingEntry.questionResponses.find((qr) => qr.question === question);
        if (persisted) return persisted.response;
      }
      return '';
    },
    [localResponses, existingEntry]
  );

  const answeredCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < questions.length; i++) {
      const response = getResponse(i, questions[i]);
      if (response.trim().length > 0) count++;
    }
    return count;
  }, [questions, getResponse]);

  return (
    <View style={{ marginTop: 48 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
        }}
      >
        <View style={{ width: 32, height: 0.5, backgroundColor: colors.accent, opacity: 0.4 }} />
        <Text
          style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: 10,
            color: colors.accent,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            textAlign: 'center',
            marginHorizontal: 14,
            opacity: 0.75,
          }}
        >
          For Reflection
        </Text>
        <View style={{ width: 32, height: 0.5, backgroundColor: colors.accent, opacity: 0.4 }} />
      </View>

      {/* Progress indicator */}
      {answeredCount > 0 && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={{
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 11,
              color: answeredCount === questions.length ? colors.accent : colors.textSubtle,
              letterSpacing: 0.3,
            }}
          >
            {answeredCount} of {questions.length} reflected on
          </Text>
        </Animated.View>
      )}

      {/* Questions */}
      {questions.map((question, index) => {
        const isExpanded = expandedIndex === index;
        const response = getResponse(index, question);
        const isAnswered = response.trim().length > 0;

        return (
          <ReflectionQuestionCard
            key={question}
            index={index}
            question={question}
            isExpanded={isExpanded}
            isAnswered={isAnswered}
            response={response}
            onTap={handleQuestionTap}
            onResponseChange={handleResponseChange}
            inputRefs={inputRefs}
            colors={colors}
            readingFont={readingFont}
            fontSizes={fontSizes}
          />
        );
      })}

      {/* Continue in Journal CTA */}
      <Animated.View
        entering={FadeIn.duration(400).delay(questions.length * 100 + 200)}
        style={{ marginTop: 20, alignItems: 'center' }}
      >
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenFullJournal();
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: alpha(colors.accent, 0.25),
            backgroundColor: alpha(colors.accent, 0.03),
          }}
        >
          <NotePencilIcon size={16} color={colors.accent} weight="light" />
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 14,
              color: colors.accent,
            }}
          >
            Continue in Journal
          </Text>
          <ArrowRightIcon size={14} color={colors.accent} weight="light" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

/**
 * Individual reflection question card with expand/collapse and inline TextInput.
 */
function ReflectionQuestionCard({
  index,
  question,
  isExpanded,
  isAnswered,
  response,
  onTap,
  onResponseChange,
  inputRefs,
  colors,
  readingFont,
  fontSizes,
}: {
  index: number;
  question: string;
  isExpanded: boolean;
  isAnswered: boolean;
  response: string;
  onTap: (index: number) => void;
  onResponseChange: (index: number, question: string, text: string) => void;
  inputRefs: React.MutableRefObject<Map<number, TextInput | null>>;
  colors: any;
  readingFont: any;
  fontSizes: { body: number; scripture: number; title: number };
}) {
  // Animate border accent
  const borderProgress = useSharedValue(isAnswered ? 1 : 0);

  useEffect(() => {
    borderProgress.value = withTiming(isAnswered ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [isAnswered]);

  const borderStyle = useAnimatedStyle(() => ({
    borderLeftColor: borderProgress.value > 0.5 ? colors.accent : alpha(colors.border, 0.38),
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 120)}
      style={{ marginBottom: isExpanded ? 24 : 16 }}
    >
      {/* Question — tappable */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onTap(index)}
        accessibilityRole="button"
        accessibilityLabel={`Reflection question ${index + 1}: ${question}`}
        accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to write your thoughts'}
        accessibilityState={{ expanded: isExpanded }}
      >
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'flex-start',
              paddingLeft: 18,
              paddingRight: 8,
              paddingVertical: 4,
              borderLeftWidth: 2.5,
            },
            borderStyle,
          ]}
        >
          {/* Status icon */}
          <View style={{ marginTop: 3, marginRight: 12, width: 18 }}>
            {isAnswered ? (
              <CheckCircleIcon size={16} color={colors.accent} weight="fill" />
            ) : (
              <PencilSimpleLineIcon
                size={15}
                color={isExpanded ? colors.accent : colors.textHint}
                weight="light"
              />
            )}
          </View>

          {/* Question text */}
          <Text
            style={{
              flex: 1,
              fontFamily: readingFont.bodyItalic,
              fontSize: fontSizes.body,
              color: colors.text,
              lineHeight: fontSizes.body * 1.7,
              opacity: 0.9,
            }}
          >
            {preventOrphan(question)}
          </Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Expanded: TextInput area */}
      {isExpanded && (
        <Animated.View
          entering={FadeInDown.duration(250)}
          style={{
            marginLeft: 18,
            marginTop: 12,
            paddingLeft: 30,
          }}
        >
          <View
            style={{
              backgroundColor: colors.inputBackground,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.borderFocused ?? colors.border,
              padding: 14,
            }}
          >
            <TextInput
              ref={(ref) => { inputRefs.current.set(index, ref); }}
              value={response}
              onChangeText={(text) => onResponseChange(index, question, text)}
              placeholder="Write your thoughts..."
              placeholderTextColor={colors.textHint}
              multiline
              textAlignVertical="top"
              accessibilityLabel={`Your response to: ${question}`}
              accessibilityHint="Write your reflection. Auto-saved."
              style={{
                minHeight: 80,
                fontFamily: FontFamily.body,
                fontSize: fontSizes.body,
                color: colors.text,
                lineHeight: fontSizes.body * 1.6,
                padding: 0,
              }}
            />
          </View>

          {/* Auto-save hint */}
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 11,
              color: colors.textHint,
              marginTop: 8,
              textAlign: 'right',
            }}
          >
            Auto-saved
          </Text>
        </Animated.View>
      )}

      {/* Collapsed: Show response preview if answered — tap to re-open editing */}
      {!isExpanded && isAnswered && (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => onTap(index)}
          accessibilityRole="button"
          accessibilityLabel={`Edit your response to question ${index + 1}`}
          accessibilityHint="Tap to edit your response"
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              marginLeft: 50,
              marginTop: 6,
              paddingRight: 16,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: fontSizes.body - 2,
                color: colors.textMuted,
                lineHeight: (fontSizes.body - 2) * 1.5,
              }}
              numberOfLines={2}
            >
              {response}
            </Text>
          </Animated.View>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
