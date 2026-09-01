import { useState } from 'react';
import { View, Text, Alert, Linking, Platform, ActivityIndicator } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import {
  CreditCardIcon,
  ChatDotsIcon,
  StarIcon,
  LockIcon,
  BookIcon,
  CaretRightIcon,
} from '@/components/icons';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { LEGAL_LINKS } from '@/lib/push-notification-helpers';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { exportBugReportBundleToFile, logBugEvent } from '@/lib/bug-logger';
import { analyzeNetworkError } from '@/lib/network-error-handler';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { SettingsSectionHeader, getSettingsCardStyle } from './SettingsSectionHeader';

export function SupportSection() {
  const { colors } = useTheme();
  const isPremium = usePremiumAccessPolicy() === 'granted';

  const [isExportingData, setIsExportingData] = useState(false);

  const handleRateApp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === 'ios') {
      try {
        await Linking.openURL('https://apps.apple.com/app/id6746827498?action=write-review');
      } catch {}
    } else if (Platform.OS === 'android') {
      const bundleId = Constants.expoConfig?.android?.package ?? 'com.unfold.app';
      try {
        await Linking.openURL(`https://play.google.com/store/apps/details?id=${bundleId}`);
      } catch {}
    }
  };

  const promptForBugReportNote = async (): Promise<string | undefined> => {
    if (Platform.OS !== 'ios') return undefined;
    return new Promise((resolve) => {
      Alert.prompt(
        'What happened? (optional)',
        'Add a short note so we have context (example: stuck on day 3 after tapping retry).',
        [
          { text: 'Skip', style: 'cancel', onPress: () => resolve(undefined) },
          {
            text: 'Send',
            onPress: (value?: string) => {
              const trimmed = value?.trim();
              resolve(trimmed && trimmed.length > 0 ? trimmed : undefined);
            },
          },
        ],
        'plain-text'
      );
    });
  };

  const sendBugReportEmail = async (payload: {
    source: string;
    label?: string;
    userNote?: string;
    report: Record<string, unknown>;
  }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${PRIMARY_BACKEND_URL}/api/bug-report/email`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        let detail = '';
        try {
          const data = await response.json();
          detail = typeof data?.error === 'string' ? data.error : JSON.stringify(data);
        } catch {
          detail = `HTTP ${response.status}`;
        }
        throw new Error(detail || `HTTP ${response.status}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  const handleReportBug = async () => {
    if (isExportingData) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExportingData(true);
    try {
      const note = await promptForBugReportNote();
      void logBugEvent('profile', 'bug-report-export-requested', { hasNote: !!note });
      const { path, bundle, triageSummary } = await exportBugReportBundleToFile({ source: 'profile', note, label: note });
      const reportPayload = { triageSummary, ...bundle } as Record<string, unknown>;
      try {
        await sendBugReportEmail({ source: 'profile', label: note, userNote: note, report: reportPayload });
        void logBugEvent('profile', 'bug-report-email-succeeded', {
          events: bundle.events.length,
          triageHeadline: triageSummary.headline,
          hasNote: !!note,
        });
        Alert.alert('Bug report sent', 'Thanks — your report was sent automatically.');
        return;
      } catch (emailError) {
        void logBugEvent('profile', 'bug-report-email-failed', {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        }, 'error');
        const analyzed = analyzeNetworkError(emailError);
        if (analyzed.type !== 'unknown') {
          Alert.alert('Unable to Send Report', analyzed.userFriendlyMessage);
        }
      }
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Share Unfold bug report' });
        Alert.alert("Couldn't auto-send", 'We opened the share sheet so you can send this report manually.');
      } else {
        const text = JSON.stringify(reportPayload, null, 2);
        await Clipboard.setStringAsync(text);
        Alert.alert('Bug report copied', 'Auto-send and sharing are unavailable. The bug report JSON has been copied to your clipboard.');
      }
      void logBugEvent('profile', 'bug-report-fallback-used', { hasNote: !!note }, 'warn');
    } catch (error) {
      void logBugEvent('profile', 'bug-report-export-failed', {
        error: error instanceof Error ? error.message : String(error),
      }, 'error');
      Alert.alert("Couldn't create bug report", 'Please try again in a moment. If this keeps happening, restart the app and retry.');
    } finally {
      setIsExportingData(false);
    }
  };

  return (
    <>
      <SettingsSectionHeader label="Support" />

      <View style={getSettingsCardStyle(colors)}>
        {isPremium && (
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
            accessibilityRole="link"
            accessibilityLabel="Manage Subscription"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: Spacing['4'],
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: colors.buttonBackground,
                justifyContent: 'center', alignItems: 'center',
              }}
            >
              <CreditCardIcon size={18} color={colors.text} weight="light" />
            </View>
            <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
              <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
                Manage Subscription
              </Text>
            </View>
            <CaretRightIcon size={16} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
        )}

        <TouchableOpacity activeOpacity={0.7}
          onPress={handleReportBug}
          disabled={isExportingData}
          accessibilityState={{ disabled: isExportingData }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            opacity: isExportingData ? 0.6 : 1,
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            {isExportingData ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <ChatDotsIcon size={18} color={colors.text} weight="light" />
            )}
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              {isExportingData ? 'Sending report...' : 'Report a bug'}
            </Text>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
              {isExportingData ? 'Please wait...' : 'Send diagnostics report'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7}
          onPress={handleRateApp}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <StarIcon size={18} color={colors.text} weight="fill" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              Rate Unfold
            </Text>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
              Leave a review
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7}
          onPress={() => Linking.openURL(LEGAL_LINKS.privacy)}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <LockIcon size={18} color={colors.text} weight="light" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              Privacy Policy
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7}
          onPress={() => Linking.openURL(LEGAL_LINKS.terms)}
          accessibilityRole="link"
          accessibilityLabel="Terms of Use"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <BookIcon size={18} color={colors.text} weight="light" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              Terms of Use
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </>
  );
}
