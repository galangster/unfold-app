import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  ChatCircleDotsIcon,
  BookOpenIcon,
  EyeIcon,
  PencilSimpleIcon,
  HandsPrayingIcon,
  CheckCircleIcon,
} from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { normalizeSoapResponses } from '@/lib/journal-entry-state';
import { format } from 'date-fns';
import { alpha } from '@/components/ui';
import { Typography } from '@/constants/typography';

function SoapSectionDisplay({
  soapKey,
  label,
  value,
  colors,
  icon,
}: {
  soapKey: string;
  label: string;
  value: string;
  colors: any;
  icon: React.ReactNode;
}) {
  if (!value.trim()) return null;
  return (
    <View style={{ marginBottom: Spacing['6'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: 10 }}>
        {icon}
        <Text
          style={{
            ...Typography.cardMeta,
            color: colors.accent,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: FontFamily.body,
          fontSize: FontSize.base,
          color: colors.text,
          lineHeight: 26,
          paddingLeft: Spacing['1'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function JournalDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ entryId: string }>();

  const entryId = params.entryId ?? '';

  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const entry = journalEntries.find((e) => e.id === entryId);
  const devotional = devotionals.find((d) => d.id === entry?.devotionalId);

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
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
            <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textHint, textAlign: 'center' }}>
              This entry may have been removed.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const entryDate = format(new Date(entry.createdAt), 'MMMM d, yyyy');
  const dayTitle = devotional?.days.find((d) => d.dayNumber === entry.dayNumber)?.title ?? '';
  const isSoap = entry.journalMode === 'soap';
  // A sync-restored entry can carry `{}` or a partial object; normalise before
  // reading the four fields.
  const soapResponses = normalizeSoapResponses(entry.soapResponses);
  const hasSoapContent = soapResponses && (
    soapResponses.scripture.trim() ||
    soapResponses.observation.trim() ||
    soapResponses.application.trim() ||
    soapResponses.prayer.trim()
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
            style={{ padding: Spacing['2'] }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.text,
              marginLeft: Spacing['2'],
            }}
          >
            Journal Entry
          </Text>

          {isSoap && (
            <View
              style={{
                marginLeft: Spacing['2'],
                paddingHorizontal: Spacing['1.5'],
                paddingVertical: 1,
                borderRadius: 4,
                backgroundColor: alpha(colors.accent, 0.08),
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: FontSize.xs,
                  color: colors.accent,
                }}
              >
                SOAP
              </Text>
            </View>
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingTop: Spacing['6'], paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
            {/* Meta info */}
            <View style={{ marginBottom: Spacing['6'] }}>
              <Text
                style={{
                  ...Typography.cardMeta,
                  color: colors.textHint,
                  marginBottom: Spacing['2'],
                }}
              >
                Day {entry.dayNumber} · {entryDate}
              </Text>

              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 21,
                  color: colors.text,
                  marginBottom: Spacing['1'],
                }}
              >
                {devotional?.title ?? 'Journal Entry'}
              </Text>

              {dayTitle && (
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: FontSize.sm,
                    color: colors.textSubtle,
                  }}
                >
                  {dayTitle}
                </Text>
              )}
            </View>

            {/* Divider */}
            <View
              style={{
                width: 40,
                height: 1,
                backgroundColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            />

            {/* Free-form Content */}
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

            {/* SOAP Responses */}
            {hasSoapContent && soapResponses && (
              <View style={{ marginTop: entry.content.trim().length > 0 ? Spacing['8'] : 0 }}>
                <SoapSectionDisplay
                  soapKey="scripture"
                  label="Scripture"
                  value={soapResponses.scripture}
                  colors={colors}
                  icon={<BookOpenIcon size={14} color={colors.accent} weight="light" />}
                />
                <SoapSectionDisplay
                  soapKey="observation"
                  label="Observation"
                  value={soapResponses.observation}
                  colors={colors}
                  icon={<EyeIcon size={14} color={colors.accent} weight="light" />}
                />
                <SoapSectionDisplay
                  soapKey="application"
                  label="Application"
                  value={soapResponses.application}
                  colors={colors}
                  icon={<PencilSimpleIcon size={14} color={colors.accent} weight="light" />}
                />
                <SoapSectionDisplay
                  soapKey="prayer"
                  label="Prayer"
                  value={soapResponses.prayer}
                  colors={colors}
                  icon={<HandsPrayingIcon size={14} color={colors.accent} weight="light" />}
                />
              </View>
            )}

            {/* Question Responses */}
            {entry.questionResponses && entry.questionResponses.length > 0 && (
              <View style={{ marginTop: entry.content.trim().length > 0 || hasSoapContent ? Spacing['8'] : 0 }}>
                {(entry.content.trim().length > 0 || hasSoapContent) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: Spacing['5'] }}>
                    <ChatCircleDotsIcon size={14} color={colors.accent} weight="light" />
                    <Text
                      style={{
                        ...Typography.cardMeta,
                        color: colors.accent,
                        opacity: 0.8,
                      }}
                    >
                      Reflections
                    </Text>
                  </View>
                )}

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

            {/* Prayer Requests */}
            {entry.prayerRequests && entry.prayerRequests.length > 0 && (
              <View style={{ marginTop: Spacing['8'] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: Spacing['5'] }}>
                  <HandsPrayingIcon size={14} color={colors.accent} weight="light" />
                  <Text
                    style={{
                      ...Typography.cardMeta,
                      color: colors.accent,
                      opacity: 0.8,
                    }}
                  >
                    Prayer Requests
                  </Text>
                </View>

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
                            fontFamily: FontFamily.ui,
                            fontSize: 11,
                            color: colors.accent,
                            marginTop: Spacing['1'],
                          }}
                        >
                          Answered {format(new Date(prayer.answeredAt), 'MMM d, yyyy')}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
