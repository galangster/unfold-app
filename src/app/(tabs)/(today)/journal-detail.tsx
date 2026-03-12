import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  ChatCircleDotsIcon,
  BookOpenIcon,
  EyeIcon,
  PencilSimpleIcon,
  HandsPrayingIcon,
  CheckCircleIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, SoapResponses } from '@/lib/store';
import { format } from 'date-fns';

const SOAP_LABELS: { key: keyof SoapResponses; label: string; icon: React.ReactNode }[] = [];

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
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {icon}
        <Text
          style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: 12,
            color: colors.accent,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: FontFamily.body,
          fontSize: 16,
          color: colors.text,
          lineHeight: 26,
          paddingLeft: 4,
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
  const params = useLocalSearchParams<{ entryId: string }>();

  const entryId = params.entryId ?? '';

  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const entry = journalEntries.find((e) => e.id === entryId);
  const devotional = devotionals.find((d) => d.id === entry?.devotionalId);

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: FontFamily.body, color: colors.textMuted }}>Entry not found</Text>
      </View>
    );
  }

  const entryDate = format(new Date(entry.createdAt), 'MMMM d, yyyy');
  const dayTitle = devotional?.days.find((d) => d.dayNumber === entry.dayNumber)?.title ?? '';
  const isSoap = entry.journalMode === 'soap';
  const hasSoapContent = entry.soapResponses && (
    entry.soapResponses.scripture.trim() ||
    entry.soapResponses.observation.trim() ||
    entry.soapResponses.application.trim() ||
    entry.soapResponses.prayer.trim()
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
            style={{ padding: 8 }}
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 16,
              color: colors.text,
              marginLeft: 8,
            }}
          >
            Journal Entry
          </Text>

          {isSoap && (
            <View
              style={{
                marginLeft: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: colors.accent + '15',
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.mono,
                  fontSize: 10,
                  color: colors.accent,
                  letterSpacing: 1,
                }}
              >
                SOAP
              </Text>
            </View>
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(400)}>
            {/* Meta info */}
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontFamily: FontFamily.mono,
                  fontSize: 11,
                  color: colors.textHint,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Day {entry.dayNumber} · {entryDate}
              </Text>

              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 24,
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                {devotional?.title ?? 'Journal Entry'}
              </Text>

              {dayTitle && (
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 14,
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
                marginBottom: 24,
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
            {hasSoapContent && entry.soapResponses && (
              <View style={{ marginTop: entry.content.trim().length > 0 ? 32 : 0 }}>
                <SoapSectionDisplay
                  soapKey="scripture"
                  label="Scripture"
                  value={entry.soapResponses.scripture}
                  colors={colors}
                  icon={<BookOpenIcon size={14} color={colors.accent} weight="light" />}
                />
                <SoapSectionDisplay
                  soapKey="observation"
                  label="Observation"
                  value={entry.soapResponses.observation}
                  colors={colors}
                  icon={<EyeIcon size={14} color={colors.accent} weight="light" />}
                />
                <SoapSectionDisplay
                  soapKey="application"
                  label="Application"
                  value={entry.soapResponses.application}
                  colors={colors}
                  icon={<PencilSimpleIcon size={14} color={colors.accent} weight="light" />}
                />
                <SoapSectionDisplay
                  soapKey="prayer"
                  label="Prayer"
                  value={entry.soapResponses.prayer}
                  colors={colors}
                  icon={<HandsPrayingIcon size={14} color={colors.accent} weight="light" />}
                />
              </View>
            )}

            {/* Question Responses */}
            {entry.questionResponses && entry.questionResponses.length > 0 && (
              <View style={{ marginTop: entry.content.trim().length > 0 || hasSoapContent ? 32 : 0 }}>
                {(entry.content.trim().length > 0 || hasSoapContent) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <ChatCircleDotsIcon size={14} color={colors.accent} weight="light" />
                    <Text
                      style={{
                        fontFamily: FontFamily.mono,
                        fontSize: 10,
                        color: colors.accent,
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                        opacity: 0.8,
                      }}
                    >
                      Reflections
                    </Text>
                  </View>
                )}

                {entry.questionResponses
                  .filter((qr) => qr.response.trim().length > 0)
                  .map((qr, idx) => (
                    <View
                      key={idx}
                      style={{
                        marginBottom: 24,
                        paddingLeft: 16,
                        borderLeftWidth: 2,
                        borderLeftColor: colors.accent + '50',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.bodyItalic,
                          fontSize: 14,
                          color: colors.textMuted,
                          lineHeight: 22,
                          marginBottom: 8,
                        }}
                      >
                        {qr.question}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 16,
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
              <View style={{ marginTop: 32 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <HandsPrayingIcon size={14} color={colors.accent} weight="light" />
                  <Text
                    style={{
                      fontFamily: FontFamily.mono,
                      fontSize: 10,
                      color: colors.accent,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
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
                      paddingLeft: 4,
                    }}
                  >
                    {prayer.isAnswered ? (
                      <CheckCircleIcon size={16} color={colors.accent} weight="fill" style={{ marginTop: 3 }} />
                    ) : (
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
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
                            marginTop: 4,
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
