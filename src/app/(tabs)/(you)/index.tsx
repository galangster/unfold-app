import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
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
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { StreakDisplay } from '@/components/StreakDisplay';
import { useQuery } from '@tanstack/react-query';
import { hasEntitlement, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { alpha } from '@/components/ui';

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
  const highlights = useUnfoldStore((s) => s.highlights);
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
      label: 'Past Series',
      subtitle: `${devotionals.length} ${devotionals.length === 1 ? 'series' : 'series'}`,
      route: '/(tabs)/(you)/past-devotionals',
    },
    {
      icon: BookmarkSimpleIcon,
      label: 'Your Library',
      subtitle: `${bookmarks.length + highlights.length} saved items`,
      route: '/(tabs)/(you)/saved',
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
      subtitle: 'Your progress',
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
          {/* Header — avatar + name */}
          <Animated.View
            entering={FadeIn.duration(700)}
            style={{
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 24,
              alignItems: 'center',
            }}
          >
            <ProfileAvatar size={80} editable />
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 28,
                color: colors.text,
                letterSpacing: -0.5,
                marginTop: 14,
              }}
            >
              {user?.name ?? 'You'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <StreakDisplay compact hideDayLabel />
              {isPremium && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: alpha(colors.accent, 0.13),
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: Radius.md,
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
            <View
              style={{ paddingHorizontal: 24, marginBottom: 20 }}
            >
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  logger.log('[YOU] Premium banner tapped!');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/paywall');
                }}
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
                    colors={[colors.accent, alpha(colors.accent, 0.80)]}
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
                      <SparkleIcon size={16} color={alpha(colors.background, 0.67)} weight="fill" />
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
                      Unlock unlimited series, themes, and more
                    </Text>
                  </LinearGradient>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Unfolded — year-in-review recap (hidden for polish) */}
          {false && devotionals.length > 0 && (
            <View
              style={{ paddingHorizontal: 24, marginBottom: 20 }}
            >
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/unfolded');
                }}

              >
                <View
                  style={{
                    borderRadius: 18,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: 'rgba(200, 165, 92, 0.2)',
                    backgroundColor: 'rgba(200, 165, 92, 0.06)',
                    shadowColor: '#C8A55C',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.12,
                    shadowRadius: 20,
                    elevation: 3,
                  }}
                >
                  <View
                    style={{
                      padding: 20,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <SparkleIcon size={14} color="#C8A55C" weight="fill" />
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: 11,
                            color: '#C8A55C',
                            letterSpacing: 1.5,
                            textTransform: 'uppercase',
                          }}
                        >
                          Your story so far
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: FontFamily.display,
                          fontSize: 26,
                          color: colors.text,
                          letterSpacing: -0.5,
                          marginBottom: 4,
                        }}
                      >
                        Unfolded
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 13,
                          color: colors.textSubtle,
                          lineHeight: 18,
                        }}
                      >
                        See your progress in a whole new way
                      </Text>
                    </View>
                    <CaretRightIcon size={18} color="#C8A55C" weight="bold" />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Menu Items — grouped card */}
          <View
            style={{ paddingHorizontal: 24 }}
          >
            <View
              style={{
                backgroundColor: colors.backgroundElevated,
                borderRadius: Radius.lg,
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
                <TouchableOpacity activeOpacity={0.7}
                  key={item.label}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(item.route as any);
                  }}
  
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
                        backgroundColor: alpha(colors.accent, 0.06),
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
                </TouchableOpacity>
              ))}
            </View>
          </View>
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
