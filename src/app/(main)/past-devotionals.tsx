import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
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

  const handleSelectDevotional = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDevotional(id);
    router.push('/(main)/reading');
  };

  const [exportSuccessId, setExportSuccessId] = useState<string | null>(null);

  const handleExportPDF = async (devotional: Devotional) => {
    // Prevent double-tap
    if (exportingId) return;

    // Check if user is premium
    if (!user?.isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/paywall');
      return;
    }

    // Check if supported
    if (!isPDFExportSupported()) {
      Alert.alert(
        'Not Available',
        'PDF export is not available on this platform. Please use the mobile app.',
        [{ text: 'OK' }]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExportingId(devotional.id);

    try {
      const success = await exportDevotionalToPDF(devotional);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setExportSuccessId(devotional.id);
        // Clear success state after 2 seconds
        setTimeout(() => setExportSuccessId(null), 2000);
      } else {
        Alert.alert(
          'Export Failed',
          'Unable to export PDF. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert(
        'Export Failed',
        'An error occurred while exporting.',
        [{ text: 'OK' }]
      );
    } finally {
      setExportingId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
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

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {devotionals.length === 0 ? (
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
          ) : (
            devotionals.map((devotional, index) => {
              const completedDays = devotional.days.filter((d) => d.isRead).length;
              const progress = (completedDays / devotional.totalDays) * 100;
              const createdDate = format(new Date(devotional.createdAt), 'MMM d, yyyy');

              return (
                <Animated.View
                  key={devotional.id}
                  entering={FadeInDown.duration(400).delay(index * 100)}
                >
                  <Pressable
                    onPress={() => handleSelectDevotional(devotional.id)}
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
                      {devotional.title}
                    </Text>

                    {/* Progress */}
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
                        Day {devotional.currentDay} of {devotional.totalDays}
                      </Text>

                      {/* Export PDF button - text only */}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleExportPDF(devotional);
                        }}
                        disabled={exportingId !== null}
                        accessibilityState={{ disabled: exportingId !== null }}
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
                        {exportingId === devotional.id ? (
                          <ActivityIndicator size="small" color={colors.accent} />
                        ) : exportSuccessId === devotional.id ? (
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
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
