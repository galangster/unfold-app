import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Alert, ActivityIndicator, StyleSheet, ScrollView, UIManager, type LayoutChangeEvent } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import * as Haptics from 'expo-haptics';
import { TrashIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { performFullLocalReset } from '@/lib/full-reset';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { RemindersSection } from '@/components/settings/RemindersSection';
import { WritingStyleSection } from '@/components/settings/WritingStyleSection';
import { SupportSection } from '@/components/settings/SupportSection';
import { QaToolsSection } from '@/components/settings/QaToolsSection';
import { SettingsSectionHeader, getSettingsCardStyle } from '@/components/settings/SettingsSectionHeader';

const SERVER_ERASE_NOT_CONFIRMED_TITLE = 'Server data not confirmed deleted';
const SERVER_ERASE_NOT_CONFIRMED_MESSAGE =
  "Your data was deleted from this device, but we couldn't confirm that your synced data was deleted from Unfold's servers. This device is no longer linked to it. If you'd like it removed, contact us from the Support section in Profile.";

export type SettingsSection = 'reminders' | 'appearance';

export function useSettingsSectionScroll(section?: string) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [nativeTarget, setNativeTarget] = useState<number | null>(null);
  const handleScrollLayout = useCallback((event: LayoutChangeEvent) => {
    const target = (event.nativeEvent as { target?: number }).target;
    setNativeTarget(typeof target === 'number' ? target : null);
  }, []);
  const [sectionOffsets, setSectionOffsets] = useState<Partial<Record<SettingsSection, number>>>({});

  const handleSectionLayout = useCallback(
    (target: SettingsSection) => (e: LayoutChangeEvent) => {
      const y = e.nativeEvent.layout.y;
      setSectionOffsets((prev) => (prev[target] === y ? prev : { ...prev, [target]: y }));
    },
    [],
  );

  useEffect(() => {
    const target: SettingsSection | undefined =
      section === 'reminders' || section === 'appearance' ? section : undefined;
    if (!target) return;
    const y = sectionOffsets[target];
    if (y === undefined || (!scrollViewRef.current && nativeTarget === null)) return;
    const frame = requestAnimationFrame(() => {
      const offset = Math.max(y - Spacing['4'], 0);
      const scrollView = scrollViewRef.current;
      if (scrollView?.scrollTo) {
        scrollView.scrollTo({ y: offset, animated: false });
      } else if (nativeTarget !== null) {
        // NativeWind can omit the forwarded ref. The reader uses this fallback too.
        UIManager.dispatchViewManagerCommand(nativeTarget, 'scrollTo', [0, offset, false]);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [section, sectionOffsets, nativeTarget]);

  return { scrollViewRef, handleScrollLayout, handleSectionLayout };
}

interface ProfileSettingsSectionsProps {
  onSectionLayout?: (target: SettingsSection) => (e: LayoutChangeEvent) => void;
}

/**
 * Shared settings body used by Profile and the compatibility settings route.
 * Owns reset, premium-sheet, and section composition so those are not copied.
 */
export function ProfileSettingsSections({ onSectionLayout }: ProfileSettingsSectionsProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [premiumFeature, setPremiumFeature] = useState<'voice' | 'theme' | 'font' | 'general' | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleResetData = useCallback(async () => {
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
              "This will permanently delete your data from this device and ask Unfold's servers to delete your synced data. This cannot be undone.",
              [
                { text: 'Go Back', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeletingAccount(true);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    try {
                      const { serverErase } = await performFullLocalReset();
                      router.dismissAll();
                      setTimeout(() => router.replace('/'), 50);
                      if (!serverErase.ok) {
                        setTimeout(() => {
                          Alert.alert(SERVER_ERASE_NOT_CONFIRMED_TITLE, SERVER_ERASE_NOT_CONFIRMED_MESSAGE);
                        }, 600);
                      }
                    } finally {
                      setIsDeletingAccount(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [isDeletingAccount, router]);

  return (
    <>
      <View style={styles.sectionBlock}>
        <SupportSection />
      </View>

      <View style={styles.sectionBlock} onLayout={onSectionLayout?.('reminders')}>
        <RemindersSection />
      </View>

      <View style={styles.sectionBlock} onLayout={onSectionLayout?.('appearance')}>
        <AppearanceSection onPremiumFeature={setPremiumFeature} />
      </View>

      <View style={styles.sectionBlock}>
        <WritingStyleSection />
      </View>

      <View style={styles.sectionBlock}>
        <QaToolsSection />
      </View>

      <View style={styles.sectionBlock}>
        <SettingsSectionHeader label="Data" />

        <View style={getSettingsCardStyle(colors)}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleResetData}
            disabled={isDeletingAccount}
            accessibilityState={{ disabled: isDeletingAccount }}
            accessibilityRole="button"
            accessibilityLabel="Reset all data (deletes your account)"
          >
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
                  flex: 1,
                  flexShrink: 1,
                }}
              >
                {isDeletingAccount ? 'Resetting...' : 'Reset all data (deletes your account)'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: Spacing['12'], alignItems: 'center', marginBottom: Spacing['6'] }}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 21,
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
            Version {Application.nativeApplicationVersion ?? '1.0.0'}
          </Text>
        </View>
      </View>

      <PremiumFeatureSheet
        visible={!!premiumFeature}
        onClose={() => {
          setPremiumFeature(null);
        }}
        feature={premiumFeature ?? 'general'}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    paddingHorizontal: Spacing['6'],
  },
});
