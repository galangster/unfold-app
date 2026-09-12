import { useState, useCallback } from 'react';
import { View, Text, ScrollView, useWindowDimensions, TextInput } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
} from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { StreakDisplay } from '@/components/StreakDisplay';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { alpha } from '@/components/ui';
import { Spacing } from '@/constants/spacing';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import {
  ProfileSettingsSections,
  useSettingsSectionScroll,
} from '@/components/settings/ProfileSettingsSections';

interface MenuItem {
  icon: typeof BookOpenIcon;
  label: string;
  subtitle?: string;
  route: string;
}

export default function YouScreen() {
  const { fontScale } = useWindowDimensions();
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { scrollViewRef, handleScrollLayout, handleSectionLayout } = useSettingsSectionScroll(section);
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
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
  const isPremium = usePremiumAccessPolicy() === 'granted';

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

  const accountStatus = isPremium ? 'Premium' : 'Free plan';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="you-screen">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          key={fontScale}
          ref={scrollViewRef}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onLayout={handleScrollLayout}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            style={{
              paddingHorizontal: Spacing['6'],
              paddingTop: Spacing['4'],
              paddingBottom: Spacing['5'],
              alignItems: 'center',
            }}
          >
            <ProfileAvatar size={64} editable />
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
                  fontSize: 23,
                  color: colors.text,
                  letterSpacing: -0.15,
                  marginTop: 10,
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
                    fontSize: 23,
                    color: colors.text,
                    letterSpacing: -0.15,
                    marginTop: 10,
                    textAlign: 'center',
                  }}
                >
                  {user?.name ?? 'Add your name'}
                </Text>
              </TouchableOpacity>
            )}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: Spacing['3'],
                marginTop: Spacing['2'],
              }}
            >
              <StreakDisplay compact hideDayLabel />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing['1'],
                  backgroundColor: isPremium ? alpha(colors.accent, 0.13) : alpha(colors.text, 0.06),
                  paddingHorizontal: 10,
                  paddingVertical: Spacing['1'],
                  borderRadius: Radius.md,
                }}
              >
                {isPremium ? <CrownIcon size={12} color={colors.accent} weight="fill" /> : null}
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 11,
                    color: isPremium ? colors.accent : colors.textMuted,
                  }}
                >
                  {accountStatus}
                </Text>
              </View>
            </View>
          </Animated.View>

          {!isPremium && (
            <View style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['5'] }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  logger.log('[YOU] Premium banner tapped!');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/paywall');
                }}
              >
                <View
                  style={{
                    borderRadius: Radius.xl,
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
                      borderRadius: Radius.xl,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                        <CrownIcon size={20} color={colors.background} weight="fill" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiSemiBold,
                            fontSize: 17,
                            color: colors.background,
                            letterSpacing: -0.2,
                            flexShrink: 1,
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

          <View style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['6'] }}>
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
                <TouchableOpacity
                  activeOpacity={0.7}
                  key={item.label}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(item.route as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.subtitle ? `${item.label}, ${item.subtitle}` : item.label}
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
                        borderRadius: Radius.chip,
                        backgroundColor: alpha(colors.accent, 0.06),
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 14,
                      }}
                    >
                      <item.icon size={18} color={colors.accent} weight="light" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
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

          <ProfileSettingsSections onSectionLayout={handleSectionLayout} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
