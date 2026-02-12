import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { format } from 'date-fns';

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 8 }}
          >
            <ChevronLeft size={24} color={colors.textMuted} />
          </Pressable>

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

            {/* Content */}
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
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
