import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpenIcon, CaretLeftIcon, XIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import {
  SCRIPTURE_PRACTICES,
  getScripturePractice,
  type ScripturePractice,
  type ScripturePracticeStep,
} from '@/constants/scripture-practices';
import { fetchVerseLocal, type VerseResult } from '@/lib/bible-api';
import type { BibleTranslation } from '@/lib/bible-db';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import {
  getPracticePassage,
  PRACTICE_ANSWER_MAX_CHARS,
  practiceSessionKey,
  type PracticeSession,
  type PracticeTarget,
} from '@/lib/scripture-practice';
import { useUnfoldStore, type DevotionalDay } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const PRACTICE_CATALOG = Object.values(SCRIPTURE_PRACTICES);
const ANSWER_LIMIT = PRACTICE_ANSWER_MAX_CHARS;
const UNAVAILABLE_COPY =
  "This passage isn't available in the app Bible. Read it in a physical Bible instead.";
const DEVICE_NOTE = 'Notes stay on this device.';

const EMPTY_SESSION: PracticeSession = {
  step: 0,
  answers: {},
  completed: false,
  readingMode: null,
};

export function hidePracticeWords(text: string): string {
  return text.replace(/[A-Za-z\u00C0-\u024F']+/g, (word) => {
    if (word.length <= 1) return word;
    return `${word[0]}${'\u00B7'.repeat(word.length - 1)}`;
  });
}

export function buildPracticeBibleHref(passage: {
  bookId: number;
  chapter: number;
  verse: number;
}): string {
  return `/(tabs)/(bible)/reader?bookId=${passage.bookId}&chapter=${passage.chapter}&verse=${passage.verse}`;
}

export function firstCatalogMethodId(): string | null {
  return PRACTICE_CATALOG[0]?.id ?? null;
}

export interface ScripturePracticeSheetProps {
  targetIdentity: Omit<PracticeTarget, 'methodId'>;
  methodId: string | null;
  assignedMethodId?: string;
  day: DevotionalDay;
  onChangeMethod: (methodId: string) => void;
  onClose: () => void;
  onSkipPractice: () => void;
  onOpenBible: (reference: string) => void;
}

export function ScripturePracticeSheet({
  targetIdentity,
  methodId,
  assignedMethodId,
  day,
  onChangeMethod,
  onClose,
  onSkipPractice,
  onOpenBible,
}: ScripturePracticeSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translation = useUnfoldStore((s) => s.bibleReaderSettings.translation) as BibleTranslation;
  const sessions = useUnfoldStore((s) => s.scripturePracticeSessions);
  const updateScripturePractice = useUnfoldStore((s) => s.updateScripturePractice);
  const scrollRef = useRef<ScrollView>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [passageHidden, setPassageHidden] = useState(false);
  const [primaryVerse, setPrimaryVerse] = useState<VerseResult | null>(null);
  const [primaryState, setPrimaryState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [bsbVerse, setBsbVerse] = useState<VerseResult | null>(null);
  const [kjvVerse, setKjvVerse] = useState<VerseResult | null>(null);
  const [compareState, setCompareState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [availableReferences, setAvailableReferences] = useState<readonly { reference: string; text: string }[]>([]);

  const practice = methodId ? getScripturePractice(methodId) : null;
  const target = useMemo<PracticeTarget | null>(() => methodId
    ? { ...targetIdentity, methodId }
    : null, [methodId, targetIdentity]);
  const session = target
    ? (sessions[practiceSessionKey(target)] ?? EMPTY_SESSION)
    : EMPTY_SESSION;
  const steps = practice?.steps ?? [];
  const onIntro = session.readingMode == null;
  const stepIndex = Math.min(Math.max(session.step, 0), Math.max(steps.length - 1, 0));
  const currentStep = !onIntro && steps.length > 0 ? steps[stepIndex] : null;
  const kind = practice?.kind ?? null;

  useEffect(() => {
    setPassageHidden(false);
  }, [methodId, targetIdentity.devotionalId, targetIdentity.dayNumber]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [methodId, stepIndex, onIntro]);
  const reference = day.scriptureReference?.trim() ?? '';
  const passageMeta = getPracticePassage(reference);
  const chapterReference = passageMeta?.chapterReference ?? null;
  const showQaPicker = isQaToolsEnabled();

  const patchSession = useCallback((patch: Partial<PracticeSession>) => {
    if (!target) return;
    updateScripturePractice(target, patch);
  }, [target, updateScripturePractice]);

  const setAnswer = useCallback((key: string, value: string) => {
    if (!target) return;
    updateScripturePractice(target, {
      answers: { ...session.answers, [key]: value.slice(0, ANSWER_LIMIT) },
    });
  }, [session.answers, target, updateScripturePractice]);

  useEffect(() => {
    if (!reference) {
      setPrimaryVerse(null);
      setPrimaryState('unavailable');
      return;
    }
    let cancelled = false;
    setPrimaryState('loading');
    setPrimaryVerse(null);
    fetchVerseLocal(reference, translation).then((result) => {
      if (cancelled) return;
      if (result?.text) {
        setPrimaryVerse(result);
        setPrimaryState('ready');
      } else {
        setPrimaryVerse(null);
        setPrimaryState('unavailable');
      }
    }).catch(() => {
      if (cancelled) return;
      setPrimaryVerse(null);
      setPrimaryState('unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [reference, translation]);

  useEffect(() => {
    if (kind !== 'compare' || !reference || onIntro) {
      setBsbVerse(null);
      setKjvVerse(null);
      setCompareState('idle');
      return;
    }
    let cancelled = false;
    setCompareState('loading');
    setBsbVerse(null);
    setKjvVerse(null);
    Promise.all([
      fetchVerseLocal(reference, 'BSB').catch(() => null),
      fetchVerseLocal(reference, 'KJV').catch(() => null),
    ]).then(([bsb, kjv]) => {
      if (cancelled) return;
      setBsbVerse(bsb?.text ? bsb : null);
      setKjvVerse(kjv?.text ? kjv : null);
      setCompareState('ready');
    }).catch(() => {
      if (cancelled) return;
      setBsbVerse(null);
      setKjvVerse(null);
      setCompareState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [kind, reference, onIntro, methodId]);

  useEffect(() => {
    let cancelled = false;
    setAvailableReferences([]);
    if (kind !== 'trace' || onIntro) return;
    const references = [...new Set((day.crossReferences ?? []).map((item) => item.reference))]
      .filter((reference) => getPracticePassage(reference)).slice(0, 8);
    Promise.all(references.map(async (reference) => {
      const verse = await fetchVerseLocal(reference, translation).catch(() => null);
      return verse?.text ? { reference, text: verse.text } : null;
    })).then((results) => {
      if (!cancelled) setAvailableReferences(results.filter((item) => item !== null));
    });
    return () => { cancelled = true; };
  }, [kind, onIntro, day.crossReferences, translation]);

  const openPicker = useCallback(() => {
    setPickerOpen((open) => !open);
    if (!methodId) {
      const fallback = firstCatalogMethodId();
      if (fallback) onChangeMethod(fallback);
    }
  }, [methodId, onChangeMethod]);

  const chooseReading = useCallback((mode: 'app' | 'physical') => {
    patchSession({ readingMode: mode, step: session.step || 0 });
  }, [patchSession, session.step]);

  const finish = useCallback(() => {
    patchSession({ completed: true });
    onClose();
  }, [onClose, patchSession]);

  const goNext = useCallback(() => {
    if (!practice) {
      onClose();
      return;
    }
    if (onIntro) {
      if (session.readingMode == null) {
        patchSession({ readingMode: 'physical' });
      }
      return;
    }
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    patchSession({ step: stepIndex + 1 });
  }, [finish, onClose, onIntro, patchSession, practice, session.readingMode, stepIndex, steps.length]);

  const goBack = useCallback(() => {
    if (onIntro) {
      onClose();
      return;
    }
    if (stepIndex <= 0) {
      patchSession({ readingMode: null });
      return;
    }
    patchSession({ step: stepIndex - 1 });
  }, [onClose, onIntro, patchSession, stepIndex]);

  const skip = useCallback(() => {
    if (onIntro || !practice || stepIndex >= steps.length - 1) {
      onSkipPractice();
      return;
    }
    patchSession({ step: stepIndex + 1 });
  }, [onIntro, onSkipPractice, patchSession, practice, stepIndex, steps.length]);



  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="scripture-practice-sheet">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, Spacing['3']) }]}>
          <TouchableOpacity
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={onIntro ? 'Close practice' : 'Back'}
            testID="scripture-practice-back"
            style={styles.iconButton}
          >
            <CaretLeftIcon size={22} color={colors.text} weight="light" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} testID="scripture-practice-title">
            {practice?.title ?? 'Begin with Scripture'}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close practice and return to the reading"
            testID="scripture-practice-close"
            style={styles.iconButton}
          >
            <XIcon size={20} color={colors.text} weight="light" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, Spacing['4']) + Spacing['8'] },
          ]}
        >
          <TouchableOpacity
            onPress={() => onOpenBible(reference)}
            disabled={!passageMeta}
            accessibilityRole="link"
            accessibilityLabel={`Read ${reference || 'the assigned passage'} in Bible`}
            accessibilityState={{ disabled: !passageMeta }}
            testID="scripture-practice-reference"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={[styles.reference, { color: colors.accent }]}>
              {reference || 'Assigned passage'}
            </Text>
          </TouchableOpacity>

          {onIntro ? (
            <IntroBody
              colors={colors}
              practice={practice}
              primaryState={primaryState}
              primaryVerse={primaryVerse}
              chapterReference={chapterReference}
              onReadInBible={passageMeta ? () => {
                chooseReading('app');
                onOpenBible(reference);
              } : null}
              onPhysicalBible={() => chooseReading('physical')}
              onReadChapter={chapterReference ? () => {
                chooseReading('app');
                onOpenBible(chapterReference);
              } : null}
            />
          ) : currentStep ? (
            <StepBody
              colors={colors}
              kind={kind}
              manuscript={methodId === 'manuscript'}
              step={currentStep}
              stepIndex={stepIndex}
              stepCount={steps.length}
              answers={session.answers}
              setAnswer={setAnswer}
              primaryState={primaryState}
              primaryVerse={primaryVerse}
              bsbVerse={bsbVerse}
              kjvVerse={kjvVerse}
              compareState={compareState}
              passageHidden={passageHidden}
              onTogglePassage={() => setPassageHidden((value) => !value)}
              crossReferences={availableReferences}
              onOpenBible={onOpenBible}
            />
          ) : (
            <Text style={[styles.prompt, { color: colors.textMuted }]}>
              Choose a method to continue, or return to the reading.
            </Text>
          )}

          {showQaPicker ? (
            <View style={styles.pickerBlock}>
              <TouchableOpacity
                onPress={openPicker}
                accessibilityRole="button"
                accessibilityLabel="Preview another method. Does not change the assigned day method."
                testID="scripture-practice-qa-picker"
                style={[styles.pickerToggle, { borderColor: colors.border }]}
              >
                <Text style={[styles.pickerLabel, { color: colors.textSubtle }]}>
                  Preview another method
                </Text>
                <Text style={[styles.pickerHint, { color: colors.textHint }]}>
                  Uses this passage. Does not change the assigned day.
                </Text>
              </TouchableOpacity>
              {pickerOpen ? PRACTICE_CATALOG.map((item) => {
                const selected = item.id === methodId;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => { onChangeMethod(item.id); setPickerOpen(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${item.title}`}
                    testID={`scripture-practice-preview-${item.id}`}
                    style={[
                      styles.pickerRow,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.pickerRowTitle, { color: colors.text }]}>{item.title}</Text>
                    {assignedMethodId === item.id ? (
                      <Text style={[styles.pickerAssigned, { color: colors.textSubtle }]}>Assigned</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              }) : null}
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, Spacing['3']),
              borderTopColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel={onIntro ? 'Skip practice and return to the reading' : 'Skip this step'}
            testID="scripture-practice-skip"
            style={styles.footerGhost}
          >
            <Text style={[styles.footerGhostLabel, { color: colors.textMuted }]}>
              Skip
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onIntro && session.readingMode == null ? () => chooseReading('physical') : goNext}
            accessibilityRole="button"
            accessibilityLabel={onIntro ? 'Continue to the practice' : stepIndex >= steps.length - 1 ? 'Return to reading' : 'Continue'}
            testID="scripture-practice-continue"
            style={[styles.footerPrimary, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.footerPrimaryLabel, { color: colors.background }]}>
              {onIntro ? 'Continue' : stepIndex >= steps.length - 1 ? 'Return to reading' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function IntroBody({
  colors,
  practice,
  primaryState,
  primaryVerse,
  chapterReference,
  onReadInBible,
  onPhysicalBible,
  onReadChapter,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  practice: ScripturePractice | null;
  primaryState: 'idle' | 'loading' | 'ready' | 'unavailable';
  primaryVerse: VerseResult | null;
  chapterReference: string | null;
  onReadInBible: (() => void) | null;
  onPhysicalBible: () => void;
  onReadChapter: (() => void) | null;
}) {
  return (
    <View style={styles.block}>
      {practice?.intro ? (
        <Text style={[styles.intro, { color: colors.text }]}>{practice.intro}</Text>
      ) : (
        <Text style={[styles.intro, { color: colors.text }]}>
          Read the assigned passage first. You can use Unfold or a physical Bible.
        </Text>
      )}
      <PassageBlock
        colors={colors}
        state={primaryState}
        text={primaryVerse?.text ?? null}
        hidden={false}
        testID="scripture-practice-passage"
      />
      <TouchableOpacity
        onPress={onReadInBible ?? undefined}
        disabled={!onReadInBible}
        accessibilityState={{ disabled: !onReadInBible }}
        accessibilityRole="button"
        accessibilityLabel="Read in Bible"
        testID="scripture-practice-read-in-bible"
        style={[styles.primaryAction, { backgroundColor: colors.accent, opacity: onReadInBible ? 1 : 0.5 }]}
      >
        <BookOpenIcon size={18} color={colors.background} weight="light" />
        <Text style={[styles.primaryActionLabel, { color: colors.background }]}>Read in Bible</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onPhysicalBible}
        accessibilityRole="button"
        accessibilityLabel="I have my Bible"
        testID="scripture-practice-physical"
        style={[styles.secondaryAction, { borderColor: colors.borderStrong }]}
      >
        <Text style={[styles.secondaryActionLabel, { color: colors.text }]}>I have my Bible</Text>
      </TouchableOpacity>
      {onReadChapter && chapterReference ? (
        <TouchableOpacity
          onPress={onReadChapter}
          accessibilityRole="button"
          accessibilityLabel={`Read the surrounding chapter, ${chapterReference}`}
          testID="scripture-practice-chapter"
          style={styles.textAction}
        >
          <Text style={[styles.textActionLabel, { color: colors.accent }]}>
            {`Read the surrounding chapter (${chapterReference})`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function StepBody({
  colors,
  kind,
  manuscript,
  step,
  stepIndex,
  stepCount,
  answers,
  setAnswer,
  primaryState,
  primaryVerse,
  bsbVerse,
  kjvVerse,
  compareState,
  passageHidden,
  onTogglePassage,
  crossReferences,
  onOpenBible,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  kind: ScripturePractice['kind'] | null;
  manuscript: boolean;
  step: ScripturePracticeStep;
  stepIndex: number;
  stepCount: number;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
  primaryState: 'idle' | 'loading' | 'ready' | 'unavailable';
  primaryVerse: VerseResult | null;
  bsbVerse: VerseResult | null;
  kjvVerse: VerseResult | null;
  compareState: 'idle' | 'loading' | 'ready';
  passageHidden: boolean;
  onTogglePassage: () => void;
  crossReferences: readonly { reference: string; text: string }[];
  onOpenBible: (reference: string) => void;
}) {
  const notesKey = step.id;
  const choiceKey = `${step.id}__choice`;

  return (
    <View style={styles.block}>
      <Text style={[styles.stepCount, { color: colors.textSubtle }]}>
        {`${stepIndex + 1} of ${stepCount}`}
      </Text>
      <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
      <Text style={[styles.prompt, { color: colors.textMuted }]}>{step.prompt}</Text>

      {manuscript ? (
        <PassageBlock
          colors={colors}
          state={primaryState}
          text={primaryVerse?.passage?.verses.map((verse) => verse.text).join(' ') ?? primaryVerse?.text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*/g, '') ?? null}
          hidden={false}
          testID="scripture-practice-manuscript"
        />
      ) : null}
      {kind === 'memory' || kind === 'retell' ? (
        <>
          <PassageBlock
            colors={colors}
            state={primaryState}
            text={primaryVerse?.text ?? null}
            hidden={passageHidden}
            testID="scripture-practice-passage"
          />
          {primaryState === 'ready' ? (
            <TouchableOpacity
              onPress={onTogglePassage}
              accessibilityRole="button"
              accessibilityLabel={passageHidden ? 'Show words' : 'Hide words'}
              testID="scripture-practice-hide-words"
              style={styles.textAction}
            >
              <Text style={[styles.textActionLabel, { color: colors.accent }]}>
                {passageHidden ? 'Show words' : 'Hide words'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {kind === 'compare' ? (
        <CompareBlock
          colors={colors}
          state={compareState}
          bsbVerse={bsbVerse}
          kjvVerse={kjvVerse}
        />
      ) : null}

      {kind === 'pause' ? (
        <Text style={[styles.prompt, { color: colors.textMuted }]}>
          Take your time. Continue when you are ready.
        </Text>
      ) : null}

      {kind === 'notice' && step.choices?.length ? (
        <View style={styles.choices}>
          {step.choices.map((choice) => {
            const selected = (answers[choiceKey] ?? '').split('\u001f').filter(Boolean).includes(choice);
            return (
              <TouchableOpacity
                key={choice}
                onPress={() => {
                  const current = (answers[choiceKey] ?? '').split('\u001f').filter(Boolean);
                  const next = selected
                    ? current.filter((item) => item !== choice)
                    : [...current, choice];
                  setAnswer(choiceKey, next.join('\u001f'));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={choice}
                style={[
                  styles.choice,
                  {
                    borderColor: selected ? colors.accent : colors.border,
                    backgroundColor: selected ? colors.inputBackgroundFocused : colors.inputBackground,
                  },
                ]}
              >
                <Text style={[styles.choiceLabel, { color: colors.text }]}>{choice}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {kind === 'trace' ? (
        <View style={styles.block}>
          {crossReferences.length === 0 ? (
            <Text style={[styles.prompt, { color: colors.textMuted }]}>
              No related passages are available here. Stay with the assigned passage in your Bible.
            </Text>
          ) : crossReferences.map((item) => (
            <TouchableOpacity
              key={item.reference}
              onPress={() => onOpenBible(item.reference)}
              accessibilityRole="link"
              accessibilityLabel={`Open ${item.reference} in Bible`}
              testID={`scripture-practice-trace-${item.reference}`}
              style={styles.textAction}
            >
              <Text style={[styles.textActionLabel, { color: colors.accent }]}>{item.reference}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {kind !== 'pause' || step.inputLabel ? (
        <AnswerField
          colors={colors}
          label={step.inputLabel ?? (kind === 'notice' || kind === 'trace' || kind === 'memory'
            ? 'Optional notes'
            : 'Your response')}
          value={answers[notesKey] ?? ''}
          onChange={(value) => setAnswer(notesKey, value)}
        />
      ) : null}

      <Text style={[styles.deviceNote, { color: colors.textHint }]}>{DEVICE_NOTE}</Text>
    </View>
  );
}

function CompareBlock({
  colors,
  state,
  bsbVerse,
  kjvVerse,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  state: 'idle' | 'loading' | 'ready';
  bsbVerse: VerseResult | null;
  kjvVerse: VerseResult | null;
}) {
  if (state === 'loading' || state === 'idle') {
    return (
      <View testID="scripture-practice-compare-loading">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <LabeledVerse
        colors={colors}
        label="Berean Standard Bible"
        text={bsbVerse?.text ?? null}
        testID="scripture-practice-compare-bsb"
      />
      <LabeledVerse
        colors={colors}
        label="King James Version"
        text={kjvVerse?.text ?? null}
        testID="scripture-practice-compare-kjv"
      />
    </View>
  );
}

function LabeledVerse({
  colors,
  label,
  text,
  testID,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  label: string;
  text: string | null;
  testID: string;
}) {
  return (
    <View testID={testID} style={styles.verseStack}>
      <Text style={[styles.translationLabel, { color: colors.textSubtle }]}>{label}</Text>
      {text ? (
        <Text style={[styles.verse, { color: colors.text }]}>{text}</Text>
      ) : (
        <Text style={[styles.unavailable, { color: colors.textMuted }]}>{UNAVAILABLE_COPY}</Text>
      )}
    </View>
  );
}

function PassageBlock({
  colors,
  state,
  text,
  hidden,
  testID,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  state: 'idle' | 'loading' | 'ready' | 'unavailable';
  text: string | null;
  hidden: boolean;
  testID: string;
}) {
  if (state === 'loading' || state === 'idle') {
    return (
      <View testID={testID}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (state === 'unavailable' || !text) {
    return (
      <Text testID="scripture-practice-unavailable" style={[styles.unavailable, { color: colors.textMuted }]}>
        {UNAVAILABLE_COPY}
      </Text>
    );
  }
  return (
    <Text testID={testID} style={[styles.verse, { color: colors.text }]}>
      {hidden ? hidePracticeWords(text) : text}
    </Text>
  );
}

function AnswerField({
  colors,
  label,
  value,
  onChange,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSubtle }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.textHint}
        multiline
        maxLength={ANSWER_LIMIT}
        textAlignVertical="top"
        testID="scripture-practice-input"
        accessibilityLabel={label}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.inputBackground,
            borderColor: colors.border,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['2'],
    gap: Spacing['2'],
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.display,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing['6'],
    gap: Spacing['4'],
  },
  reference: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  block: {
    gap: Spacing['3'],
  },
  intro: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    lineHeight: 30,
  },
  prompt: {
    ...Typography.bodyMd,
  },
  stepCount: {
    ...Typography.uiSm,
  },
  stepTitle: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
  },
  verse: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 18,
    lineHeight: 30,
  },
  unavailable: {
    ...Typography.bodyMd,
  },
  deviceNote: {
    ...Typography.caption,
  },
  primaryAction: {
    minHeight: 44,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  primaryActionLabel: {
    ...Typography.uiLg,
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionLabel: {
    ...Typography.uiLg,
  },
  textAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  textActionLabel: {
    ...Typography.uiMd,
  },
  field: {
    gap: Spacing['2'],
  },
  fieldLabel: {
    ...Typography.uiMd,
  },
  input: {
    minHeight: 120,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 24,
  },
  choices: {
    gap: Spacing['2'],
  },
  choice: {
    minHeight: 44,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    justifyContent: 'center',
  },
  choiceLabel: {
    ...Typography.bodyMd,
  },
  verseStack: {
    gap: Spacing['2'],
    marginBottom: Spacing['3'],
  },
  translationLabel: {
    ...Typography.uiSm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pickerBlock: {
    gap: Spacing['2'],
    marginTop: Spacing['4'],
  },
  pickerToggle: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing['4'],
    gap: Spacing['1'],
  },
  pickerLabel: {
    ...Typography.uiMd,
  },
  pickerHint: {
    ...Typography.caption,
  },
  pickerRow: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    justifyContent: 'center',
  },
  pickerRowTitle: {
    ...Typography.bodyMd,
  },
  pickerAssigned: {
    ...Typography.caption,
    marginTop: Spacing['1'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerGhost: {
    minHeight: 44,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3'],
  },
  footerGhostLabel: {
    ...Typography.uiLg,
  },
  footerPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['4'],
  },
  footerPrimaryLabel: {
    ...Typography.uiLg,
    textAlign: 'center',
  },
});
