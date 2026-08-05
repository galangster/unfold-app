import { useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, TrashIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { performFullLocalReset } from '@/lib/full-reset';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { RemindersSection } from '@/components/settings/RemindersSection';
import { WritingStyleSection } from '@/components/settings/WritingStyleSection';
import { SupportSection } from '@/components/settings/SupportSection';
import { QaToolsSection } from '@/components/settings/QaToolsSection';
import { SettingsSectionHeader, getSettingsCardStyle } from '@/components/settings/SettingsSectionHeader';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  // Cross-tab entries (reader sheets) pass `from: 'bible' | 'home'` so back
  // returns to the source tab; without a `from` param (opened from the You
  // screen gear) this pops normally back to You.
  const { handleBack } = useCrossTabBack();

  // Premium sheet state is owned here — sections request it via
  // `onPremiumFeature` instead of owning their own sheet instances.
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const [premiumFeature, setPremiumFeature] = useState<'voice' | 'theme' | 'font' | 'general' | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleResetData = async () => {
    if (isDeletingAccount) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Reset all data?',
      'This will permanently delete all your devotionals, journal entries, and settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'This will permanently delete your data from this device and disconnect this install from your synced data. This cannot be undone.',
              [
                { text: 'Go Back', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeletingAccount(true);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    try {
                      await performFullLocalReset();
                      router.dismissAll();
                      setTimeout(() => router.replace('/'), 50);
                    } finally {
                      setIsDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="settings-screen">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header — back chevron pattern from streak-settings.tsx */}
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.7} onPress={handleBack} style={styles.backButton} testID="settings-back-button" accessibilityLabel="Go back" accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <CaretLeftIcon size={24} color={colors.text} weight="light" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Settings
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: Spacing['6'] }}>
            {/* Theme (light/dark/system) from AppearanceSection is also
                surfaced as an "Appearance" row on the You profile's Habits
                card — both read/write the same user.themeMode field. Accent
                colors, reading font, and font size stay settings-only. */}
            <AppearanceSection onPremiumFeature={setPremiumFeature} />

            {/* Midday check-in, evening wind-down, and daily reminders from
                RemindersSection are also surfaced on the You profile's
                Habits card (src/app/(tabs)/(you)/index.tsx) — same store
                fields and paywall gate, no duplicated logic. */}
            <RemindersSection />

            <WritingStyleSection />

            <SupportSection />

            <QaToolsSection />

            {/* --- Data / Danger zone --- */}
            <SettingsSectionHeader label="Data" />

            <View style={getSettingsCardStyle(colors)}>
              <TouchableOpacity activeOpacity={0.7} onPress={handleResetData} disabled={isDeletingAccount} accessibilityState={{ disabled: isDeletingAccount }}>
                <View
                  style={{
                    paddingVertical: Spacing['3.5'],
                    paddingHorizontal: Spacing['4'],
                    flexDirection: 'row',
                    alignItems: 'center',
                    opacity: isDeletingAccount ? 0.6 : 1,
                  }}
                >
                  {isDeletingAccount ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <TrashIcon size={20} color={colors.error} weight="light" />
                  )}
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.error,
                      marginLeft: Spacing['3'],
                    }}
                  >
                    {isDeletingAccount ? 'Resetting...' : 'Reset all data'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* App info */}
            <View style={{ marginTop: Spacing['12'], alignItems: 'center', marginBottom: Spacing['6'] }}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 21,
                  letterSpacing: -0.2,
                  color: colors.textHint,
                }}
              >
                Unfold
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  color: colors.textHint,
                  marginTop: Spacing['1'],
                }}
              >
                Version 1.0.0
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <PremiumFeatureSheet
        visible={!!premiumFeature || showPremiumSheet}
        onClose={() => {
          setPremiumFeature(null);
          setShowPremiumSheet(false);
        }}
        feature={premiumFeature ?? 'general'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  backButton: {
    padding: Spacing['2'],
  },
  headerTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    marginLeft: Spacing['3'],
  },
});
