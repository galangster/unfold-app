import { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { ReaderText as Text } from '@/components/reading/ReaderText';
import { FacingPanes } from '@/components/ui/FacingPanes';
import { Duration, Ease } from '@/constants/animations';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { ADAPTIVE_READABLE_MEASURE, adaptiveFrameStyle, resolveAdaptivePanes } from '@/lib/adaptive-layout';
import { selectRenderableDevotionalDay } from '@/lib/devotional-canonical-days';
import { dismissOr } from '@/lib/navigation';
import { FONT_SIZE_VALUES, useUnfoldStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { preventOrphan } from '@/lib/cn';
import { parsePositiveInteger } from '@/lib/reveal-params';

/**
 * "Stay with this prayer": one closing prayer, full screen, with the screen
 * kept awake. Standing with the device keeps this one task (DESIGN.md, the
 * reflection desk, accepted 2026-09-14). Closing returns to the reader, which
 * stays mounted underneath, so its scroll position is unchanged.
 */
export default function StayScreen() {
  useKeepAwake();
  const router = useRouter();
  const params = useLocalSearchParams<{ devotionalId?: string; dayNumber?: string }>();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const adaptiveLayout = useAdaptiveLayout();
  const readingFont = useReadingFont();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const user = useUnfoldStore((s) => s.user);

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
  const prayer = day?.closingPrayer;

  const panes = resolveAdaptivePanes(adaptiveLayout, { stacked: true });
  const fontSizes = FONT_SIZE_VALUES[user?.fontSize ?? 'medium'];
  const prayerFontSize = Math.round(fontSizes.scripture * 1.2);

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissOr(router, '/(tabs)/(today)');
  };

  const label = day?.title ? (
    <Text numberOfLines={2} style={[styles.label, { color: colors.textMuted }]}>
      {day.title}
    </Text>
  ) : null;

  // The day's passage faces the prayer, as a verse faces its collect in a
  // prayer book.
  const passage = panes && day?.scriptureText ? (
    <View style={[adaptiveFrameStyle(ADAPTIVE_READABLE_MEASURE), styles.passage]}>
      <Text
        style={{
          fontFamily: readingFont.body,
          fontSize: fontSizes.scripture,
          lineHeight: Math.round(fontSizes.scripture * 1.6),
          color: colors.textMuted,
          textAlign: 'center',
        }}
      >
        {preventOrphan(day.scriptureText)}
      </Text>
      {day.scriptureReference ? (
        <Text style={[styles.reference, { color: colors.accent }]}>{day.scriptureReference}</Text>
      ) : null}
    </View>
  ) : null;

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

  const prayerText = (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}>
      <Text
        testID="stay-prayer"
        style={{
          fontFamily: readingFont.body,
          fontSize: prayerFontSize,
          lineHeight: Math.round(prayerFontSize * 1.6),
          color: colors.text,
        }}
      >
        {prayer ? preventOrphan(prayer) : 'This prayer is not available on this device yet.'}
      </Text>
    </Animated.View>
  );

  const prayerPage = (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.centered}
      showsVerticalScrollIndicator={false}
    >
      <View style={adaptiveFrameStyle(ADAPTIVE_READABLE_MEASURE)}>
        {panes ? null : label}
        {prayerText}
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ animation: reducedMotion ? 'none' : 'fade' }} />
      <FacingPanes
        panes={panes}
        divider={false}
        testID="stay-panes"
        first={
          <View style={styles.fill}>
            {prayerPage}
            {panes ? null : <View style={styles.singleDone}>{done}</View>}
          </View>
        }
        second={panes ? (
          <ScrollView style={styles.fill} contentContainerStyle={styles.centered} showsVerticalScrollIndicator={false}>
            {label}
            {passage}
            {done}
          </ScrollView>
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
    textAlign: 'center',
    marginBottom: Spacing['6'],
  },
  passage: { alignItems: 'center', marginBottom: Spacing['10'] },
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
