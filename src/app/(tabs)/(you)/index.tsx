import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  GearIcon,
  FireIcon,
  BookOpenIcon,
  BookmarkSimpleIcon,
  PencilLineIcon,
  ChartBarIcon,
  CaretRightIcon,
  CrownIcon,
  SparkleIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { StreakDisplay } from '@/components/StreakDisplay';
import { useQuery } from '@tanstack/react-query';
import { hasEntitlement, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';

interface MenuItem {
  icon: typeof GearIcon;
  label: string;
  subtitle?: string;
  route: string;
  accent?: boolean;
}

export default function YouScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);

  const { data: premiumResult } = useQuery({
    queryKey: ['revenuecat', 'premium'],
    queryFn: () => hasEntitlement('Unfold Premium'),
    enabled: isRevenueCatEnabled(),
    staleTime: 1000 * 60,
  });

  const isPremium = premiumResult?.ok ? premiumResult.data : user?.isPremium ?? false;
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);

  const menuItems: MenuItem[] = [
    {
      icon: FireIcon,
      label: 'Streak & Goals',
      subtitle: streakCurrent > 0 ? `${streakCurrent} day streak` : 'Build your rhythm',
      route: '/(tabs)/(you)/streak-settings',
    },
    {
      icon: BookOpenIcon,
      label: 'Past Journeys',
      subtitle: `${devotionals.length} ${devotionals.length === 1 ? 'journey' : 'journeys'}`,
      route: '/(tabs)/(you)/past-devotionals',
    },
    {
      icon: BookmarkSimpleIcon,
      label: 'Saved Passages',
      subtitle: `${bookmarks.length} ${bookmarks.length === 1 ? 'passage' : 'passages'}`,
      route: '/(tabs)/(you)/saved-passages',
    },
    {
      icon: PencilLineIcon,
      label: 'My Content',
      subtitle: 'Journal, highlights & bookmarks',
      route: '/(tabs)/(you)/my-content',
    },
    {
      icon: ChartBarIcon,
      label: 'Reading Stats',
      subtitle: 'Your journey in numbers',
      route: '/(tabs)/(you)/stats',
    },
    {
      icon: GearIcon,
      label: 'Settings',
      subtitle: 'Preferences, theme & voice',
      route: '/(tabs)/(you)/settings',
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View
            entering={FadeIn.duration(700)}
            style={{
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 24,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 34,
                color: colors.text,
                letterSpacing: -0.5,
                marginBottom: 4,
              }}
            >
              {user?.name ?? 'You'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <StreakDisplay compact hideDayLabel />
              {isPremium && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: colors.accent + '20',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}
                >
                  <CrownIcon size={12} color={colors.accent} weight="fill" />
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 11,
                      color: colors.accent,
                    }}
                  >
                    Premium
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Upgrade card (non-premium only) */}
          {!isPremium && (
            <Animated.View
              entering={FadeInDown.duration(600).delay(50)}
              style={{ paddingHorizontal: 24, marginBottom: 20 }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/paywall');
                }}
                style={{ opacity: 1 }}
              >
                <View
                  style={{
                    borderRadius: 18,
                    overflow: 'hidden',
                    // Premium glow shadow
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 16,
                    elevation: 5,
                  }}
                >
                  <LinearGradient
                    colors={[colors.accent, colors.accent + 'CC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      padding: 22,
                      borderRadius: 18,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <CrownIcon size={20} color={colors.background} weight="fill" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiSemiBold,
                            fontSize: 17,
                            color: colors.background,
                            letterSpacing: -0.2,
                          }}
                        >
                          Upgrade to Premium
                        </Text>
                      </View>
                      <SparkleIcon size={16} color={colors.background + 'AA'} weight="fill" />
                    </View>
                    <Text
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: 14,
                        color: colors.background,
                        opacity: 0.85,
                        lineHeight: 20,
                      }}
                    >
                      Unlock unlimited journeys, themes, and more
                    </Text>
                  </LinearGradient>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {/* Menu Items — grouped card */}
          <Animated.View
            entering={FadeInDown.duration(600).delay(100)}
            style={{ paddingHorizontal: 24 }}
          >
            <View
              style={{
                backgroundColor: colors.backgroundElevated,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                // Subtle lift for menu group
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 10,
                elevation: 2,
                overflow: 'hidden',
              }}
            >
              {menuItems.map((item, index) => (
                <Pressable
                  key={item.label}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(item.route as any);
                  }}
                  style={{ opacity: 1 }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderBottomWidth: index < menuItems.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: colors.accent + '10',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 14,
                      }}
                    >
                      <item.icon size={18} color={colors.accent} weight="light" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 15,
                          color: colors.text,
                        }}
                      >
                        {item.label}
                      </Text>
                      {item.subtitle && (
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: 13,
                            color: colors.textSubtle,
                            marginTop: 2,
                          }}
                        >
                          {item.subtitle}
                        </Text>
                      )}
                    </View>
                    <CaretRightIcon size={16} color={colors.textSubtle} weight="light" />
                  </View>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="general"
      />
    </View>
  );
}
