import { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  CheckCircleIcon,
} from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { adaptiveFrameStyle, PRIMARY_SAFE_AREA_EDGES } from '@/lib/adaptive-layout';
import { useTheme } from '@/lib/theme';
import { useGuardedBack } from '@/hooks/useGuardedBack';
import { useUnfoldStore } from '@/lib/store';
import { normalizeSoapResponses } from '@/lib/journal-entry-state';
import { format } from 'date-fns';
import { Typography } from '@/constants/typography';

function SoapSectionDisplay({
  value,
  colors,
}: {
  value: string;
  colors: { text: string };
}) {
  if (!value.trim()) return null;
  return (
    <View style={{ marginBottom: Spacing['6'] }}>
      <Text
        style={{
          fontFamily: FontFamily.body,
          fontSize: FontSize.base,
          color: colors.text,
          lineHeight: 26,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function JournalDetailScreen() {
  const guardedBack = useGuardedBack();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const adaptiveLayout = useAdaptiveLayout();
  const clusterFrameStyle = adaptiveFrameStyle(adaptiveLayout.clusterMaxWidth);
  const readableFrameStyle = adaptiveFrameStyle(adaptiveLayout.readableMaxWidth);
  const params = useLocalSearchParams<{ entryId: string }>();

  const entryId = params.entryId ?? '';

  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const entry = journalEntries.find((e) => e.id === entryId);
  const devotional = devotionals.find((d) => d.id === entry?.devotionalId);

  // Shared by both header carets (the not-found shell and the entry itself).
  // journal-detail is deep-link allowlisted, so an arrival from an `unfold://`
  // link has no stack to pop.
  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedBack();
  }, [guardedBack]);

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={PRIMARY_SAFE_AREA_EDGES}>
          <View style={[clusterFrameStyle, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
            <TouchableOpacity
              onPress={handleBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              style={{ padding: Spacing['2'] }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['6'] }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.textMuted, marginBottom: Spacing['1'] }}>
              Entry not found
            </Text>
            <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center' }}>
              This entry may have been removed.
            </Text>
          </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const entryDate = format(new Date(entry.createdAt), 'MMMM d, yyyy');
  const dayTitle = devotional?.days.find((d) => d.dayNumber === entry.dayNumber)?.title ?? '';
  const soapResponses = normalizeSoapResponses(entry.soapResponses);
  const hasSoapContent = soapResponses && (
    soapResponses.scripture.trim() ||
    soapResponses.observation.trim() ||
    soapResponses.application.trim() ||
    soapResponses.prayer.trim()
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={PRIMARY_SAFE_AREA_EDGES}>
        <View style={clusterFrameStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
            style={{ padding: Spacing['2'] }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
        </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingTop: Spacing['6'], paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={readableFrameStyle}>
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
            <View style={{ marginBottom: Spacing['6'] }}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 21,
                  color: colors.text,
                  marginBottom: Spacing['1'],
                }}
              >
                {devotional?.title ?? 'Journal entry'}
              </Text>

              {dayTitle ? (
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: FontSize.sm,
                    color: colors.textMuted,
                    marginBottom: Spacing['2'],
                  }}
                >
                  {dayTitle}
                </Text>
              ) : null}

              <Text
                style={{
                  ...Typography.cardMeta,
                  color: colors.textMuted,
                }}
              >
                {`Day ${entry.dayNumber} · ${entryDate}`}
              </Text>
            </View>

            <View
              style={{
                width: 40,
                height: 1,
                backgroundColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            />

            {entry.content.trim().length > 0 && (
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 17,
                  color: colors.text,
                  lineHeight: 28,
                }}
              >
                {entry.content}
              </Text>
            )}

            {hasSoapContent && soapResponses && (
              <View style={{ marginTop: entry.content.trim().length > 0 ? Spacing['8'] : 0 }}>
                <SoapSectionDisplay value={soapResponses.scripture} colors={colors} />
                <SoapSectionDisplay value={soapResponses.observation} colors={colors} />
                <SoapSectionDisplay value={soapResponses.application} colors={colors} />
                <SoapSectionDisplay value={soapResponses.prayer} colors={colors} />
              </View>
            )}

            {entry.questionResponses && entry.questionResponses.length > 0 && (
              <View style={{ marginTop: entry.content.trim().length > 0 || hasSoapContent ? Spacing['8'] : 0 }}>
                {entry.questionResponses
                  .filter((qr) => qr.response.trim().length > 0)
                  .map((qr) => (
                    <View
                      key={qr.question}
                      style={{
                        marginBottom: Spacing['6'],
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.bodyItalic,
                          fontSize: FontSize.sm,
                          color: colors.textMuted,
                          lineHeight: 22,
                          marginBottom: Spacing['2'],
                        }}
                      >
                        {qr.question}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: FontSize.base,
                          color: colors.text,
                          lineHeight: 26,
                        }}
                      >
                        {qr.response}
                      </Text>
                    </View>
                  ))}
              </View>
            )}

            {entry.prayerRequests && entry.prayerRequests.length > 0 && (
              <View style={{ marginTop: Spacing['8'] }}>
                {entry.prayerRequests.map((prayer) => (
                  <View
                    key={prayer.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 10,
                      marginBottom: 14,
                      paddingLeft: Spacing['1'],
                    }}
                  >
                    {prayer.isAnswered ? (
                      <CheckCircleIcon size={16} color={colors.accent} weight="fill" style={{ marginTop: 3 }} />
                    ) : (
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: Radius.sm,
                          borderWidth: 1.5,
                          borderColor: colors.textHint,
                          marginTop: 3,
                        }}
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 15,
                          color: prayer.isAnswered ? colors.textMuted : colors.text,
                          lineHeight: 24,
                          textDecorationLine: prayer.isAnswered ? 'line-through' : 'none',
                        }}
                      >
                        {prayer.text}
                      </Text>
                      {prayer.isAnswered && prayer.answeredAt && (
                        <Text
                          style={{
                            ...Typography.cardMeta,
                            color: colors.textMuted,
                            marginTop: Spacing['1'],
                          }}
                        >
                          {format(new Date(prayer.answeredAt), 'MMM d, yyyy')}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
