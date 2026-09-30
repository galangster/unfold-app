import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { ReaderText as Text } from '@/components/reading/ReaderText';
import { FacingPanes } from '@/components/ui/FacingPanes';
import { Duration, Ease } from '@/constants/animations';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useReaderScripture } from '@/hooks/useReaderScripture';
import { ADAPTIVE_READABLE_MEASURE, adaptiveFrameStyle, resolveAdaptivePanes } from '@/lib/adaptive-layout';
import { selectRenderableDevotionalDay } from '@/lib/devotional-canonical-days';
import { dismissOr } from '@/lib/navigation';
import { FONT_SIZE_VALUES, useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { preventOrphan, stripOuterQuotes } from '@/lib/cn';
import { parsePositiveInteger } from '@/lib/reveal-params';

type StayFocus = 'prayer' | 'passage';

const KEEP_AWAKE_TAG = 'unfold-stay';
/** The screen stays awake this long after the last touch, then may sleep. */
const STAY_KEEP_AWAKE_MS = 15 * 60 * 1000;

const MISSING_TEXT: Record<StayFocus, string> = {
  prayer: 'This prayer is not available on this device yet.',
  passage: 'This passage is not available on this device yet.',
};

/**
 * Keep the screen awake for STAY_KEEP_AWAKE_MS, so a device left standing
 * still sleeps in the end. The returned restart runs on any touch. The hold
 * is released on unmount.
 */
function useIdleKeepAwake(): () => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awake = useRef(false);

  const release = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!awake.current) return;
    awake.current = false;
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  }, []);

  const restart = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!awake.current) {
      awake.current = true;
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    }
    timer.current = setTimeout(release, STAY_KEEP_AWAKE_MS);
  }, [release]);

  useEffect(() => {
    restart();
    return release;
  }, [restart, release]);

  return restart;
}

/**
 * "Stay with this prayer": one text, full screen, with the screen kept awake.
 * Standing with the device keeps this one task (DESIGN.md, the reflection
 * desk, accepted 2026-09-14). `focus` picks the text: the closing prayer (the
 * default) or the day's passage. On paired panes the other text faces it.
 * Closing returns to the reader, which stays mounted underneath, so its
 * scroll position is unchanged.
 */
export default function StayScreen() {
  const restartKeepAwake = useIdleKeepAwake();
  const router = useRouter();
  const params = useLocalSearchParams<{ devotionalId?: string; dayNumber?: string; focus?: string }>();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const adaptiveLayout = useAdaptiveLayout();
  const readingFont = useReadingFont();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const user = useUnfoldStore((s) => s.user);

  const focus: StayFocus = params.focus === 'passage' ? 'passage' : 'prayer';
  const facing: StayFocus = focus === 'prayer' ? 'passage' : 'prayer';
  const dayNumber = parsePositiveInteger(params.dayNumber) ?? 0;
  const devotional = useMemo(
    () => devotionals.find((d) => d.id === params.devotionalId),
    [devotionals, params.devotionalId],
  );
  const renderableDay = useMemo(
    () => selectRenderableDevotionalDay(devotional, dayNumber),
    [devotional, dayNumber],
  );
  const day = renderableDay.status === 'ready' ? renderableDay.day : undefined;
  // The same words the reader showed: its translation first, then the day's text.
  const passageText = useReaderScripture(day?.scriptureReference, day?.scriptureText);
  const texts: Record<StayFocus, string | undefined> = {
    prayer: day?.closingPrayer,
    passage: passageText ? stripOuterQuotes(passageText) : undefined,
  };

  const panes = resolveAdaptivePanes(adaptiveLayout, { stacked: true });
  const fontSizes = FONT_SIZE_VALUES[user?.fontSize ?? 'medium'];
  const primaryFontSize = Math.round(fontSizes.scripture * 1.2);

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissOr(router, '/(tabs)/(today)');
  };

  const label = day?.title ? (
    <Text accessibilityRole="header" numberOfLines={2} style={[styles.label, { color: colors.textMuted }]}>
      {day.title}
    </Text>
  ) : null;

  // The focused text reads large. The other one reads at scripture size and
  // muted, as a verse faces its collect in a prayer book.
  const readerText = (kind: StayFocus, primary: boolean) => {
    const fontSize = primary ? primaryFontSize : fontSizes.scripture;
    const body = texts[kind];
    return (
      <>
        <Text
          testID={`stay-${kind}`}
          style={{
            fontFamily: readingFont.body,
            fontSize,
            lineHeight: Math.round(fontSize * 1.6),
            color: primary ? colors.text : colors.textMuted,
          }}
        >
          {body ? preventOrphan(body) : MISSING_TEXT[kind]}
        </Text>
        {kind === 'passage' && body && day?.scriptureReference ? (
          <Text style={[styles.reference, { color: colors.accent }]}>{day.scriptureReference}</Text>
        ) : null}
      </>
    );
  };

  const done = (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleDone}
      accessibilityRole="button"
      accessibilityHint="Returns to the reading"
      testID="stay-done"
      style={[styles.doneButton, { borderColor: colors.border }]}
    >
      <Text style={[styles.doneLabel, { color: colors.text }]}>Done</Text>
    </TouchableOpacity>
  );

  const primaryPage = (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.centered}
      showsVerticalScrollIndicator={false}
    >
      <View style={adaptiveFrameStyle(ADAPTIVE_READABLE_MEASURE)}>
        {panes ? null : label}
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}>
          {readerText(focus, true)}
        </Animated.View>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
      onAccessibilityEscape={handleDone}
      onTouchStart={restartKeepAwake}
      testID="stay-screen"
    >
      <Stack.Screen options={{ animation: reducedMotion ? 'none' : 'fade' }} />
      <FacingPanes
        panes={panes}
        divider={false}
        testID="stay-panes"
        first={
          <View style={styles.fill}>
            {primaryPage}
            {panes ? null : <View style={styles.singleDone}>{done}</View>}
          </View>
        }
        second={panes ? (
          <View style={styles.fill}>
            <ScrollView style={styles.fill} contentContainerStyle={styles.centered} showsVerticalScrollIndicator={false}>
              <View style={adaptiveFrameStyle(ADAPTIVE_READABLE_MEASURE)}>
                {label}
                {texts[facing] ? <View style={styles.facing}>{readerText(facing, false)}</View> : null}
              </View>
            </ScrollView>
            {/* Done stays put below a long text, at the bottom of the page. */}
            <View style={styles.singleDone}>{done}</View>
          </View>
        ) : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['8'],
    paddingVertical: Spacing['10'],
  },
  label: {
    ...Typography.cardMeta,
    marginBottom: Spacing['6'],
  },
  facing: { marginBottom: Spacing['10'] },
  reference: { ...Typography.cardMeta, marginTop: Spacing['3'] },
  singleDone: { alignItems: 'center', paddingVertical: Spacing['6'] },
  doneButton: {
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: Spacing['8'],
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: { ...Typography.uiLg },
});
