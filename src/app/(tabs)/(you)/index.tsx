import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Linking, Platform, ActivityIndicator, TextInput } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LEGAL_LINKS } from '@/lib/push-notification-helpers';
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
  CaretDownIcon,
  ChatDotsIcon,
  StackIcon,
  CompassIcon,
  BookIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
  PaletteIcon,
  TextAaIcon,
  HourglassIcon,
  LockIcon,
  CreditCardIcon,
  TrashIcon,
  StarIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { useTheme } from '@/lib/theme';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import {
  useUnfoldStore,
  FontSize as FontSizePreference,
  WritingTone,
  ContentDepth,
  FaithBackground,
  LifeStage,
  ThemeMode,
  ACCENT_THEMES,
  READING_FONTS,
} from '@/lib/store';
import { logger } from '@/lib/logger';
import { debugFireTrialEndingNotification } from '@/lib/trial-notification';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUIState } from '@/lib/ui-state';
import { StreakDisplay } from '@/components/StreakDisplay';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { alpha } from '@/components/ui';
import { Spacing } from '@/constants/spacing';
import {
  scheduleDailyReminder,
  cancelAllReminders,
  areNotificationsEnabled,
  scheduleDevotionalReadyTapTestNotification,
} from '@/lib/notifications';
// NOTE: scheduleMiddayCheckIn / scheduleEveningWindDown / cancelMiddayCheckIn /
// cancelEveningWindDown are NOT imported here anymore. Check-in notification
// scheduling is owned exclusively by `useCheckInNotifications` — this screen
// only mutates store state (via setMiddayCheckInEnabled etc.), and the
// single-owner hook reacts to those changes through its fingerprint watcher.
// See ~/vault/standards/one-owner-per-os-resource.md
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { exportBugReportBundleToFile, logBugEvent } from '@/lib/bug-logger';
import { analyzeNetworkError } from '@/lib/network-error-handler';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { performFullLocalReset } from '@/lib/full-reset';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { buildDevotionalSeed } from '@/lib/dev-seed';

// --- Constants (from settings) ---

const FONT_SIZES: { value: FontSizePreference; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];

const REMINDER_TIMES = [
  { value: '6:00 AM', label: 'Early morning' },
  { value: '8:00 AM', label: 'Morning' },
  { value: '12:00 PM', label: 'Midday' },
  { value: '6:00 PM', label: 'Evening' },
  { value: '9:00 PM', label: 'Night' },
];

function formatCheckInTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

const TONE_OPTIONS: { value: WritingTone; label: string; description: string }[] = [
  { value: 'warm', label: 'Like a friend', description: 'Gentle, encouraging, and personal' },
  { value: 'direct', label: 'Straight to the point', description: 'Clear, practical, and actionable' },
  { value: 'poetic', label: 'With beauty', description: 'Lyrical, contemplative, and evocative' },
];

const DEPTH_OPTIONS: { value: ContentDepth; label: string; description: string }[] = [
  { value: 'simple', label: 'Keep it simple', description: 'Clear truth without complexity' },
  { value: 'balanced', label: 'A good balance', description: 'Substance with accessibility' },
  { value: 'theological', label: 'Take me deeper', description: 'Rich study with historical context' },
];

const FAITH_OPTIONS: { value: FaithBackground; label: string; description: string }[] = [
  { value: 'new', label: "I'm exploring", description: 'New to faith or rediscovering it' },
  { value: 'growing', label: "I'm growing", description: 'Familiar with faith, deepening understanding' },
  { value: 'mature', label: "I'm grounded", description: 'Well-versed and seeking deeper study' },
];

const LIFE_STAGE_OPTIONS: { value: LifeStage; label: string; description: string }[] = [
  { value: 'student', label: "I'm a student", description: 'Figuring things out and finding my footing' },
  { value: 'building', label: "I'm building my life", description: 'Career, relationships, and big decisions' },
  { value: 'midlife', label: "I'm in the thick of it", description: 'Family, work, and a thousand responsibilities' },
  { value: 'reflective', label: "I'm in a reflective season", description: 'Looking back, looking forward, finding meaning' },
];

// --- Menu items ---

interface MenuItem {
  icon: typeof BookOpenIcon;
  label: string;
  subtitle?: string;
  route: string;
}

export default function YouScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
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
  const setHasSeenHomeTooltips = useUnfoldStore((s) => s.setHasSeenHomeTooltips);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const setDebugForceTrialExpired = useUIState((s) => s.setDebugForceTrialExpired);
  const reset = useUnfoldStore((s) => s.reset);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const highlights = useUnfoldStore((s) => s.highlights);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const middayCheckInEnabled = useUnfoldStore((s) => s.middayCheckInEnabled);
  const eveningWindDownEnabled = useUnfoldStore((s) => s.eveningWindDownEnabled);
  const setMiddayCheckInEnabled = useUnfoldStore((s) => s.setMiddayCheckInEnabled);
  const setEveningWindDownEnabled = useUnfoldStore((s) => s.setEveningWindDownEnabled);
  // Tri-state premium policy for the check-in rows. We route to paywall when
  // not `granted` — `unknown` is treated the same as `denied` in UI so we
  // never flash a churn upsell at cold start before RevenueCat has reported.
  // The row renders a neutral "Premium" affordance for both states.
  const checkInPolicy = usePremiumAccessPolicy();
  const checkInGranted = checkInPolicy === 'granted';
  const isPremium = checkInGranted;
  const middayCheckInTime = useUnfoldStore((s) => s.middayCheckInTime);
  const eveningWindDownTime = useUnfoldStore((s) => s.eveningWindDownTime);

  // --- State ---
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const [expandedPreference, setExpandedPreference] = useState<'tone' | 'depth' | 'faith' | 'lifeStage' | null>(null);
  const [expandedPremium, setExpandedPremium] = useState<'colors' | 'fonts' | null>(null);
  const [premiumFeature, setPremiumFeature] = useState<'voice' | 'theme' | 'font' | 'general' | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showTimeSelector, setShowTimeSelector] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Check notification status on mount
  useEffect(() => {
    const checkNotifications = async () => {
      const enabled = await areNotificationsEnabled();
      setNotificationsEnabled(enabled && !!user?.reminderTime);
    };
    checkNotifications();
  }, [user?.reminderTime]);

  // --- Handlers ---

  const handleToggleNotifications = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value) {
      const time = user?.reminderTime ?? '8:00 AM';
      const result = await scheduleDailyReminder(time);
      if (result) {
        setNotificationsEnabled(true);
        updateUser({ reminderTime: time });
        // Midday / evening check-in scheduling is owned by
        // `useCheckInNotifications` — it will detect any permission change
        // on the next foreground reconcile (or immediately, via its
        // fingerprint watcher, if policy / enabled flags change here).
      }
    } else {
      await cancelAllReminders();
      setNotificationsEnabled(false);
    }
  };

  // These handlers only mutate store state. `useCheckInNotifications` owns
  // the OS notification queue and reacts to fingerprint changes — never call
  // schedule/cancel directly from here.
  const handleToggleMiddayCheckIn = (value: boolean) => {
    // Tri-state gate: non-granted taps route to paywall instead of toggling.
    if (!checkInGranted) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push('/paywall');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMiddayCheckInEnabled(value);
  };

  const handleToggleEveningWindDown = (value: boolean) => {
    if (!checkInGranted) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push('/paywall');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEveningWindDownEnabled(value);
  };

  // Row-level tap handlers: route the entire row to paywall when not premium,
  // otherwise navigate to the schedule picker. Premium upsell is a tap on
  // the whole row — not just a tiny toggle at the right edge — so the
  // affordance is discoverable.
  const handleOpenMiddaySchedule = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!checkInGranted) {
      router.push('/paywall');
      return;
    }
    router.push({ pathname: '/(tabs)/(you)/checkin-schedule', params: { type: 'midday' } });
  };

  const handleOpenEveningSchedule = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!checkInGranted) {
      router.push('/paywall');
      return;
    }
    router.push({ pathname: '/(tabs)/(you)/checkin-schedule', params: { type: 'evening' } });
  };

  const handleSelectTime = async (time: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // useDailyReminderSync picks this up via the fingerprint and reschedules.
    // Do not call scheduleDailyReminder here — that created a dual scheduling
    // authority that raced with the centralized sync hook.
    updateUser({ reminderTime: time });
    setShowTimeSelector(false);
  };

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

  const menuItems: MenuItem[] = [
    {
      icon: BookOpenIcon,
      label: 'My Devotionals',
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

  // --- Section header helper ---
  const SectionHeader = ({ label }: { label: string }) => (
    <View>
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.xs,
          color: colors.textHint,
          letterSpacing: 1,
          marginBottom: Spacing['3'],
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — avatar + name */}
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            style={{
              paddingHorizontal: Spacing['6'],
              paddingTop: Spacing['4'],
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
                            fontFamily: FontFamily.ui,
                            fontSize: 11,
                            color: colors.accent,
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

          {/* ==============================
              SETTINGS SECTIONS (inlined)
              ============================== */}

          {/* --- Preferences: Appearance --- */}
          <View style={{ paddingHorizontal: Spacing['6'] }}>
            <SectionHeader label="Preferences" />

            {/* Theme + Accent Colors + Reading Font card */}
            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
              {/* Theme row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: Spacing['4'],
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.text,
                    flex: 1,
                  }}
                >
                  Theme
                </Text>
                <View style={{ flexDirection: 'row' }}>
                  {THEME_OPTIONS.map((option, index) => {
                    const Icon = option.icon;
                    const isSelected = (user?.themeMode ?? 'dark') === option.value;
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={option.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({ themeMode: option.value });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${option.label} theme`}
                        accessibilityState={{ selected: isSelected }}
                        style={{ marginLeft: index > 0 ? Spacing['2'] : 0 }}
                      >
                        <View
                          style={{
                            backgroundColor: isSelected ? colors.text : colors.buttonBackground,
                            paddingVertical: Spacing['2'],
                            paddingHorizontal: Spacing['3'],
                            borderRadius: Radius.sm,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.text : colors.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Icon
                            size={14}
                            color={isSelected ? colors.background : colors.text}
                            weight="light"
                          />
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: FontSize.xs,
                              color: isSelected ? colors.background : colors.text,
                              marginLeft: Spacing['1.5'],
                            }}
                          >
                            {option.label}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Accent Colors - Collapsible */}
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    if (!isPremium) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      setPremiumFeature('theme');
                      return;
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedPremium(expandedPremium === 'colors' ? null : 'colors');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: Spacing['4'],
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2.5'] }}>
                    <PaletteIcon size={18} color={colors.text} weight="light" />
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      Accent Colors
                    </Text>
                    {!isPremium && (
                      <LockIcon size={12} color={colors.textSubtle} weight="light" />
                    )}
                  </View>
                  <CaretDownIcon
                    size={18}
                    color={colors.textMuted}
                    weight="light"
                    style={{
                      transform: [{ rotate: expandedPremium === 'colors' ? '180deg' : '0deg' }],
                    }}
                  />
                </TouchableOpacity>

                {expandedPremium === 'colors' && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ paddingHorizontal: Spacing['4'], paddingBottom: Spacing['4'] }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['3'] }}>
                      {ACCENT_THEMES.map((theme) => {
                        const isSelected = (user?.accentTheme ?? 'gold') === theme.id;
                        const swatchColor = isDark ? theme.dark : theme.light;
                        const isLocked = !isPremium && theme.id !== 'gold';
                        return (
                          <TouchableOpacity activeOpacity={0.7}
                            key={theme.id}
                            onPress={() => {
                              if (isLocked) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                setPremiumFeature('theme');
                                return;
                              }
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              updateUser({ accentTheme: theme.id });
                            }}
                            accessibilityLabel={isLocked ? `${theme.name} accent theme, premium only` : `${theme.name} accent theme`}
                            style={{ alignItems: 'center', width: 56 }}
                          >
                            <View
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 22,
                                backgroundColor: swatchColor,
                                borderWidth: isSelected ? 3 : 1,
                                borderColor: isSelected ? colors.text : colors.border,
                                justifyContent: 'center',
                                alignItems: 'center',
                                opacity: isLocked ? 0.5 : 1,
                              }}
                            >
                              {isSelected && (
                                <CheckIcon size={16} color={colors.background} weight="bold" />
                              )}
                              {isLocked && !isSelected && (
                                <LockIcon size={14} color={colors.background} weight="fill" />
                              )}
                            </View>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: 11,
                                color: isSelected ? colors.text : (isLocked ? colors.textSubtle : colors.textMuted),
                                marginTop: Spacing['1.5'],
                              }}
                            >
                              {theme.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Animated.View>
                )}
              </View>

              {/* Reading Font - Collapsible */}
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedPremium(expandedPremium === 'fonts' ? null : 'fonts');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: Spacing['4'],
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2.5'] }}>
                    <TextAaIcon size={18} color={colors.text} weight="light" />
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      Reading Font
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textMuted,
                      }}
                    >
                      {READING_FONTS.find(f => f.id === (user?.readingFont ?? 'source-serif'))?.name}
                    </Text>
                    <CaretDownIcon
                      size={18}
                      color={colors.textMuted}
                      weight="light"
                      style={{
                        transform: [{ rotate: expandedPremium === 'fonts' ? '180deg' : '0deg' }],
                      }}
                    />
                  </View>
                </TouchableOpacity>

                {expandedPremium === 'fonts' && (
                  <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
                    {READING_FONTS.map((font, index) => {
                      const isSelected = (user?.readingFont ?? 'source-serif') === font.id;
                      return (
                        <TouchableOpacity activeOpacity={0.7}
                          key={font.id}
                          onPress={() => {
                            if (!isPremium) {
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                              setPremiumFeature('font');
                              return;
                            }
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            updateUser({ readingFont: font.id });
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 13,
                            paddingHorizontal: Spacing['4'],
                            borderBottomWidth: index < READING_FONTS.length - 1 ? 1 : 0,
                            borderBottomColor: colors.border,
                            backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontFamily: font.regular,
                                fontSize: 17,
                                color: colors.text,
                                marginBottom: Spacing['0.5'],
                              }}
                            >
                              {font.name}
                            </Text>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: FontSize.xs,
                                color: colors.textMuted,
                              }}
                            >
                              {font.preview}
                            </Text>
                          </View>
                          {isSelected && (
                            <CheckIcon size={18} color={colors.accent} weight="bold" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </Animated.View>
                )}
              </View>

              {/* Font size row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: Spacing['4'],
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.text,
                    flex: 1,
                  }}
                >
                  Font size
                </Text>
                <View style={{ flexDirection: 'row' }}>
                  {FONT_SIZES.map((size, index) => (
                    <TouchableOpacity activeOpacity={0.7}
                      key={size.value}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateUser({ fontSize: size.value });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${size.label} font size`}
                      accessibilityState={{ selected: user?.fontSize === size.value }}
                      style={{ marginLeft: index > 0 ? Spacing['2'] : 0 }}
                    >
                      <View
                        style={{
                          backgroundColor:
                            user?.fontSize === size.value
                              ? colors.text
                              : colors.buttonBackground,
                          paddingVertical: Spacing['2'],
                          paddingHorizontal: Spacing['3.5'],
                          borderRadius: Radius.sm,
                          borderWidth: 1,
                          borderColor: user?.fontSize === size.value ? colors.text : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 13,
                            color: user?.fontSize === size.value ? colors.background : colors.text,
                          }}
                        >
                          {size.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* --- Reminders --- */}
            <SectionHeader label="Reminders" />

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
              {/* Daily reminders toggle */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => handleToggleNotifications(!notificationsEnabled)}
                accessibilityRole="button"
                accessibilityLabel="Daily reminders"
                accessibilityState={{ selected: notificationsEnabled }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 13,
                  paddingHorizontal: Spacing['4'],
                  borderBottomWidth: notificationsEnabled && isPremium ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  Daily reminders
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: FontSize.sm,
                    color: (isPremium ? notificationsEnabled : false) ? colors.text : colors.textMuted,
                  }}
                >
                  {(isPremium ? notificationsEnabled : false) ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>

              {notificationsEnabled && isPremium && (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => setShowTimeSelector(!showTimeSelector)}
                  accessibilityRole="button"
                  accessibilityLabel="Reminder time"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 13,
                    paddingHorizontal: Spacing['4'],
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Reminder time
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.sm,
                      color: colors.textMuted,
                    }}
                  >
                    {user?.reminderTime ?? '8:00 AM'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Midday check-in — outer Pressable owns the whole hit area.
                  When denied, the whole row routes to paywall (no inner
                  touchable — "Upgrade" is plain text). When granted, outer
                  taps open the schedule screen and the inner toggle wins
                  via RN's responder system (no bubble, no double-fire). */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleOpenMiddaySchedule}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 13,
                  paddingHorizontal: Spacing['4'],
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Midday check-in
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    {checkInGranted ? formatCheckInTime(middayCheckInTime) : 'Premium'}
                  </Text>
                </View>
                {checkInGranted ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleToggleMiddayCheckIn(!middayCheckInEnabled)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: FontSize.sm,
                        color: middayCheckInEnabled ? colors.text : colors.textMuted,
                      }}
                    >
                      {middayCheckInEnabled ? 'On' : 'Off'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.sm,
                      color: colors.accent,
                    }}
                  >
                    Upgrade
                  </Text>
                )}
              </TouchableOpacity>

              {/* Evening wind-down — see midday comment above. Same pattern:
                  outer TouchableOpacity owns the whole row; denied state has
                  no inner toggle (pure upsell); granted state has a nested
                  toggle that wins via RN's responder system. */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleOpenEveningSchedule}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 13,
                  paddingHorizontal: Spacing['4'],
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Evening wind-down
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    {checkInGranted ? formatCheckInTime(eveningWindDownTime) : 'Premium'}
                  </Text>
                </View>
                {checkInGranted ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleToggleEveningWindDown(!eveningWindDownEnabled)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: FontSize.sm,
                        color: eveningWindDownEnabled ? colors.text : colors.textMuted,
                      }}
                    >
                      {eveningWindDownEnabled ? 'On' : 'Off'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.sm,
                      color: colors.accent,
                    }}
                  >
                    Upgrade
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Time options (outside the card for cleaner expand) */}
            {showTimeSelector && (
              <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ marginTop: -Spacing['4'], marginBottom: Spacing['6'] }}>
                {REMINDER_TIMES.map((time) => (
                  <TouchableOpacity activeOpacity={0.7}
                    key={time.value}
                    onPress={() => handleSelectTime(time.value)}
                  >
                    <View
                      style={{
                        backgroundColor:
                          user?.reminderTime === time.value
                            ? colors.buttonBackgroundPressed
                            : 'transparent',
                        paddingVertical: Spacing['3.5'],
                        paddingHorizontal: Spacing['4'],
                        borderRadius: 10,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: 15,
                          color: colors.text,
                        }}
                      >
                        {time.label}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: 13,
                          color: colors.textMuted,
                        }}
                      >
                        {time.value}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}

            {/* --- Writing Style --- */}
            <SectionHeader label="Writing Style" />

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
              {/* Tone */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'tone' ? null : 'tone');
                }}
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.buttonBackground,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <ChatDotsIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
                    Tone
                  </Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                    {TONE_OPTIONS.find((o) => o.value === user?.writingStyle?.tone)?.label ?? 'Like a friend'}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{ transform: [{ rotate: expandedPreference === 'tone' ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {expandedPreference === 'tone' && (
                <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
                  {TONE_OPTIONS.map((option) => {
                    const isSelected = user?.writingStyle?.tone === option.value;
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={option.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({
                            writingStyle: {
                              ...user?.writingStyle,
                              tone: option.value,
                              depth: user?.writingStyle?.depth ?? 'balanced',
                              faithBackground: user?.writingStyle?.faithBackground ?? 'growing',
                            },
                          });
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          paddingVertical: Spacing['3'],
                          paddingHorizontal: Spacing['3'],
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: Spacing['1'],
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                            {option.label}
                          </Text>
                          <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20, height: 20, borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center', alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}

              {/* Depth */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'depth' ? null : 'depth');
                }}
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
                  <StackIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
                    Depth
                  </Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                    {DEPTH_OPTIONS.find((o) => o.value === user?.writingStyle?.depth)?.label ?? 'A good balance'}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{ transform: [{ rotate: expandedPreference === 'depth' ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {expandedPreference === 'depth' && (
                <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
                  {DEPTH_OPTIONS.map((option) => {
                    const isSelected = user?.writingStyle?.depth === option.value;
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={option.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({
                            writingStyle: {
                              ...user?.writingStyle,
                              tone: user?.writingStyle?.tone ?? 'warm',
                              depth: option.value,
                              faithBackground: user?.writingStyle?.faithBackground ?? 'growing',
                            },
                          });
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          paddingVertical: Spacing['3'],
                          paddingHorizontal: Spacing['3'],
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: Spacing['1'],
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                            {option.label}
                          </Text>
                          <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20, height: 20, borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center', alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}

              {/* Faith Background */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'faith' ? null : 'faith');
                }}
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
                  <CompassIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
                    Faith Background
                  </Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                    {FAITH_OPTIONS.find((o) => o.value === user?.writingStyle?.faithBackground)?.label ?? "I'm growing"}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{ transform: [{ rotate: expandedPreference === 'faith' ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {expandedPreference === 'faith' && (
                <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
                  {FAITH_OPTIONS.map((option) => {
                    const isSelected = user?.writingStyle?.faithBackground === option.value;
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={option.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({
                            writingStyle: {
                              ...user?.writingStyle,
                              tone: user?.writingStyle?.tone ?? 'warm',
                              depth: user?.writingStyle?.depth ?? 'balanced',
                              faithBackground: option.value,
                            },
                          });
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          paddingVertical: Spacing['3'],
                          paddingHorizontal: Spacing['3'],
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: Spacing['1'],
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                            {option.label}
                          </Text>
                          <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20, height: 20, borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center', alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}

              {/* Life Stage */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'lifeStage' ? null : 'lifeStage');
                }}
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
                  <HourglassIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
                    Life Stage
                  </Text>
                  <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                    {LIFE_STAGE_OPTIONS.find((o) => o.value === user?.writingStyle?.lifeStage)?.label ?? "I'm building my life"}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{ transform: [{ rotate: expandedPreference === 'lifeStage' ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {expandedPreference === 'lifeStage' && (
                <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
                  {LIFE_STAGE_OPTIONS.map((option) => {
                    const isSelected = (user?.writingStyle?.lifeStage ?? 'building') === option.value;
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={option.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({
                            writingStyle: {
                              ...user?.writingStyle,
                              tone: user?.writingStyle?.tone ?? 'warm',
                              depth: user?.writingStyle?.depth ?? 'balanced',
                              faithBackground: user?.writingStyle?.faithBackground ?? 'growing',
                              lifeStage: option.value,
                            },
                          });
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          paddingVertical: Spacing['3'],
                          paddingHorizontal: Spacing['3'],
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: Spacing['1'],
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                            {option.label}
                          </Text>
                          <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20, height: 20, borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center', alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}
            </View>

            {/* --- Support --- */}
            <SectionHeader label="Support" />

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
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

            {isQaToolsEnabled() && (
              <>
                {/* --- QA Tools --- Internal QA affordances for notification/reveal verification builds. */}
                <SectionHeader label={__DEV__ ? "Dev Tools" : "QA Tools"} />

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/debug-reset-beginning')}
                  style={{
                    padding: Spacing['4'],
                    borderRadius: Radius.md,
                    backgroundColor: 'rgba(200, 165, 92, 0.1)',
                    alignItems: 'center',
                    marginBottom: Spacing['3'],
                  }}
                >
                  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                    Reset to Beginning (QA)
                  </Text>
                </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                const seeded = buildDevotionalSeed();
                const store = useUnfoldStore.getState();
                store.addDevotional(seeded);
                store.setCurrentDevotional(seeded.id);
                router.push({
                  pathname: '/reveal',
                  params: {
                    devotionalId: seeded.id,
                    dayNumber: String(seeded.currentDay),
                    seriesTitle: seeded.title,
                    dayTitle: seeded.days[0]?.title ?? '',
                    totalDays: String(seeded.totalDays),
                  },
                });
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Seed Real Devotional + Reveal (Dev)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={async () => {
                const seeded = buildDevotionalSeed();
                const store = useUnfoldStore.getState();
                store.addDevotional(seeded);
                store.setCurrentDevotional(seeded.id);

                const scheduled = await scheduleDevotionalReadyTapTestNotification(seeded, {
                  dayNumber: seeded.currentDay,
                  delaySeconds: 2,
                });

                if (scheduled) {
                  Alert.alert(
                    'Tap-test notification scheduled',
                    'A devotional-ready notification with the real routing payload should appear in about 2 seconds.',
                  );
                } else {
                  Alert.alert(
                    'Notification not scheduled',
                    'Check notification permission on this simulator/device before retrying.',
                  );
                }
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Seed Devotional + Notification Tap Test (Dev)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                const store = useUnfoldStore.getState();
                const devId = store.currentDevotionalId;
                const dev = store.devotionals.find((d: any) => d.id === devId);
                if (dev) {
                  router.push({
                    pathname: '/reveal',
                    params: {
                      devotionalId: dev.id,
                      dayNumber: String(dev.currentDay),
                      seriesTitle: dev.title,
                      dayTitle: dev.days?.find((d: any) => d.dayNumber === dev.currentDay)?.title ?? '',
                    },
                  });
                }
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Test Reveal Screen (Dev)
              </Text>
            </TouchableOpacity>

            {/* Toggle light ↔ dark mode for testing the theme-aware fixes. */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                const current = useUnfoldStore.getState().user?.themeMode ?? 'dark';
                const next: ThemeMode = current === 'light' ? 'dark' : 'light';
                updateUser({ themeMode: next });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Toggle Light/Dark Mode (Dev) — currently {user?.themeMode ?? 'dark'}
              </Text>
            </TouchableOpacity>

            {/* Opens a single-screen gallery showing all 8 components that
                received light-mode fixes (from commit 27d6775). Pair with the
                theme toggle above (or the one inside the gallery screen) to
                flip the theme and verify each component adapts correctly. */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                router.push('/debug-light-mode');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Light Mode Component Gallery (Dev)
              </Text>
            </TouchableOpacity>

            {/* Replay the home-screen first-run tooltips. We navigate to the
                Today tab FIRST, then flip the persisted flag after the tab
                settles. Flipping before navigation causes the tooltips to
                try measuring while the Today tab's elements aren't yet in
                the window, which returns zero rects and silently fails.
                Combined with the key={hasSeenHomeTooltips} on
                <HomeOnboardingTooltips />, the flag-flip forces a clean
                remount + re-measure once the tab is already visible. */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setHasSeenHomeTooltips(true);
                router.replace('/(tabs)/(today)');
                setTimeout(() => {
                  setHasSeenHomeTooltips(false);
                }, 600);
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Replay Home Tooltips (Dev)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setDebugForceTrialExpired(!debugForceTrialExpired);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                {debugForceTrialExpired ? '✓ Churned User ON — tap to clear' : 'Simulate Churned User (Dev)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                mmkvStorage.removeItem('@unfold_exclusive_offer_seen');
                mmkvStorage.removeItem('@unfold_onboarding_offer_seen');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert('Reset', 'Both exclusive offers reset. Enable "Simulate Churned User" then tap any creation action to see the win-back offer, or cancel Apple Pay on the paywall for the onboarding offer.');
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Reset Exclusive Offers (Dev)
              </Text>
            </TouchableOpacity>

            {/* Fire the real trial-ending notification content in 5s so we
                can see what it looks like without waiting for an actual
                trial to expire. Uses a distinct identifier so it does not
                clobber any real schedule. */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={async () => {
                const id = await debugFireTrialEndingNotification(5);
                Haptics.notificationAsync(
                  id
                    ? Haptics.NotificationFeedbackType.Success
                    : Haptics.NotificationFeedbackType.Warning,
                );
                Alert.alert(
                  id ? 'Scheduled' : 'Could not schedule',
                  id
                    ? 'Trial-ending notification will fire in 5 seconds. Background the app to see it.'
                    : 'Notification permission may not be granted. Check system settings.',
                );
              }}
              style={{
                padding: Spacing['4'],
                borderRadius: Radius.md,
                backgroundColor: 'rgba(200, 165, 92, 0.1)',
                alignItems: 'center',
                marginBottom: Spacing['6'],
              }}
            >
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.accent }}>
                Test Trial-Ending Notification (Dev)
              </Text>
            </TouchableOpacity>
              </>
            )}

            {/* --- Data / Danger zone --- */}
            <SectionHeader label="Data" />

            <TouchableOpacity activeOpacity={0.7} onPress={handleResetData} disabled={isDeletingAccount} accessibilityState={{ disabled: isDeletingAccount }}>
              <View
                style={{
                  borderRadius: Radius.md,
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

            {/* App info */}
            <View style={{ marginTop: Spacing['12'], alignItems: 'center', marginBottom: Spacing['6'] }}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: FontSize['2xl'],
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
