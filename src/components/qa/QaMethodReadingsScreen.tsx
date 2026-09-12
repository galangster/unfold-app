import { useMemo, useState } from 'react';
import {
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
  QA_METHOD_READINGS_EMPTY_COPY,
  findQaMethodReading,
  loadQaMethodReadings,
  sectionAllowsSampleInput,
  type QaMethodReadingExample,
  type QaMethodReadingPassage,
  type QaMethodReadingSection,
  type QaMethodSectionKind,
} from '@/lib/qa-method-readings';
import {
  QA_SAMPLE_NOTE_LABEL,
  QA_SAMPLE_NOTE_PLACEHOLDER,
  getQaMethodReadingNote,
  setQaMethodReadingNote,
} from '@/lib/qa-method-reading-notes';
import { PRACTICE_ANSWER_MAX_CHARS } from '@/lib/scripture-practice';
import { useTheme } from '@/lib/theme';

export interface QaMethodReadingsScreenProps {
  selectedMethodId: string | null;
  onSelectMethod: (methodId: string) => void;
  onBackToLibrary: () => void;
  onClose: () => void;
  onOpenBible: (example: QaMethodReadingExample, passage: QaMethodReadingPassage) => void;
}

export function QaMethodReadingsScreen({
  selectedMethodId,
  onSelectMethod,
  onBackToLibrary,
  onClose,
  onOpenBible,
}: QaMethodReadingsScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const catalog = useMemo(() => loadQaMethodReadings(), []);
  const selected = findQaMethodReading(catalog.examples, selectedMethodId);
  const headerTitle = selected ? 'Sample reading' : 'Sample readings';
  const backLabel = selected
    ? 'Back to sample readings'
    : 'Close sample readings';

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background }]}
      testID="qa-method-readings-screen"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, Spacing['3']) }]}>
          <TouchableOpacity
            onPress={selected ? onBackToLibrary : onClose}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            testID="qa-method-readings-back"
            style={styles.iconButton}
          >
            <CaretLeftIcon size={22} color={colors.text} weight="light" />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: colors.text }]}
            testID="qa-method-readings-title"
          >
            {headerTitle}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sample readings"
            testID="qa-method-readings-close"
            style={styles.iconButton}
          >
            <XIcon size={20} color={colors.text} weight="light" />
          </TouchableOpacity>
        </View>

        <ScrollView
          key={selected?.methodId ?? 'library'}
          testID={`qa-method-readings-scroll-${selected?.methodId ?? 'library'}`}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, Spacing['4']) + Spacing['8'] },
          ]}
        >
          {selected ? (
            <ReadingBody
              key={selected.methodId}
              example={selected}
              onOpenBible={(passage) => onOpenBible(selected, passage)}
            />
          ) : (
            <LibraryBody
              examples={catalog.examples}
              error={catalog.error}
              onSelectMethod={onSelectMethod}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function LibraryBody({
  examples,
  error,
  onSelectMethod,
}: {
  examples: readonly QaMethodReadingExample[];
  error: string | null;
  onSelectMethod: (methodId: string) => void;
}) {
  const { colors } = useTheme();
  const emptyCopy = error ?? QA_METHOD_READINGS_EMPTY_COPY;

  return (
    <View style={styles.block} testID="qa-method-readings-library">
      <Text style={[styles.kicker, { color: colors.accent }]}>{examples.length} ways to read</Text>
      <Text style={[styles.intro, { color: colors.text }]}>Find a way into Scripture.</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Try a reading shaped by each method. These examples use a fictional reader. Your current devotional stays as it is.
      </Text>
      {examples.length === 0 ? (
        <Text
          style={[styles.body, { color: colors.textMuted }]}
          testID="qa-method-readings-empty"
        >
          {emptyCopy}
        </Text>
      ) : (
        examples.map((example) => (
          <TouchableOpacity
            key={example.methodId}
            onPress={() => onSelectMethod(example.methodId)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${example.methodName} sample reading`}
            testID={`qa-method-readings-item-${example.methodId}`}
            style={[styles.methodRow, { borderColor: colors.border }]}
          >
            <Text style={[styles.methodName, { color: colors.text }]}>
              {example.methodName}
            </Text>
            <Text style={[styles.methodTitle, { color: colors.textMuted }]}>
              {example.title}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function ReadingBody({
  example,
  onOpenBible,
}: {
  example: QaMethodReadingExample;
  onOpenBible: (passage: QaMethodReadingPassage) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.block} testID={`qa-method-readings-reading-${example.methodId}`}>
      <Text style={[styles.kicker, { color: colors.accent }]}>{example.methodName}</Text>
      <Text style={[styles.intro, { color: colors.text }]}>{example.title}</Text>
      {example.introduction ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>{example.introduction}</Text>
      ) : null}

      <PassageBlock
        passage={example.passage}
        testIDPrefix="qa-method-readings"
        onOpenBible={() => onOpenBible(example.passage)}
        physicalHint
      />

      {example.supportingPassages.map((passage, index) => (
        <PassageBlock
          key={`${passage.bookId}:${passage.chapter}:${passage.verseStart}:${passage.verseEnd}:${index}`}
          passage={passage}
          testIDPrefix={`qa-method-readings-supporting-${index}`}
          onOpenBible={() => onOpenBible(passage)}
        />
      ))}

      {example.sections.map((section) => (
        <SectionBlock
          key={`${example.methodId}:${section.id}`}
          example={example}
          section={section}
        />
      ))}
    </View>
  );
}

function PassageBlock({
  passage,
  testIDPrefix,
  onOpenBible,
  physicalHint = false,
}: {
  passage: QaMethodReadingPassage;
  testIDPrefix: string;
  onOpenBible: () => void;
  physicalHint?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.block} testID={`${testIDPrefix}-block`}>
      <Text
        style={[styles.reference, { color: colors.accent }]}
        testID={`${testIDPrefix}-reference`}
      >
        {passage.reference}
        {'  ·  '}
        {passage.translation}
      </Text>
      <View testID={`${testIDPrefix}-verses`} style={styles.verseStack}>
        {passage.verses.map((verse) => (
          <Text key={verse.verse} style={[styles.verse, { color: colors.text }]}>
            {verse.verse}
            {'  '}
            {verse.text}
          </Text>
        ))}
      </View>
      {physicalHint ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {`If you have a physical Bible, read ${passage.reference} there first.`}
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={onOpenBible}
        accessibilityRole="button"
        accessibilityLabel={`Read ${passage.reference} in Bible`}
        testID={`${testIDPrefix}-bible`}
        style={[styles.primaryAction, { backgroundColor: colors.accent }]}
      >
        <BookOpenIcon size={18} color={colors.background} weight="light" />
        <Text style={[styles.primaryActionLabel, { color: colors.background }]}>
          Read in Bible
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionBlock({
  example,
  section,
}: {
  example: QaMethodReadingExample;
  section: QaMethodReadingSection;
}) {
  const { colors } = useTheme();
  const showInput = sectionAllowsSampleInput(section.prompt);
  const [value, setValue] = useState(() => getQaMethodReadingNote(example.methodId, section.id));

  return (
    <View
      style={styles.section}
      testID={`qa-method-readings-section-${section.id}`}
    >
      <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>
        {section.label}
      </Text>
      {section.text ? (
        <Text style={[sectionStyle(section.kind), { color: kindColor(section.kind, colors) }]}>
          {section.text}
        </Text>
      ) : null}
      {showInput ? (
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
            {section.prompt}
          </Text>
          <TextInput
            value={value}
            onChangeText={(next) => {
              setValue(next);
              setQaMethodReadingNote(example.methodId, section.id, next);
            }}
            placeholder={QA_SAMPLE_NOTE_PLACEHOLDER}
            placeholderTextColor={colors.textHint}
            multiline
            maxLength={PRACTICE_ANSWER_MAX_CHARS}
            textAlignVertical="top"
            accessibilityLabel={`${section.label} sample note`}
            testID={`qa-method-readings-note-${section.id}`}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
              },
            ]}
          />
          <Text style={[styles.sampleNote, { color: colors.textHint }]}>
            {QA_SAMPLE_NOTE_LABEL}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function sectionStyle(kind: QaMethodSectionKind) {
  if (kind === 'prayer') return styles.prayer;
  if (kind === 'pause') return styles.pause;
  if (kind === 'reading') return styles.reading;
  return styles.body;
}

function kindColor(
  kind: QaMethodSectionKind,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  if (kind === 'pause') return colors.textMuted;
  return colors.text;
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
    flexShrink: 1,
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
  block: {
    gap: Spacing['4'],
  },
  kicker: {
    ...Typography.uiMd,
  },
  intro: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
  },
  body: {
    ...Typography.bodyMd,
  },
  reading: {
    fontFamily: FontFamily.body,
    fontSize: 18,
    lineHeight: 30,
  },
  prayer: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 18,
    lineHeight: 30,
  },
  pause: {
    ...Typography.bodyMd,
  },
  reference: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1,
  },
  verseStack: {
    gap: Spacing['2'],
  },
  verse: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 18,
    lineHeight: 30,
  },
  methodRow: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    gap: Spacing['1'],
  },
  methodName: {
    ...Typography.bodyMd,
    flexShrink: 1,
  },
  methodTitle: {
    ...Typography.caption,
    flexShrink: 1,
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
    flexWrap: 'wrap',
  },
  primaryActionLabel: {
    ...Typography.uiLg,
    flexShrink: 1,
    textAlign: 'center',
  },
  section: {
    gap: Spacing['2'],
  },
  sectionLabel: {
    ...Typography.uiSm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
  sampleNote: {
    ...Typography.caption,
  },
});
