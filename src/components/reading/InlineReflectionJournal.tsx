/** @jsxImportSource react */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { AppState, View, TextInput, Keyboard, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { ReaderText as Text } from './ReaderText';
import type { ReflectionKeyboardToolbarState } from './ReflectionQuestionNav';
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretDownIcon, CaretUpIcon } from '@/components/icons';
import { FontFamily, FontSize as FontSizeTokens } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import {
  flushUnfoldStorePersist,
  flushUnfoldStorePersistAsync,
  useUnfoldStore,
  FontSize,
} from '@/lib/store';
import { getReflectionTypography, type ReflectionTypography } from '@/lib/reflection-typography';
import { preventOrphan } from '@/lib/cn';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import {
  createAutosaveController,
  shouldFlushAutosaveOnAppState,
  type AutosaveController,
} from '@/lib/autosave-controller';
import { reflectionCheckMode } from '@/lib/meaningful-motion';
import { DrawnCheck } from '@/components/motion/DrawnCheck';

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
  scrollContentRef?: RefObject<View | null>;
  onFocusInput?: (contentY: number) => void;
  layoutCommitSignal?: number;
  onKeyboardToolbarChange?: (toolbar: ReflectionKeyboardToolbarState | null) => void;
}

type ReflectionSaveState = 'saving' | 'saved' | 'error';

type PendingResponse = {
  index: number;
  question: string;
  response: string;
  devotionalId: string;
  dayNumber: number;
  revision: number;
};

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
  scrollContentRef,
  onFocusInput,
  layoutCommitSignal,
  onKeyboardToolbarChange,
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
  const [saveStatuses, setSaveStatuses] = useState<Map<number, ReflectionSaveState>>(new Map());
  const [persistedResponses, setPersistedResponses] = useState<Map<number, boolean>>(new Map());
  const [checkSignals, setCheckSignals] = useState<Map<number, { finishRevision: number | null; savedRevision: number | null }>>(new Map());
  const localResponsesRef = useRef<Map<number, string>>(localResponses);
  localResponsesRef.current = localResponses;
  const hasPendingSaveRef = useRef(false);
  const pendingResponseRef = useRef<PendingResponse | null>(null);
  const failedResponsesRef = useRef<Map<number, PendingResponse>>(new Map());
  const latestRevisionsRef = useRef<Map<number, number>>(new Map());
  const revisionCounterRef = useRef(0);
  const currentScopeRef = useRef({ devotionalId, dayNumber });
  currentScopeRef.current = { devotionalId, dayNumber };
  const isMountedRef = useRef(true);
  const flushPendingResponseRef = useRef<() => void>(() => {});
  const autoSaveControllerRef = useRef<AutosaveController | null>(null);
  if (!autoSaveControllerRef.current) {
    autoSaveControllerRef.current = createAutosaveController({
      save: () => flushPendingResponseRef.current(),
    });
  }
  const laidOutInputsRef = useRef(new Set<number>());
  const inputRefs = useRef<Map<number, TextInput | null>>(new Map());
  const focusedInputIndexRef = useRef<number | null>(null);
  const measurementRequestRef = useRef(0);
  const [heldIndex, setHeldIndex] = useState<number | null>(null);
  const [navFocusIndex, setNavFocusIndex] = useState<number | null>(null);
  const [toolbarActive, setToolbarActive] = useState(false);
  const heldIndexRef = useRef<number | null>(null);
  const navFocusIndexRef = useRef<number | null>(null);
  heldIndexRef.current = heldIndex;

  const questionsKey = useMemo(() => questions.join('\u001f'), [questions]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      focusedInputIndexRef.current = null;
      measurementRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    focusedInputIndexRef.current = null;
    measurementRequestRef.current += 1;
  }, [devotionalId, dayNumber, questionsKey]);

  // Load day-scoped responses from store. This must also clear stale local state when
  // swiping from an answered day to an unanswered day, because the component instance
  // is reused across devotional days.
  useEffect(() => {
    navFocusIndexRef.current = null;
    heldIndexRef.current = null;
    laidOutInputsRef.current.clear();
    setNavFocusIndex(null);
    setHeldIndex(null);
    setToolbarActive(false);
    autoSaveControllerRef.current?.flush();
    latestRevisionsRef.current.clear();
    pendingResponseRef.current = null;
    failedResponsesRef.current.clear();
    hasPendingSaveRef.current = false;
    setCheckSignals(new Map());

    const initial = new Map<number, string>();
    const persisted = new Map<number, boolean>();
    const initialStatuses = new Map<number, ReflectionSaveState>();
    if (existingEntry?.questionResponses) {
      for (const qr of existingEntry.questionResponses) {
        const idx = questions.findIndex((q) => q === qr.question);
        if (idx >= 0) {
          initial.set(idx, qr.response);
          if (qr.response.trim().length > 0) {
            persisted.set(idx, true);
            initialStatuses.set(idx, 'saved');
          }
        }
      }
    }
    setPersistedResponses(persisted);
    setSaveStatuses(initialStatuses);

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

      // Returns the day's entry id — the existing one when it already exists.
      const entryId = addJournalEntry({
        devotionalId: targetDevotionalId,
        dayNumber: targetDayNumber,
        content: '',
      });
      savedEntryRef.current = {
        devotionalId: targetDevotionalId,
        dayNumber: targetDayNumber,
        entryId,
      };
      return entryId;
    },
    [devotionalId, dayNumber, addJournalEntry]
  );

  const isCurrentSaveAttempt = useCallback((pending: PendingResponse): boolean => {
    const currentScope = currentScopeRef.current;
    return (
      isMountedRef.current &&
      latestRevisionsRef.current.get(pending.index) === pending.revision &&
      currentScope.devotionalId === pending.devotionalId &&
      currentScope.dayNumber === pending.dayNumber
    );
  }, []);

  // Auto-save a response after 800ms of inactivity
  const saveResponse = useCallback(
    async (
      index: number,
      question: string,
      response: string,
      targetDevotionalId = devotionalId,
      targetDayNumber = dayNumber,
      revision = latestRevisionsRef.current.get(index) ?? ++revisionCounterRef.current,
    ) => {
      const pending: PendingResponse = {
        index,
        question,
        response,
        devotionalId: targetDevotionalId,
        dayNumber: targetDayNumber,
        revision,
      };

      try {
        const entryId = ensureEntry(targetDevotionalId, targetDayNumber);
        if (!entryId) throw new Error('Journal entry unavailable');
        updateQuestionResponse(entryId, question, response);
        const wrote = await flushUnfoldStorePersistAsync();
        if (!wrote) throw new Error('Journal persistence unavailable');

        if (isCurrentSaveAttempt(pending)) {
          failedResponsesRef.current.delete(index);
          setSaveStatuses((current) => new Map(current).set(index, 'saved'));
          setCheckSignals((current) => {
            const next = new Map(current);
            const previous = next.get(index) ?? { finishRevision: null, savedRevision: null };
            next.set(index, { ...previous, savedRevision: pending.revision });
            return next;
          });
        }
      } catch {
        if (isCurrentSaveAttempt(pending)) {
          failedResponsesRef.current.set(index, pending);
          setSaveStatuses((current) => new Map(current).set(index, 'error'));
        }
      }
    },
    [devotionalId, dayNumber, ensureEntry, isCurrentSaveAttempt, updateQuestionResponse]
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
      pending.dayNumber,
      pending.revision,
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
      const revision = ++revisionCounterRef.current;
      latestRevisionsRef.current.set(index, revision);
      hasPendingSaveRef.current = true;
      failedResponsesRef.current.delete(index);
      setSaveStatuses((current) => new Map(current).set(index, 'saving'));
      pendingResponseRef.current = {
        index,
        question,
        response: text,
        devotionalId,
        dayNumber,
        revision,
      };
      autoSaveControllerRef.current?.schedule();
    },
    [devotionalId, dayNumber]
  );

  const handleRetrySave = useCallback((index: number) => {
    const failed = failedResponsesRef.current.get(index);
    if (!failed) return;

    setSaveStatuses((current) => new Map(current).set(index, 'saving'));
    void saveResponseRef.current(
      failed.index,
      failed.question,
      failed.response,
      failed.devotionalId,
      failed.dayNumber,
      failed.revision,
    );
  }, []);

  const measureFocusedInput = useCallback(
    (index: number) => {
      const request = ++measurementRequestRef.current;
      const input = inputRefs.current.get(index) as MeasurableTextInput | null | undefined;
      const scrollContent = scrollContentRef?.current;
      if (!input || !scrollContent || typeof input.measureLayout !== 'function') return;

      input.measureLayout(
        scrollContent,
        (_x, y) => {
          if (
            measurementRequestRef.current === request
            && focusedInputIndexRef.current === index
            && Number.isFinite(y)
          ) {
            onFocusInput?.(y);
          }
        },
        () => {}
      );
    },
    [onFocusInput, scrollContentRef]
  );

  useEffect(() => {
    if (layoutCommitSignal === undefined) return;
    const focusedIndex = focusedInputIndexRef.current;
    if (focusedIndex !== null) measureFocusedInput(focusedIndex);
  }, [layoutCommitSignal, measureFocusedInput]);

  const handleInputFocus = useCallback((index: number) => {
    focusedInputIndexRef.current = index;
    if (navFocusIndexRef.current === index) {
      navFocusIndexRef.current = null;
      heldIndexRef.current = null;
      setNavFocusIndex(null);
      setHeldIndex(null);
    }
    setToolbarActive(true);
    measureFocusedInput(index);
  }, [measureFocusedInput]);

  const handleInputBlur = useCallback((index: number) => {
    if (focusedInputIndexRef.current === index) {
      focusedInputIndexRef.current = null;
      measurementRequestRef.current += 1;
      if (navFocusIndexRef.current === null && heldIndexRef.current === null) {
        setToolbarActive(false);
      }
    }

    const latest = latestRevisionsRef.current.get(index);
    if (latest == null) return;

    setCheckSignals((current) => {
      const next = new Map(current);
      const previous = next.get(index) ?? { finishRevision: null, savedRevision: null };
      next.set(index, { ...previous, finishRevision: latest });
      return next;
    });

    if (pendingResponseRef.current?.index === index) {
      autoSaveControllerRef.current?.flush();
    }
  }, []);

  const cancelPendingFocus = useCallback(() => {
    navFocusIndexRef.current = null;
    heldIndexRef.current = null;
    setNavFocusIndex(null);
    setHeldIndex(null);
  }, []);

  const handleInputRef = useCallback((index: number, input: TextInput | null) => {
    inputRefs.current.set(index, input);
    if (!input) laidOutInputsRef.current.delete(index);
  }, []);

  const handleInputReady = useCallback((index: number) => {
    laidOutInputsRef.current.add(index);
    if (navFocusIndexRef.current === index) inputRefs.current.get(index)?.focus();
  }, []);

  // An already mounted field may not emit another layout event.
  useEffect(() => {
    if (navFocusIndex !== null && laidOutInputsRef.current.has(navFocusIndex)) {
      inputRefs.current.get(navFocusIndex)?.focus();
    }
  }, [navFocusIndex]);

  const expandQuestion = useCallback((index: number) => {
    autoSaveControllerRef.current?.flush();
    const outgoing = focusedInputIndexRef.current;
    heldIndexRef.current = outgoing !== index ? outgoing : null;
    setHeldIndex(heldIndexRef.current);
    navFocusIndexRef.current = index;
    setNavFocusIndex(index);
    setExpandedIndex(index);
  }, []);

  const handleQuestionTap = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (expandedIndex !== null) {
        autoSaveControllerRef.current?.flush();
      }

      if (expandedIndex === index) {
        cancelPendingFocus();
        setToolbarActive(false);
        if (focusedInputIndexRef.current === index) {
          focusedInputIndexRef.current = null;
          measurementRequestRef.current += 1;
        }
        Keyboard.dismiss();
        setExpandedIndex(null);
      } else {
        expandQuestion(index);
      }
    },
    [cancelPendingFocus, expandQuestion, expandedIndex]
  );

  const handlePreviousQuestion = useCallback(() => {
    if (expandedIndex === null || expandedIndex <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    expandQuestion(expandedIndex - 1);
  }, [expandQuestion, expandedIndex]);

  const handleNextQuestion = useCallback(() => {
    if (expandedIndex === null || expandedIndex >= questions.length - 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    expandQuestion(expandedIndex + 1);
  }, [expandQuestion, expandedIndex, questions.length]);

  const handleDoneEditing = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cancelPendingFocus();
    focusedInputIndexRef.current = null;
    measurementRequestRef.current += 1;
    setToolbarActive(false);
    autoSaveControllerRef.current?.flush();
    Keyboard.dismiss();
  }, [cancelPendingFocus]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      cancelPendingFocus();
      focusedInputIndexRef.current = null;
      setToolbarActive(false);
      autoSaveControllerRef.current?.flush();
    });
    return () => subscription.remove();
  }, [cancelPendingFocus]);

  useEffect(() => {
    if (!onKeyboardToolbarChange) return;
    if (!toolbarActive || expandedIndex === null) {
      onKeyboardToolbarChange(null);
      return;
    }
    onKeyboardToolbarChange({
      questionIndex: expandedIndex,
      questionCount: questions.length,
      onPrevious: handlePreviousQuestion,
      onNext: handleNextQuestion,
      onDone: handleDoneEditing,
    });
  }, [
    expandedIndex,
    handleDoneEditing,
    handleNextQuestion,
    handlePreviousQuestion,
    onKeyboardToolbarChange,
    questions.length,
    toolbarActive,
  ]);

  // Save any pending responses on unmount
  useEffect(() => {
    return () => {
      onKeyboardToolbarChange?.(null);
      navFocusIndexRef.current = null;
      heldIndexRef.current = null;
      autoSaveControllerRef.current?.cancel();
      // Flush all local responses on unmount if there's a pending debounced save.
      // Uses refs to access the latest values (not stale closure from mount time).
      // Saves empty responses too so deletions persist.
      if (hasPendingSaveRef.current) {
        localResponsesRef.current.forEach((response, index) => {
          if (index < questions.length) {
            void saveResponseRef.current(index, questions[index], response);
          }
        });
      }
    };
  }, [questions]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (shouldFlushAutosaveOnAppState(nextState)) {
        autoSaveControllerRef.current?.flush();
        // The store's persist flush (registered at module load) ran before
        // this one, so land the response just written (WR-23 debounce).
        flushUnfoldStorePersist();
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

  return (
    <View>
      <View
        style={{
          alignItems: 'flex-start',
          marginBottom: Spacing['7'],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: Spacing['2'],
          }}
        >
          <Text
            testID="reflection-heading"
            style={{
              fontFamily: FontFamily.display,
              fontSize: 24,
              lineHeight: 30,
              color: colors.text,
              textAlign: 'left',
            }}
          >
            Reflection
          </Text>
          <Text
            testID="reflection-optional-label"
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSizeTokens.xs,
              lineHeight: 16,
              color: colors.textMuted,
              textAlign: 'left',
            }}
          >
            Optional
          </Text>
        </View>
      </View>

      {/* Questions */}
      {questions.map((question, index) => {
        const isExpanded = expandedIndex === index;
        const response = getResponse(index, question);
        const isAnswered = response.trim().length > 0;
        const signal = checkSignals.get(index);
        const checkMode = reflectionCheckMode({
          saveState: saveStatuses.get(index) ?? null,
          hadPersistedResponse: persistedResponses.get(index) === true,
          finishRevision: signal?.finishRevision ?? null,
          savedRevision: signal?.savedRevision ?? null,
        });

        return (
          <ReflectionQuestionCard
            key={`${devotionalId}:${dayNumber}:${question}`}
            index={index}
            question={question}
            isExpanded={isExpanded}
            isHeld={heldIndex === index}
            isAnswered={isAnswered}
            response={response}
            onTap={handleQuestionTap}
            onResponseChange={handleResponseChange}
            saveState={saveStatuses.get(index) ?? null}
            checkMode={checkMode}
            checkPlayKey={signal?.savedRevision ?? 0}
            onRetrySave={handleRetrySave}
            onInputRef={handleInputRef}
            onInputFocus={handleInputFocus}
            onInputBlur={handleInputBlur}
            onInputLayout={handleInputReady}
            colors={colors}
            isDark={isDark}
            typography={typography}
            editable={editable}
            reducedMotion={reducedMotion ?? false}
          />
        );
      })}

      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out).delay(questions.length * 100 + 200)}
        style={{ marginTop: Spacing['5'], alignItems: 'flex-start' }}
      >
        <Pressable
          testID="reflection-journal-link"
          accessibilityRole="button"
          accessibilityLabel="Continue in Journal"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenFullJournal();
          }}
          style={{ alignSelf: 'flex-start' }}
        >
          <View
            testID="reflection-journal-link-target"
            style={{
              minHeight: 44,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSizeTokens.sm,
                color: colors.accent,
                textAlign: 'left',
              }}
            >
              Continue in Journal →
            </Text>
          </View>
        </Pressable>
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
  isHeld,
  isAnswered,
  response,
  onTap,
  onResponseChange,
  saveState,
  checkMode,
  checkPlayKey,
  onRetrySave,
  onInputRef,
  onInputFocus,
  onInputBlur,
  onInputLayout,
  colors,
  isDark,
  typography,
  editable = true,
  reducedMotion = false,
}: {
  index: number;
  question: string;
  isExpanded: boolean;
  isHeld: boolean;
  isAnswered: boolean;
  response: string;
  onTap: (index: number) => void;
  onResponseChange: (index: number, question: string, text: string) => void;
  saveState: ReflectionSaveState | null;
  checkMode: ReturnType<typeof reflectionCheckMode>;
  checkPlayKey: number;
  onRetrySave: (index: number) => void;
  onInputRef: (index: number, input: TextInput | null) => void;
  onInputFocus: (index: number) => void;
  onInputBlur: (index: number) => void;
  onInputLayout: (index: number) => void;
  colors: any;
  isDark: boolean;
  typography: ReflectionTypography;
  editable?: boolean;
  reducedMotion?: boolean;
}) {
  const inputRef = useCallback((input: TextInput | null) => onInputRef(index, input), [index, onInputRef]);
  const playedCheckRef = useRef(0);
  const [isFocused, setIsFocused] = useState(false);
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
              gap: 10,
              paddingLeft: 0,
              paddingRight: 8,
              paddingVertical: Spacing['3'],
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

          {/* Expand affordance — matches journal.tsx's Go Deeper prompts */}
          <View style={{ marginTop: 3 }}>
            {isExpanded ? (
              <CaretUpIcon size={14} color={colors.textSubtle} weight="light" />
            ) : (
              <CaretDownIcon size={14} color={colors.textSubtle} weight="light" />
            )}
          </View>
        </Animated.View>
      </TouchableOpacity>

      {/* Expanded: TextInput area. A held prior field stays mounted until Next is ready. */}
      {(isExpanded || isHeld) && (
        <Animated.View
          entering={reducedMotion || isHeld ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}
          style={isExpanded ? {
            marginTop: Spacing['3'],
            paddingHorizontal: 0,
          } : {
            position: 'absolute',
            width: 1,
            height: 1,
            opacity: 0,
            overflow: 'hidden',
          }}
          importantForAccessibility={isExpanded ? 'yes' : 'no-hide-descendants'}
          accessibilityElementsHidden={!isExpanded}
        >
          <View
            testID={`reflection-ruled-input-${index}`}
            style={{
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: isFocused
                ? (colors.borderFocused ?? colors.accent)
                : colors.border,
              paddingTop: 8,
              paddingBottom: 10,
              opacity: editable ? 1 : 0.5,
            }}
          >
            <TextInput
              ref={inputRef}
              value={response}
              editable={editable}
              onLayout={() => onInputLayout(index)}
              onFocus={() => {
                setIsFocused(true);
                onInputFocus(index);
              }}
              onBlur={() => {
                setIsFocused(false);
                onInputBlur(index);
              }}
              onChangeText={(text) => onResponseChange(index, question, text)}
              placeholder={editable ? 'Write your thoughts...' : 'Unlock Premium to journal your reflections'}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              multiline
              submitBehavior="newline"
              blurOnSubmit={false}
              textAlignVertical="top"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              accessibilityLabel={`Your response to: ${question}`}
              accessibilityHint={editable ? 'Write your reflection. Save status appears below.' : 'Unlock Premium to write reflections.'}
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

          {isExpanded && editable ? (
            saveState === 'error' ? (
              <TouchableOpacity
                onPress={() => onRetrySave(index)}
                accessibilityRole="button"
                accessibilityLabel="Save failed. Tap to retry."
                accessibilityLiveRegion="assertive"
                style={{
                  minHeight: 44,
                  marginTop: Spacing['2'],
                  alignSelf: 'flex-end',
                  justifyContent: 'center',
                  paddingHorizontal: Spacing['2'],
                }}
              >
                <Text
                  testID={`reflection-save-status-${index}`}
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: FontSizeTokens.xs,
                    color: colors.error,
                    textAlign: 'right',
                  }}
                >
                  Save failed. Tap to retry.
                </Text>
              </TouchableOpacity>
            ) : (
              <View
                testID={`reflection-save-slot-${index}`}
                style={{
                  minHeight: 20,
                  marginTop: Spacing['2'],
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                {checkMode !== 'hidden' ? <DrawnCheck
                  visible
                  playKey={checkMode === 'draw' ? checkPlayKey : 0}
                  playedKeyRef={playedCheckRef}
                  color={colors.accent}
                  testID={`reflection-save-check-${index}-${checkMode === 'draw' ? 'draw' : 'static'}`}
                /> : null}
                {saveState ? (
                  <Text
                    testID={`reflection-save-status-${index}`}
                    accessibilityLiveRegion="polite"
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSizeTokens.xs,
                      color: colors.textMuted,
                      textAlign: 'right',
                    }}
                  >
                    {saveState === 'saving' ? 'Saving...' : 'Saved to Journal'}
                  </Text>
                ) : null}
              </View>
            )
          ) : null}
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
