import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, BookOpen, Lock, Check } from 'lucide-react-native';
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

  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportSuccessId, setExportSuccessId] = useState<string | null>(null);

  const handleSelectDevotional = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDevotional(id);
    router.push('/(main)/reading');
  }, [setCurrentDevotional, router]);

  const handleExportPDF = useCallback(async (devotional: Devotional) => {
    if (exportingId) return;

    if (!user?.isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/paywall');
      return;
    }

    if (!isPDFExportSupported()) {
      return;
    }

    setExportingId(devotional.id);
    try {
      await exportDevotionalToPDF(devotional);
      setExportSuccessId(devotional.id);
      setTimeout(() => setExportSuccessId(null), 2000);
    } finally {
      setExportingId(null);
    }
  }, [exportingId, user?.isPremium, router]);

  const renderItem = useCallback(({ item }: { item: Devotional }) => {
    const completedDays = item.days.filter((d) => d.isRead).length;
    const progress = (completedDays / item.totalDays) * 100;
    const createdDate = format(new Date(item.createdAt), 'MMM d, yyyy');

    return (
      <Pressable
        onPress={() => handleSelectDevotional(item.id)}
        style={({ pressed }) => ({
          backgroundColor: pressed ? colors.inputBackgroundFocused : colors.inputBackground,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          marginBottom: 12,
        })}
      >
        <Text
          style={{
            fontFamily: FontFamily.mono,
            fontSize: 11,
            color: colors.textHint,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {createdDate}
        </Text>

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

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              color: colors.textSubtle,
            }}
          >
            Day {item.currentDay} of {item.totalDays}
          </Text>

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              handleExportPDF(item);
            }}
            disabled={exportingId !== null}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.buttonBackground,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: exportingId !== null ? 0.6 : 1,
            })}
          >
            {exportingId === item.id ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : exportSuccessId === item.id ? (
              <>
                <Check size={12} color={colors.accent} />
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.accent,
                    marginLeft: 4,
                  }}
                >
                  Saved
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textMuted,
                  }}
                >
                  Download PDF
                </Text>
                {!user?.isPremium && (
                  <Lock size={10} color={colors.textHint} style={{ marginLeft: 6 }} />
                )}
              </>
            )}
          </Pressable>
        </View>
      </Pressable>
    );
  }, [colors, exportingId, exportSuccessId, handleSelectDevotional, handleExportPDF, user?.isPremium]);

  if (devotionals.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View className="flex-row items-center px-4 py-3">
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
              Past Devotionals
            </Text>
          </View>

          <Animated.View
            entering={FadeIn.duration(400)}
            style={{ alignItems: 'center', paddingTop: 60 }}
          >
            <BookOpen size={48} color={colors.textHint} />
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
        <View className="flex-row items-center px-4 py-3">
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
            Past Devotionals
          </Text>
        </View>

        <FlashList
          data={devotionals}
          renderItem={renderItem as any}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={150}
        />
      </SafeAreaView>
    </View>
  );
}
