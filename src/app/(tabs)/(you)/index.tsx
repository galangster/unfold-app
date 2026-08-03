import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity as RNTouchableOpacity } from 'react-native';
// react-native-gesture-handler's TouchableOpacity does not forward testID to the
// native accessibility identifier, so `--by-id` / Maestro `id:` cannot resolve it.
// The settings gear uses RN's so its testID is a real automation hook.
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Duration, Ease } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import {
  BookOpenIcon,
  PencilLineIcon,
  CaretRightIcon,
  CrownIcon,
  SparkleIcon,
  GearSixIcon,
  BellIcon,
  SunHorizonIcon,
  MoonIcon,
  PaletteIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { StreakDisplay } from '@/components/StreakDisplay';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { alpha } from '@/components/ui';
import { Spacing } from '@/constants/spacing';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { formatReminderTime } from '@/lib/format-reminder-time';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';

// --- Menu items ---

interface MenuItem {
  icon: typeof BookOpenIcon;
  label: string;
  subtitle?: string;
  route: string;
}

// --- Habit settings (promoted from the settings screen behind the gear) ---
// Only the habit-adjacent entries live here — check-in schedule, daily
// reminders, appearance. Account/legal/data-export/delete stay behind the
// gear icon (settings.tsx) so this card doesn't turn into a second full
// settings list.
interface HabitItem {
  icon: typeof BookOpenIcon;
  label: string;
  subtitle?: string;
  onPress: () => void;
}

const THEME_MODE_LABELS: Record<'dark' | 'light' | 'system', string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

export default function YouScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  // Name edit state — tapping the name on the profile swaps it for a
  // TextInput. Commit on blur or submit. Cancels back to the previous
  // value if the user clears the field entirely.
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const commitNameEdit = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (trimmed.length > 0 && trimmed !== user?.name) {
      updateUser({ name: trimmed });
    }
    setIsEditingName(false);
  }, [nameDraft, user?.name, updateUser]);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const highlights = useUnfoldStore((s) => s.highlights);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  // Tri-state premium policy — `unknown` is treated the same as `denied` in
  // UI so we never flash a churn upsell at cold start before RevenueCat has
  // reported.
  const isPremium = usePremiumAccessPolicy() === 'granted';

  // --- Habit card state — same store fields RemindersSection /
  // AppearanceSection read in settings.tsx, no duplicated logic.
  const middayCheckInEnabled = useUnfoldStore((s) => s.middayCheckInEnabled);
  const middayCheckInTime = useUnfoldStore((s) => s.middayCheckInTime);
  const eveningWindDownEnabled = useUnfoldStore((s) => s.eveningWindDownEnabled);
  const eveningWindDownTime = useUnfoldStore((s) => s.eveningWindDownTime);

  const openCheckInSchedule = useCallback((type: 'midday' | 'evening') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Same gate as RemindersSection's row handlers — non-premium taps route
    // to the paywall instead of the schedule picker.
    if (!isPremium) {
      router.push('/paywall');
      return;
    }
    router.push({ pathname: '/(tabs)/(you)/checkin-schedule', params: { type } });
  }, [isPremium, router]);

  const openSettings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(you)/settings');
  }, [router]);

  const habitItems: HabitItem[] = [
    {
      icon: SunHorizonIcon,
      label: 'Midday Check-In',
      subtitle: isPremium
        ? `${formatReminderTime(middayCheckInTime)}${middayCheckInEnabled ? '' : ' · Off'}`
        : 'Premium',
      onPress: () => openCheckInSchedule('midday'),
    },
    {
      icon: MoonIcon,
      label: 'Evening Wind-Down',
      subtitle: isPremium
        ? `${formatReminderTime(eveningWindDownTime)}${eveningWindDownEnabled ? '' : ' · Off'}`
        : 'Premium',
      onPress: () => openCheckInSchedule('evening'),
    },
    {
      icon: BellIcon,
      label: 'Daily Reminders',
      subtitle: user?.dailyReminderEnabled ? formatReminderTime(user.reminderTime ?? '8:00 AM') : 'Off',
      onPress: openSettings,
    },
    {
      icon: PaletteIcon,
      label: 'Appearance',
      subtitle: THEME_MODE_LABELS[user?.themeMode ?? 'dark'],
      onPress: openSettings,
    },
  ];

  const menuItems: MenuItem[] = [
    {
      icon: BookOpenIcon,
      label: 'Past Devotionals',
      subtitle: `${devotionals.length} ${devotionals.length === 1 ? 'devotional' : 'devotionals'}`,
      route: '/(tabs)/(you)/past-devotionals',
    },
    {
      icon: PencilLineIcon,
      label: 'My Library',
      subtitle: `${journalEntries.length + bookmarks.length + highlights.length} saved items`,
      route: '/(tabs)/(you)/my-content',
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="you-screen">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — avatar + name.
              The gear is a sibling of the animated block, absolutely
              positioned against this plain wrapper, NOT against the
              Animated.View. As an absolute child of the centered
              Animated.View it painted at the wrong x (left of the avatar
              instead of top-right) and produced no native view at all —
              so it was neither tappable nor visible to the accessibility
              tree, leaving Settings unreachable from this screen. */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              paddingHorizontal: Spacing['6'],
              paddingTop: Spacing['4'],
            }}
          >
            <RNTouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(you)/settings');
              }}
              testID="you-settings-button"
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: Spacing['2'] }}
            >
              <GearSixIcon size={22} color={colors.text} weight="light" />
            </RNTouchableOpacity>
          </View>
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            style={{
              paddingHorizontal: Spacing['6'],
              paddingBottom: Spacing['6'],
              alignItems: 'center',
            }}
          >
            <ProfileAvatar size={80} editable />
            {isEditingName ? (
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                onBlur={commitNameEdit}
                onSubmitEditing={commitNameEdit}
                autoFocus
                selectTextOnFocus
                maxLength={40}
                returnKeyType="done"
                placeholder="Your name"
                placeholderTextColor={colors.textHint}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 28,
                  color: colors.text,
                  letterSpacing: -0.5,
                  marginTop: 14,
                  textAlign: 'center',
                  minWidth: 120,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.accent,
                }}
              />
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setNameDraft(user?.name ?? '');
                  setIsEditingName(true);
                  Haptics.selectionAsync();
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit your name"
                accessibilityHint="Tap to change your display name"
              >
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 28,
                    color: colors.text,
                    letterSpacing: -0.5,
                    marginTop: 14,
                  }}
                >
                  {user?.name ?? 'Add your name'}
                </Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], marginTop: Spacing['2'] }}>
              <StreakDisplay compact hideDayLabel />
              {isPremium && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Spacing['1'],
                    backgroundColor: alpha(colors.accent, 0.13),
                    paddingHorizontal: 10,
                    paddingVertical: Spacing['1'],
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
              style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['5'] }}
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
                        fontSize: FontSize.sm,
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
              style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['5'] }}
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
                    shadowColor: colors.accent,
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
                        <SparkleIcon size={14} color={colors.accent} weight="fill" />
                        <Text
                          style={{
                            ...Typography.cardMeta,
                            color: colors.accent,
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
                    <CaretRightIcon size={18} color={colors.accent} weight="bold" />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Menu Items — grouped card */}
          <View
            style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['6'] }}
          >
            <View
              style={{
                backgroundColor: colors.backgroundElevated,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                ...Shadow.sm,
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
                      paddingHorizontal: Spacing['4'],
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

          {/* Habits — promoted subset of settings.tsx: check-in schedule,
              daily reminders, appearance. Rows reuse the same store fields
              and paywall gate as RemindersSection/AppearanceSection; the
              rest of settings (account, legal, data export/delete) stays
              behind the gear. Visible for free users too, below the
              upgrade card. */}
          <View
            style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['6'] }}
          >
            <SettingsSectionHeader label="Habits" />
            <View
              style={{
                backgroundColor: colors.backgroundElevated,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                ...Shadow.sm,
                overflow: 'hidden',
              }}
            >
              {habitItems.map((item, index) => (
                <TouchableOpacity activeOpacity={0.7}
                  key={item.label}
                  onPress={item.onPress}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: Spacing['4'],
                      borderBottomWidth: index < habitItems.length - 1 ? 1 : 0,
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
    </View>
  );
}
