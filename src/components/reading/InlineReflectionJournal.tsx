import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { AppState, View, Text, TextInput, Keyboard, TouchableOpacity, type ScrollView } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowRightIcon, NotePencilIcon } from 'phosphor-react-native';
import { FontFamily, FontSize as FontSizeTokens } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useUnfoldStore, FontSize } from '@/lib/store';
import { getReflectionTypography, type ReflectionTypography } from '@/lib/reflection-typography';
import { Typography } from '@/constants/typography';

import { preventOrphan } from '@/lib/cn';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import {
  createAutosaveController,
  shouldFlushAutosaveOnAppState,
  type AutosaveController,
} from '@/lib/autosave-controller';

type MeasurableTextInput = TextInput & {
  measureLayout?: (
    relativeToNativeNode: unknown,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail: () => void
  ) => void;
};

interface InlineReflectionJournalProps {
  questions: string[];
  devotionalId: string;
  dayNumber: number;
  onOpenFullJournal: (focusQuestion?: number) => void;
  fontSize?: FontSize;
  scrollViewRef?: RefObject<ScrollView | null>;
  onFocusInput?: (contentY: number) => void;
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
  scrollViewRef,
  onFocusInput,
}: InlineReflectionJournalProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const typography = getReflectionTypography(fontSize);
  const premiumPolicy = usePremiumAccessPolicy();
  const editable = premiumPolicy === 'granted';

  // Store actions
  const getJournalEntry = useUnfoldStore((s) => s.getJournalEntry);
  const addJournalEntry = useUnfoldStore((s) => s.addJournalEntry);
  const updateQuestionResponse = useUnfoldStore((s) => s.updateQuestionResponse);

  const existingEntry = getJournalEntry(devotionalId, dayNumber);
  const savedEntryRef = useRef<{
    devotionalId: string;
    dayNumber: number;
    entryId: string | null;
  }>({ devotionalId, dayNumber, entryId: existingEntry?.id ?? null });

  // Track which question is expanded
  // Auto-open the first question so users discover the inline journal
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  // Local response state (before debounced save)
  const [localResponses, setLocalResponses] = useState<Map<number, string>>(new Map());
  const localResponsesRef = useRef<Map<number, string>>(localResponses);
  localResponsesRef.current = localResponses;
  const hasPendingSaveRef = useRef(false);
  const pendingResponseRef = useRef<{
    index: number;
    question: string;
    response: string;
    devotionalId: string;
    dayNumber: number;
  } | null>(null);
  const flushPendingResponseRef = useRef<() => void>(() => {});
  const autoSaveControllerRef = useRef<AutosaveController | null>(null);
  if (!autoSaveControllerRef.current) {
    autoSaveControllerRef.current = createAutosaveController({
      save: () => flushPendingResponseRef.current(),
    });
  }
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefs = useRef<Map<number, TextInput | null>>(new Map());

  const questionsKey = useMemo(() => questions.join('\u001f'), [questions]);

  // Load day-scoped responses from store. This must also clear stale local state when
  // swiping from an answered day to an unanswered day, because the component instance
  // is reused across devotional days.
  useEffect(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    autoSaveControllerRef.current?.flush();
    pendingResponseRef.current = null;
    hasPendingSaveRef.current = false;

    const initial = new Map<number, string>();
    if (existingEntry?.questionResponses) {
      for (const qr of existingEntry.questionResponses) {
        const idx = questions.findIndex((q) => q === qr.question);
        if (idx >= 0) {
          initial.set(idx, qr.response);
        }
      }
    }

    savedEntryRef.current = {
      devotionalId,
      dayNumber,
      entryId: existingEntry?.id ?? null,
    };
    localResponsesRef.current = initial;
    setLocalResponses(initial);
  }, [devotionalId, dayNumber, questionsKey, questions]);

  // Ensure a journal entry exists to attach responses to
  const ensureEntry = useCallback(
    (targetDevotionalId = devotionalId, targetDayNumber = dayNumber): string | null => {
      const saved = savedEntryRef.current;
      if (
        saved.devotionalId === targetDevotionalId &&
        saved.dayNumber === targetDayNumber &&
        saved.entryId
      ) {
        return saved.entryId;
      }

      addJournalEntry({ devotionalId: targetDevotionalId, dayNumber: targetDayNumber, content: '' });
      const entry = getJournalEntry(targetDevotionalId, targetDayNumber);
      if (entry) {
        savedEntryRef.current = {
          devotionalId: targetDevotionalId,
          dayNumber: targetDayNumber,
          entryId: entry.id,
        };
        return entry.id;
      }
      return null;
    },
    [devotionalId, dayNumber, addJournalEntry, getJournalEntry]
  );

  // Auto-save a response after 800ms of inactivity
  const saveResponse = useCallback(
    (
      index: number,
      question: string,
      response: string,
      targetDevotionalId = devotionalId,
      targetDayNumber = dayNumber
    ) => {
      const entryId = ensureEntry(targetDevotionalId, targetDayNumber);
      if (entryId) {
        updateQuestionResponse(entryId, question, response);
      }
    },
    [devotionalId, dayNumber, ensureEntry, updateQuestionResponse]
  );
  const saveResponseRef = useRef(saveResponse);
  saveResponseRef.current = saveResponse;

  const flushPendingResponse = useCallback(() => {
    const pending = pendingResponseRef.current;
    if (!pending) return;

    saveResponseRef.current(
      pending.index,
      pending.question,
      pending.response,
      pending.devotionalId,
      pending.dayNumber
    );
    pendingResponseRef.current = null;
    hasPendingSaveRef.current = false;
  }, []);
  flushPendingResponseRef.current = flushPendingResponse;

  const handleResponseChange = useCallback(
    (index: number, question: string, text: string) => {
      setLocalResponses((prev) => {
        const next = new Map(prev);
        next.set(index, text);
        return next;
      });

      // Debounced save
      hasPendingSaveRef.current = true;
      pendingResponseRef.current = {
        index,
        question,
        response: text,
        devotionalId,
        dayNumber,
      };
      autoSaveControllerRef.current?.schedule();
    },
    [devotionalId, dayNumber]
  );

  const measureFocusedInput = useCallback(
    (index: number) => {
      const input = inputRefs.current.get(index) as MeasurableTextInput | null | undefined;
      const scrollView = scrollViewRef?.current;
      if (!input || !scrollView || typeof input.measureLayout !== 'function') return;

      input.measureLayout(
        scrollView,
        (_x, y) => {
          if (Number.isFinite(y)) {
            onFocusInput?.(y);
          }
        },
        () => {}
      );
    },
    [onFocusInput, scrollViewRef]
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
        // and layout settle before measuring against the reader scroll view.
        setExpandedIndex(index);
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        focusTimerRef.current = setTimeout(() => {
          inputRefs.current.get(index)?.focus();
          measureFocusedInput(index);
        }, 400);
      }
    },
    [expandedIndex, measureFocusedInput]
  );

  // Save any pending responses on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      autoSaveControllerRef.current?.cancel();
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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (shouldFlushAutosaveOnAppState(nextState)) {
        autoSaveControllerRef.current?.flush();
      }
    });

    return () => subscription.remove();
  }, []);

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
    <View style={{ marginTop: Spacing['12'] }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: Spacing['7'],
        }}
      >
        <Text
          style={{
            ...Typography.sectionHeader,
            color: colors.text,
            textAlign: 'center',
          }}
        >
          For Reflection
        </Text>
      </View>

      {/* Progress indicator */}
      {answeredCount > 0 && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}
          style={{
            alignItems: 'center',
            marginBottom: Spacing['5'],
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
            isDark={isDark}
            typography={typography}
            editable={editable}
            reducedMotion={reducedMotion ?? false}
          />
        );
      })}

      {/* Continue in Journal CTA */}
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out).delay(questions.length * 100 + 200)}
        style={{ marginTop: Spacing['5'], alignItems: 'center' }}
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
            gap: Spacing['2'],
            paddingVertical: 14,
            paddingHorizontal: Spacing['6'],
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: alpha(colors.accent, 0.25),
            backgroundColor: alpha(colors.accent, 0.03),
          }}
        >
          <NotePencilIcon size={16} color={colors.accent} weight="light" />
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSizeTokens.sm,
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
  isDark,
  typography,
  editable = true,
  reducedMotion = false,
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
  isDark: boolean;
  typography: ReflectionTypography;
  editable?: boolean;
  reducedMotion?: boolean;
}) {
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out).delay(index * 120)}
      style={{ marginBottom: isExpanded ? Spacing['6'] : Spacing['4'] }}
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
            },
          ]}
        >
          {/* Question text */}
          <Text
            style={{
              flex: 1,
              fontFamily: FontFamily.body,
              fontSize: typography.questionFontSize,
              color: colors.text,
              lineHeight: typography.questionLineHeight,
            }}
          >
            {preventOrphan(question)}
          </Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Expanded: TextInput area */}
      {isExpanded && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}
          style={{
            marginTop: Spacing['3'],
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              backgroundColor: colors.inputBackground,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: colors.borderFocused ?? colors.border,
              padding: 14,
            }}
          >
            <TextInput
              ref={(ref) => { inputRefs.current.set(index, ref); }}
              value={response}
              editable={editable}
              onChangeText={(text) => onResponseChange(index, question, text)}
              placeholder={editable ? 'Write your thoughts...' : 'Unlock Premium to journal your reflections'}
              placeholderTextColor={colors.textHint}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              multiline
              textAlignVertical="top"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              accessibilityLabel={`Your response to: ${question}`}
              accessibilityHint={editable ? 'Write your reflection. Auto-saved.' : 'Unlock Premium to write reflections.'}
              style={{
                minHeight: 80,
                fontFamily: FontFamily.body,
                fontSize: typography.responseFontSize,
                color: colors.text,
                lineHeight: typography.responseLineHeight,
                padding: 0,
              }}
            />
          </View>

          {/* Auto-save hint — only show for premium users */}
          {editable && (
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 11,
                color: colors.textHint,
                marginTop: Spacing['2'],
                textAlign: 'right',
              }}
            >
              Auto-saved
            </Text>
          )}
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
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            style={{
              marginLeft: 50,
              marginTop: 6,
              paddingRight: Spacing['4'],
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: typography.previewFontSize,
                color: colors.textMuted,
                lineHeight: typography.previewLineHeight,
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
