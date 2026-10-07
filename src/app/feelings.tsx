import { Fragment, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { ArrowClockwiseIcon, CaretLeftIcon, XIcon } from '@/components/icons';
import { ReaderText } from '@/components/reading/ReaderText';
import { Button } from '@/components/ui';
import { Duration, Ease, Stagger } from '@/constants/animations';
import { FEELINGS, FEELINGS_TRANSLATION, displayVerses, getFeeling, type Feeling, type Passage } from '@/constants/feelings';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useCreationGate } from '@/hooks/useCreationGate';
import { useGuardedBack } from '@/hooks/useGuardedBack';
import { useStartNewSeries } from '@/hooks/useStartNewSeries';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';

// Display type keeps its layout under the app's 1.8 Dynamic Type ceiling: the
// headings stop growing at 1.3, and the words drop to one column at 1.5.
const DISPLAY_MAX_SCALE = 1.3;
const SINGLE_COLUMN_FONT_SCALE = 1.5;

// Motion. Each piece rises a little as it fades in; nothing runs past 340 ms.
const RISE = 8;
const WORDS_START = 150;
/** The answer starts while the list is still fading out. */
const ANSWER_START = Duration.instant;
/** The word lands first, then the passage, then the actions. */
const PASSAGE_START = ANSWER_START + 120;
const ACTIONS_START = PASSAGE_START + 80;

function arrive(delay: number) {
  return FadeInDown.duration(Duration.slow)
    .delay(delay)
    .easing(Ease.out)
    .withInitialValues({ transform: [{ translateY: RISE }] })
    .reduceMotion(ReduceMotion.System);
}

const leave = FadeOut.duration(Duration.fast).easing(Ease.in).reduceMotion(ReduceMotion.System);

/**
 * "How are you, really?" — pick a word, read a passage for it.
 *
 * `unfold://feelings` opens the list; `?feeling=<id>` opens that feeling's
 * answer. Ids the content does not know open the list.
 */
export default function FeelingsScreen() {
  const { feeling } = useLocalSearchParams<{ feeling?: string | string[] }>();
  const requested = getFeeling(Array.isArray(feeling) ? feeling[0] : feeling);
  // A link that names another feeling while the screen is open starts over on it.
  return <FeelingsCheckIn key={requested?.id ?? 'list'} initialFeeling={requested} />;
}

function FeelingsCheckIn({ initialFeeling }: { initialFeeling: Feeling | undefined }) {
  const { colors } = useTheme();
  const close = useGuardedBack();
  const { gate, showExclusiveOffer, dismissOffer, handleOfferVerifiedExit } = useCreationGate();
  const startNewSeries = useStartNewSeries(gate);
  const scrollRef = useRef<ScrollView>(null);
  const [chosen, setChosen] = useState(initialFeeling ?? null);

  const show = (next: Feeling | null) => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setChosen(next);
  };

  const choose = (next: Feeling) => {
    Haptics.selectionAsync();
    show(next);
    AccessibilityInfo.announceForAccessibility(`${next.label}. ${next.passages[0].reference}`);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        {chosen && (
          <Animated.View entering={arrive(ANSWER_START)} exiting={leave}>
            <Button
              variant="ghost"
              label="All feelings"
              icon={<CaretLeftIcon weight="light" />}
              accessibilityHint="Returns to the list of feelings"
              onPress={() => show(null)}
              style={styles.back}
            />
          </Animated.View>
        )}
        <Button variant="icon" icon={<XIcon weight="light" />} accessibilityLabel="Close" onPress={close} style={styles.close} />
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {chosen ? (
          <FeelingAnswer key={chosen.id} feeling={chosen} onBeginSeries={startNewSeries} />
        ) : (
          <FeelingList onChoose={choose} />
        )}
      </ScrollView>
      <ExclusiveOfferSheet
        visible={showExclusiveOffer}
        onDismiss={dismissOffer}
        onPurchaseSuccess={handleOfferVerifiedExit}
        surface="churned_sheet"
        context="churned"
      />
    </SafeAreaView>
  );
}

function FeelingList({ onChoose }: { onChoose: (feeling: Feeling) => void }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const cellStyle = fontScale >= SINGLE_COLUMN_FONT_SCALE ? styles.wholeRow : styles.halfRow;

  return (
    <Animated.View exiting={leave} style={styles.section}>
      <Animated.View entering={arrive(0)}>
        <ReaderText style={[styles.kicker, { color: colors.textMuted }]}>Check in</ReaderText>
      </Animated.View>
      <Animated.View entering={arrive(50)}>
        <ReaderText accessibilityRole="header" maxFontSizeMultiplier={DISPLAY_MAX_SCALE} style={[styles.prompt, { color: colors.text }]}>
          How are you, really?
        </ReaderText>
      </Animated.View>
      <Animated.View entering={arrive(100)}>
        <ReaderText style={[styles.subtitle, { color: colors.textMuted }]}>
          Pick a word. Unfold finds you a passage for it.
        </ReaderText>
      </Animated.View>
      <View style={styles.words}>
        {FEELINGS.map((feeling, i) => (
          <Animated.View key={feeling.id} entering={arrive(WORDS_START + i * Stagger.fast)} style={cellStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={feeling.word}
              accessibilityHint={`Shows a passage ${feeling.label.charAt(0).toLowerCase()}${feeling.label.slice(1)}`}
              onPress={() => onChoose(feeling)}
              style={[styles.word, { borderTopColor: colors.border }]}
            >
              {({ pressed }) => (
                <ReaderText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={[styles.wordText, { color: pressed ? colors.accent : colors.text }]}
                >
                  {feeling.word}
                </ReaderText>
              )}
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

function FeelingAnswer({ feeling, onBeginSeries }: { feeling: Feeling; onBeginSeries: () => void }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState({ index: 0, cycled: false });
  const passage = feeling.passages[shown.index];
  const count = feeling.passages.length;

  const anotherPassage = () => {
    const index = (shown.index + 1) % count;
    setShown({ index, cycled: true });
    AccessibilityInfo.announceForAccessibility(feeling.passages[index].reference);
  };

  return (
    <Animated.View exiting={leave} style={styles.section}>
      <Animated.View entering={arrive(ANSWER_START)}>
        <ReaderText style={[styles.kicker, { color: colors.textMuted }]}>{feeling.label}</ReaderText>
        <ReaderText
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
          style={[styles.answerWord, { color: colors.text }]}
        >
          {feeling.word}
        </ReaderText>
      </Animated.View>
      {/* Keyed so another passage replaces this one: out, then in. */}
      <Animated.View key={shown.index} entering={arrive(shown.cycled ? Duration.instant : PASSAGE_START)} exiting={leave}>
        <PassageText passage={passage} />
        <ReaderText style={[styles.source, { color: colors.textMuted }]}>
          {`${passage.reference} · ${FEELINGS_TRANSLATION}`}
        </ReaderText>
      </Animated.View>
      <Animated.View entering={arrive(ACTIONS_START)} style={styles.actions}>
        <Button size="lg" fullWidth label="Begin a 5-day series for this" onPress={onBeginSeries} />
        <Button
          variant="ghost"
          label={`Another passage ${shown.index + 1}/${count}`}
          accessibilityLabel={`Another passage, ${shown.index + 1} of ${count}`}
          accessibilityHint="Shows the next passage for this feeling"
          icon={<ArrowClockwiseIcon weight="light" />}
          onPress={anotherPassage}
          style={styles.another}
        />
      </Animated.View>
    </Animated.View>
  );
}

/** Numbered verses in the reader's scripture face, verse numbers in the accent. */
function PassageText({ passage }: { passage: Passage }) {
  const { colors } = useTheme();
  const readingFont = useReadingFont();
  return (
    <ReaderText style={[styles.passage, { fontFamily: readingFont.body, color: colors.text }]}>
      {displayVerses(passage).map((verse, i) => (
        <Fragment key={verse.number}>
          {i > 0 ? ' ' : null}
          <Text style={[styles.verseNumber, { color: colors.accent }]}>{`${verse.number} `}</Text>
          {withSmallCapsLord(verse.text)}
        </Fragment>
      ))}
    </ReaderText>
  );
}

/** "LORD" as printed Bibles set it: a capital L, then small capitals. The words stay the same. */
function withSmallCapsLord(text: string): ReactNode[] {
  return text.split('LORD').flatMap((part, i) => (i === 0
    ? [part]
    : ['L', <Text key={i} style={styles.smallCaps}>ORD</Text>, part]));
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing['3.5'],
  },
  back: { paddingLeft: Spacing['1'], paddingRight: Spacing['2.5'] },
  close: { marginLeft: 'auto' },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['6'],
    paddingBottom: Spacing['6'],
  },
  section: { flexGrow: 1 },
  kicker: {
    ...Typography.cardMeta,
    fontFamily: FontFamily.uiMedium,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
  },
  prompt: {
    fontFamily: FontFamily.display,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -0.84,
    marginTop: Spacing['2.5'],
    marginBottom: Spacing['2.5'],
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing['8'],
  },
  words: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing['5'] },
  // Two per row: the basis leaves room for the gap, and the grow evens them out.
  halfRow: { flexBasis: '40%', flexGrow: 1 },
  wholeRow: { flexBasis: '100%' },
  // A 1 pt rule above each word, as the approved prototype draws it.
  word: { minHeight: 58, justifyContent: 'center', borderTopWidth: 1, paddingVertical: Spacing['2'] },
  wordText: { fontFamily: FontFamily.display, fontSize: 29, lineHeight: 34, letterSpacing: -0.29 },
  answerWord: {
    fontFamily: FontFamily.display,
    fontSize: 64,
    lineHeight: 72,
    letterSpacing: -1.6,
    marginTop: Spacing['1.5'],
    marginBottom: Spacing['5'],
  },
  passage: { fontSize: 22, lineHeight: 34 },
  verseNumber: { fontFamily: FontFamily.uiMedium, fontSize: 12, fontVariant: ['tabular-nums'] },
  smallCaps: { fontSize: 16, letterSpacing: 0.8 },
  source: { ...Typography.cardMeta, marginTop: Spacing['4'] },
  actions: { marginTop: 'auto', paddingTop: Spacing['9'], gap: Spacing['1'] },
  another: { alignSelf: 'center' },
});
