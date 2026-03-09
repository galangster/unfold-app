import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, BookOpenIcon, LockIcon, CheckIcon, DownloadSimpleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, Devotional } from '@/lib/store';
import { format } from 'date-fns';
import { exportDevotionalToPDF, isPDFExportSupported } from '@/lib/pdf-export';

export default function PastDevotionalsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const user = useUnfoldStore((s) => s.user);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const checkIns = useUnfoldStore((s) => s.checkIns);

  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportSuccessId, setExportSuccessId] = useState<string | null>(null);

  const handleSelectDevotional = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDevotional(id);
    router.push('/(tabs)/(today)/reading');
  }, [setCurrentDevotional, router]);

  const handleExportPDF = useCallback(async (devotional: Devotional) => {
    if (exportingId) return;

    // TODO: re-enable premium gate after testing
    // if (!user?.isPremium) {
    //   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    //   router.push('/paywall');
    //   return;
    // }

    if (!isPDFExportSupported()) {
      return;
    }

    setExportingId(devotional.id);
    try {
      // Gather journal entries for this devotional
      const devJournals = journalEntries
        .filter((j) => j.devotionalId === devotional.id)
        .map((j) => ({
          dayNumber: j.dayNumber,
          content: j.content,
          questionResponses: j.questionResponses,
        }));

      // Gather check-ins for this devotional
      const devCheckIns = checkIns
        .filter((c) => c.devotionalId === devotional.id)
        .map((c) => ({
          dayNumber: c.dayNumber,
          mood: c.mood,
          moodLabel: c.moodLabel,
        }));

      await exportDevotionalToPDF(devotional, {
        accentColor: colors.accent,
        journalEntries: devJournals,
        checkIns: devCheckIns,
      });
      setExportSuccessId(devotional.id);
      setTimeout(() => setExportSuccessId(null), 2000);
    } finally {
      setExportingId(null);
    }
  }, [exportingId, user?.isPremium, router, journalEntries, checkIns, colors.accent]);

  const renderItem = useCallback(({ item }: { item: Devotional }) => {
    const completedDays = item.days.filter((d) => d.isRead).length;
    const progress = (completedDays / item.totalDays) * 100;
    const createdDate = format(new Date(item.createdAt), 'MMM d, yyyy');

    return (
      <View
        style={{
          backgroundColor: colors.inputBackground,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          marginBottom: 12,
        }}
      >
        {/* Top row: date + download circle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text
            style={{
              fontFamily: FontFamily.mono,
              fontSize: 11,
              color: colors.textHint,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {createdDate}
          </Text>

          <Pressable
            onPress={() => handleExportPDF(item)}
            disabled={exportingId !== null}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: `${colors.accent}15`,
              justifyContent: 'center',
              alignItems: 'center',
              opacity: exportingId !== null && exportingId !== item.id ? 0.3 : 1,
            }}
          >
            {exportingId === item.id ? (
              <ActivityIndicator size={18} color={colors.accent} />
            ) : exportSuccessId === item.id ? (
              <CheckIcon size={22} color={colors.accent} weight="bold" />
            ) : (
              <DownloadSimpleIcon size={22} color={colors.accent} weight="regular" />
            )}
          </Pressable>
        </View>

        {/* Tappable content area */}
        <Pressable
          onPress={() => handleSelectDevotional(item.id)}
          style={{ opacity: 1 }}
        >
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 22,
              color: colors.text,
              lineHeight: 28,
              marginBottom: 12,
            }}
          >
            {item.title}
          </Text>

          <View
            style={{
              height: 2,
              backgroundColor: colors.border,
              borderRadius: 1,
              marginBottom: 8,
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${progress}%`,
                backgroundColor: colors.accent,
                borderRadius: 1,
              }}
            />
          </View>

          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              color: colors.textSubtle,
            }}
          >
            Day {item.currentDay} of {item.totalDays}
          </Text>
        </Pressable>
      </View>
    );
  }, [colors, exportingId, exportSuccessId, handleSelectDevotional, handleExportPDF, user?.isPremium]);

  if (devotionals.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 8 }}
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </Pressable>

            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 16,
                color: colors.text,
                marginLeft: 8,
              }}
            >
              Past Journeys
            </Text>
          </View>

          <Animated.View
            entering={FadeIn.duration(400)}
            style={{ alignItems: 'center', paddingTop: 60 }}
          >
            <BookOpenIcon size={48} color={colors.textHint} weight="light" />
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 16,
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: 16,
              }}
            >
              No devotionals yet
            </Text>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 8 }}
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </Pressable>

          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 16,
              color: colors.text,
              marginLeft: 8,
            }}
          >
            Past Journeys
          </Text>
        </View>

        <FlashList
          data={devotionals}
          renderItem={renderItem as any}
          keyExtractor={(item: Devotional) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 } as any}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
}
