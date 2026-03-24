import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Duration } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, CaretRightIcon, CrownIcon, CreditCardIcon, TrashIcon, LockIcon, PlayIcon, PauseIcon, StarIcon, CaretDownIcon, ChatDotsIcon, StackIcon, CompassIcon, BookIcon, SunIcon, MoonIcon, MonitorIcon, PencilSimpleIcon, CheckIcon, PaletteIcon, TextAaIcon, SpeakerHighIcon, HourglassIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useUnfoldStore, FontSize as FontSizePreference, WritingTone, ContentDepth, FaithBackground, LifeStage, BIBLE_TRANSLATIONS, BibleTranslation, ThemeMode, ACCENT_THEMES, AccentThemeId, READING_FONTS, ReadingFontId } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import {
  scheduleDailyReminder,
  cancelAllReminders,
  areNotificationsEnabled,
  scheduleMiddayCheckIn,
  scheduleEveningWindDown,
  cancelMiddayCheckIn,
  cancelEveningWindDown,
} from '@/lib/notifications';
import { exportBugReportBundleToFile, logBugEvent } from '@/lib/bug-logger';
import { analyzeNetworkError } from '@/lib/network-error-handler';
import { CARTESIA_VOICES } from '@/lib/cartesia';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { DeleteAccountSheet } from '@/components/DeleteAccountSheet';
import { useAuth } from '@/hooks/useAuth';

/** Bundled voice samples — Psalm 23:1 read by each voice. Instant playback, zero network. */
const VOICE_SAMPLES: Record<string, any> = {
  '694f9389-aac1-45b6-b726-9d9369183238': require('@/assets/audio/voice-samples/katie.mp3'),
  '03496517-369a-4db1-8236-3d3ae459ddf7': require('@/assets/audio/voice-samples/elena.mp3'),
  '1463a4e1-56a1-4b41-b257-728d56e93605': require('@/assets/audio/voice-samples/marcus.mp3'),
  '00967b2f-88a6-4a31-8153-110a92134b9f': require('@/assets/audio/voice-samples/sophia.mp3'),
  '3246e36c-ac8c-418d-83cd-4eaad5a3b887': require('@/assets/audio/voice-samples/david.mp3'),
  '15a9cd88-84b0-4a8b-95f2-5d583b54c72e': require('@/assets/audio/voice-samples/grace.mp3'),
  'a924b0e6-9253-4711-8fc3-5cb8e0188c94': require('@/assets/audio/voice-samples/michael.mp3'),
};

import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';

const REMINDER_TIMES = [
  { value: '6:00 AM', label: 'Early morning' },
  { value: '8:00 AM', label: 'Morning' },
  { value: '12:00 PM', label: 'Midday' },
  { value: '6:00 PM', label: 'Evening' },
  { value: '9:00 PM', label: 'Night' },
];

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

export default function SettingsScreen() {
  const router = useRouter();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const reset = useUnfoldStore((s) => s.reset);
  const middayCheckInEnabled = useUnfoldStore((s) => s.middayCheckInEnabled);
  const eveningWindDownEnabled = useUnfoldStore((s) => s.eveningWindDownEnabled);
  const setMiddayCheckInEnabled = useUnfoldStore((s) => s.setMiddayCheckInEnabled);
  const setEveningWindDownEnabled = useUnfoldStore((s) => s.setEveningWindDownEnabled);
  const { colors, isDark } = useTheme();
  const { isAuthenticated, isAnonymous } = useAuth();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showTimeSelector, setShowTimeSelector] = useState(false);
  const [expandedPreference, setExpandedPreference] = useState<'tone' | 'depth' | 'faith' | 'lifeStage' | 'translation' | null>(null);
  const [expandedPremium, setExpandedPremium] = useState<'colors' | 'fonts' | 'voice' | null>('colors');

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? '');
  const [editAboutMe, setEditAboutMe] = useState(user?.aboutMe ?? '');

  // Loading states for async operations
  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [premiumFeature, setPremiumFeature] = useState<'voice' | 'theme' | 'font' | 'translation' | 'general' | null>(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  // Voice preview state — uses bundled MP3 samples (instant, no network)
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewPlayer = useAudioPlayer(null);
  const previewStatus = useAudioPlayerStatus(previewPlayer);

  const handleVoicePreview = useCallback((voiceId: string) => {
    // If already playing this voice, stop it
    if (previewingVoiceId === voiceId && previewStatus.playing) {
      previewPlayer.pause();
      setPreviewingVoiceId(null);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewingVoiceId(voiceId);

    const sample = VOICE_SAMPLES[voiceId];
    if (sample) {
      previewPlayer.replace(sample);
      previewPlayer.play();
    }
  }, [previewingVoiceId, previewStatus.playing, previewPlayer]);

  // Stop preview when voice section collapses
  useEffect(() => {
    if (expandedPremium !== 'voice' && previewingVoiceId) {
      previewPlayer.pause();
      setPreviewingVoiceId(null);
    }
  }, [expandedPremium, previewingVoiceId, previewPlayer]);

  // Auto-stop when playback finishes
  useEffect(() => {
    if (previewingVoiceId && !previewStatus.playing && previewStatus.currentTime > 0) {
      setPreviewingVoiceId(null);
    }
  }, [previewStatus.playing, previewingVoiceId, previewStatus.currentTime]);

  // Check notification status on mount
  useEffect(() => {
    const checkNotifications = async () => {
      const enabled = await areNotificationsEnabled();
      setNotificationsEnabled(enabled && !!user?.reminderTime);
    };
    checkNotifications();
  }, [user?.reminderTime]);

  const handleToggleNotifications = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (value) {
      // Enable notifications - schedule with current time
      const time = user?.reminderTime ?? '8:00 AM';
      const result = await scheduleDailyReminder(time);
      if (result) {
        setNotificationsEnabled(true);
        updateUser({ reminderTime: time });
        // Also reschedule midday/evening if their toggles are on
        if (middayCheckInEnabled) await scheduleMiddayCheckIn();
        if (eveningWindDownEnabled) await scheduleEveningWindDown();
      }
    } else {
      // Disable all notifications (daily + midday + evening)
      await cancelAllReminders();
      setNotificationsEnabled(false);
    }
  };

  const handleToggleMiddayCheckIn = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMiddayCheckInEnabled(value);
    if (value) {
      await scheduleMiddayCheckIn();
    } else {
      await cancelMiddayCheckIn();
    }
  };

  const handleToggleEveningWindDown = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEveningWindDownEnabled(value);
    if (value) {
      await scheduleEveningWindDown();
    } else {
      await cancelEveningWindDown();
    }
  };

  const handleSelectTime = async (time: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateUser({ reminderTime: time });
    setShowTimeSelector(false);

    // Re-schedule notification with new time
    if (notificationsEnabled) {
      await scheduleDailyReminder(time);
    }
  };

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/paywall');
  };

  const handleResetData = async () => {
    // Prevent double-tap
    if (isDeletingAccount) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Reset all data?',
      'This will permanently delete all your devotionals, journal entries, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              reset();
              router.replace('/');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const handleRateApp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === 'ios') {
      const appStoreUrl = 'https://apps.apple.com/app/id6746827498?action=write-review';
      try {
        await Linking.openURL(appStoreUrl);
      } catch {
        // Silently fail if URL can't be opened
      }
    } else if (Platform.OS === 'android') {
      const bundleId = Constants.expoConfig?.android?.package ?? 'com.unfold.app';
      const playStoreUrl = `https://play.google.com/store/apps/details?id=${bundleId}`;
      try {
        await Linking.openURL(playStoreUrl);
      } catch {
        // Silently fail if URL can't be opened
      }
    }
  };

  const promptForBugReportNote = async (): Promise<string | undefined> => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }

    return new Promise((resolve) => {
      Alert.prompt(
        'What happened? (optional)',
        'Add a short note so we have context (example: stuck on day 3 after tapping retry).',
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: () => resolve(undefined),
          },
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
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
    // Prevent double-tap
    if (isExportingData) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExportingData(true);

    try {
      const note = await promptForBugReportNote();

      void logBugEvent('settings', 'bug-report-export-requested', {
        hasNote: !!note,
      });

      const { path, bundle, triageSummary } = await exportBugReportBundleToFile({
        source: 'settings',
        note,
        label: note,
      });

      const reportPayload = {
        triageSummary,
        ...bundle,
      } as Record<string, unknown>;

      try {
        await sendBugReportEmail({
          source: 'settings',
          label: note,
          userNote: note,
          report: reportPayload,
        });

        void logBugEvent('settings', 'bug-report-email-succeeded', {
          events: bundle.events.length,
          triageHeadline: triageSummary.headline,
          hasNote: !!note,
        });

        Alert.alert('Bug report sent', 'Thanks — your report was sent automatically.');
        return;
      } catch (emailError) {
        void logBugEvent(
          'settings',
          'bug-report-email-failed',
          {
            error: emailError instanceof Error ? emailError.message : String(emailError),
          },
          'error'
        );

        // Show user-friendly network error if applicable
        const analyzed = analyzeNetworkError(emailError);
        if (analyzed.type !== 'unknown') {
          Alert.alert('Unable to Send Report', analyzed.userFriendlyMessage);
        }
      }

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          dialogTitle: 'Share Unfold bug report',
        });

        Alert.alert(
          "Couldn't auto-send",
          'We opened the share sheet so you can send this report manually.'
        );
      } else {
        const text = JSON.stringify(reportPayload, null, 2);
        await Clipboard.setStringAsync(text);
        Alert.alert(
          'Bug report copied',
          'Auto-send and sharing are unavailable. The bug report JSON has been copied to your clipboard.'
        );
      }

      void logBugEvent('settings', 'bug-report-fallback-used', {
        hasNote: !!note,
      }, 'warn');
    } catch (error) {
      void logBugEvent('settings', 'bug-report-export-failed', {
        error: error instanceof Error ? error.message : String(error),
      }, 'error');

      Alert.alert(
        "Couldn't create bug report",
        'Please try again in a moment. If this keeps happening, restart the app and retry.'
      );
    } finally {
      setIsExportingData(false);
    }
  };

  const handleSaveProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateUser({ name: editName.trim(), aboutMe: editAboutMe.trim() });
    setIsEditingProfile(false);
  };

  const handleCancelEditProfile = () => {
    setEditName(user?.name ?? '');
    setEditAboutMe(user?.aboutMe ?? '');
    setIsEditingProfile(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Return to the previous screen"
            style={{ padding: Spacing['2'] }}
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.text,
              marginLeft: Spacing['2'],
            }}
          >
            Settings
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingTop: Spacing['6'], paddingBottom: Spacing['10'] }}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium section */}
          {!user?.isPremium && (
            <Animated.View entering={FadeInDown.duration(400)}>
              <TouchableOpacity activeOpacity={0.7} 
                onPress={handleUpgrade} 
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Premium"
                accessibilityHint="Unlock unlimited devotionals and more premium features"
                style={{ marginBottom: Spacing['6'] }}
              >
                <View
                  style={{
                    backgroundColor: colors.buttonBackground,
                    borderRadius: Radius.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: Spacing['5'],
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: Radius.md,
                      backgroundColor: colors.inputBackground,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <CrownIcon size={22} color={colors.text} weight="light" />
                  </View>
                  <View style={{ marginLeft: Spacing['4'], flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: FontSize.base,
                        color: colors.text,
                        marginBottom: Spacing['0.5'],
                      }}
                    >
                      Upgrade to Premium
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textMuted,
                      }}
                    >
                      Unlimited devotionals & more
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Profile section */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing['3'] }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  color: colors.textHint,
                  letterSpacing: 1,
                }}
              >
                Profile
              </Text>
              {!isEditingProfile ? (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEditName(user?.name ?? '');
                    setEditAboutMe(user?.aboutMe ?? '');
                    setIsEditingProfile(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                  accessibilityHint="Edit your name and about information"
                >
                  <PencilSimpleIcon size={14} color={colors.textSubtle} weight="light" />
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={handleCancelEditProfile}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel editing"
                    accessibilityHint="Discard changes and exit edit mode"
                  >
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textSubtle }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={handleSaveProfile}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Save profile"
                    accessibilityHint="Save your profile changes"
                  >
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent }}>Save</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
              {/* Name */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: Spacing['4'],
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                    }}
                  >
                    Name
                  </Text>
                  {isEditingProfile ? (
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      accessibilityLabel="Your name"
                      accessibilityHint="Enter your first name"
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                        marginTop: Spacing['0.5'],
                        padding: Spacing['0'],
                      }}
                      autoCapitalize="words"
                      placeholder="Your name"
                      placeholderTextColor={colors.textHint}
                    />
                  ) : (
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                        marginTop: Spacing['0.5'],
                      }}
                    >
                      {user?.name || 'Not set'}
                    </Text>
                  )}
                </View>
              </View>

              {/* About Me */}
              <View
                style={{
                  padding: Spacing['4'],
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: FontSize.xs,
                    color: colors.textMuted,
                    marginBottom: Spacing['1.5'],
                  }}
                >
                  About you
                </Text>
                {isEditingProfile ? (
                  <TextInput
                    value={editAboutMe}
                    onChangeText={setEditAboutMe}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel="About you"
                    accessibilityHint="Tell us about yourself, who you are, and what matters to you"
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: FontSize.sm,
                      color: colors.text,
                      lineHeight: 20,
                      minHeight: 80,
                      padding: Spacing['0'],
                    }}
                    placeholder="Tell us about yourself..."
                    placeholderTextColor={colors.textHint}
                  />
                ) : (
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: FontSize.sm,
                      color: colors.text,
                      lineHeight: 20,
                    }}
                    numberOfLines={4}
                  >
                    {user?.aboutMe || 'Not set'}
                  </Text>
                )}
              </View>
            </View>

            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.xs,
                color: colors.textHint,
                marginTop: -Spacing['4'],
                marginBottom: Spacing['6'],
                paddingHorizontal: Spacing['1'],
                lineHeight: 18,
              }}
            >
              This info shapes how your devotionals are written. Edit anytime to keep them personal.
            </Text>
          </Animated.View>

          {/* Reading section */}
          <Animated.View entering={FadeInDown.duration(400).delay(150)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
                letterSpacing: 1,
                marginBottom: Spacing['3'],
              }}
            >
              Reading
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
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
                      accessibilityHint={`Set reading font size to ${size.label}`}
                      accessibilityState={{ selected: user?.fontSize === size.value }}
                      style={{
                        marginLeft: index > 0 ? Spacing['2'] : 0,
                      }}
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
          </Animated.View>

          {/* Appearance section */}
          <Animated.View entering={FadeInDown.duration(400).delay(155)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
                letterSpacing: 1,
                marginBottom: Spacing['3'],
              }}
            >
              Appearance
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
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
                        accessibilityHint={`Switch to ${option.label.toLowerCase()} mode`}
                        accessibilityState={{ selected: isSelected }}
                        style={{
                          marginLeft: index > 0 ? Spacing['2'] : 0,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: isSelected
                              ? colors.text
                              : colors.buttonBackground,
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
            </View>
          </Animated.View>

          {/* Premium Customization section */}
          <Animated.View entering={FadeInDown.duration(400).delay(157)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['3'] }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  color: colors.textHint,
                  letterSpacing: 1,
                }}
              >
                Premium
              </Text>
              {!user?.isPremium && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginLeft: Spacing['2'],
                    backgroundColor: colors.buttonBackground,
                    paddingHorizontal: Spacing['2'],
                    paddingVertical: 3,
                    borderRadius: 6,
                  }}
                >
                  <LockIcon size={10} color={colors.textSubtle} weight="light" />
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 10,
                      color: colors.textSubtle,
                      marginLeft: Spacing['1'],
                    }}
                  >
                    Upgrade
                  </Text>
                </View>
              )}
            </View>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
                opacity: user?.isPremium ? 1 : 0.7,
              }}
            >
              {/* Accent Color subsection - Collapsible */}
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
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
                  <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ paddingHorizontal: Spacing['4'], paddingBottom: Spacing['4'] }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['3'] }}>
                      {ACCENT_THEMES.map((theme) => {
                        const isSelected = (user?.accentTheme ?? 'gold') === theme.id;
                        const swatchColor = isDark ? theme.dark : theme.light;
                        return (
                          <TouchableOpacity activeOpacity={0.7}
                            key={theme.id}
                            onPress={() => {
                              if (!user?.isPremium) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                setPremiumFeature('theme');
                                return;
                              }
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              updateUser({ accentTheme: theme.id });
                            }}
                            style={{
                              alignItems: 'center',
                              width: 56,
                            }}
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
                              }}
                            >
                              {isSelected && (
                                <CheckIcon size={16} color={colors.background} weight="bold" />
                              )}
                            </View>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: 11,
                                color: isSelected ? colors.text : colors.textMuted,
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

              {/* Reading Font subsection - Collapsible */}
              <View>
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
                    borderBottomWidth: expandedPremium === 'fonts' ? 1 : 0,
                    borderBottomColor: colors.border,
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
                  <Animated.View entering={FadeIn.duration(Duration.normal)}>
                    {READING_FONTS.map((font, index) => {
                      const isSelected = (user?.readingFont ?? 'source-serif') === font.id;
                      return (
                        <TouchableOpacity activeOpacity={0.7}
                          key={font.id}
                          onPress={() => {
                            if (!user?.isPremium) {
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

              {/* Notifications subsection */}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ paddingHorizontal: Spacing['4'], paddingTop: Spacing['4'], paddingBottom: Spacing['1'] }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.sm,
                      color: colors.text,
                    }}
                  >
                    Reminders
                  </Text>
                </View>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => handleToggleNotifications(!notificationsEnabled)}
                  accessibilityRole="button"
                  accessibilityLabel="Daily reminders"
                  accessibilityHint={notificationsEnabled ? "Turn off daily reminder notifications" : "Turn on daily reminder notifications"}
                  accessibilityState={{ selected: notificationsEnabled }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 13,
                    paddingHorizontal: Spacing['4'],
                    borderBottomWidth: notificationsEnabled && user?.isPremium ? 1 : 0,
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
                      color: (user?.isPremium ? notificationsEnabled : false) ? colors.text : colors.textMuted,
                    }}
                  >
                    {(user?.isPremium ? notificationsEnabled : false) ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>

                {notificationsEnabled && user?.isPremium && (
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => setShowTimeSelector(!showTimeSelector)}
                    accessibilityRole="button"
                    accessibilityLabel="Reminder time"
                    accessibilityHint={`Current reminder time is ${user?.reminderTime ?? '8:00 AM'}. Tap to change`}
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

                {/* Midday check-in toggle */}
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => handleToggleMiddayCheckIn(!middayCheckInEnabled)}
                  accessibilityRole="button"
                  accessibilityLabel="Midday check-in"
                  accessibilityHint={middayCheckInEnabled ? "Turn off midday check-in notifications" : "Turn on midday check-in notifications"}
                  accessibilityState={{ selected: middayCheckInEnabled }}
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
                  <View>
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
                      12:30 PM
                    </Text>
                  </View>
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

                {/* Evening wind-down toggle */}
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => handleToggleEveningWindDown(!eveningWindDownEnabled)}
                  accessibilityRole="button"
                  accessibilityLabel="Evening wind-down"
                  accessibilityHint={eveningWindDownEnabled ? "Turn off evening wind-down notifications" : "Turn on evening wind-down notifications"}
                  accessibilityState={{ selected: eveningWindDownEnabled }}
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
                  <View>
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
                      8:30 PM
                    </Text>
                  </View>
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
              </View>
              {/* Voice subsection - Moved into Premium */}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedPremium(expandedPremium === 'voice' ? null : 'voice');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: Spacing['4'],
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
                    <PlayIcon size={18} color={colors.text} weight="fill" />
                  </View>
                  <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      Reading Voice
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: FontSize.xs,
                        color: colors.textMuted,
                        marginTop: Spacing['0.5'],
                      }}
                    >
                      {CARTESIA_VOICES.find((v) => v.id === user?.preferredVoice)?.name ?? 'Katie'}
                    </Text>
                  </View>
                  <CaretDownIcon
                    size={20}
                    color={colors.textMuted}
                    weight="light"
                    style={{
                      transform: [{ rotate: expandedPremium === 'voice' ? '180deg' : '0deg' }],
                    }}
                  />
                </TouchableOpacity>

                {/* Voice options */}
                {expandedPremium === 'voice' && (
                  <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ padding: Spacing['2'] }}>
                    {CARTESIA_VOICES.map((option) => {
                      const isSelected = (user?.preferredVoice ?? '694f9389-aac1-45b6-b726-9d9369183238') === option.id;
                      const isLocked = option.premium && !user?.isPremium;
                      return (
                        <TouchableOpacity activeOpacity={0.7}
                          key={option.id}
                          onPress={() => {
                            if (isLocked) {
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                              setPremiumFeature('voice');
                              return;
                            }
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            updateUser({ preferredVoice: option.id });
                          }}
                          style={{
                            backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                            paddingVertical: Spacing['3'],
                            paddingHorizontal: Spacing['3'],
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: Spacing['1'],
                            opacity: isLocked ? 0.6 : 1,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] }}>
                              <Text
                                style={{
                                  fontFamily: FontFamily.uiMedium,
                                  fontSize: 15,
                                  color: colors.text,
                                }}
                              >
                                {option.name}
                              </Text>
                              {option.premium && !user?.isPremium && (
                                <LockIcon size={14} color={colors.textMuted} weight="light" />
                              )}
                            </View>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: FontSize.xs,
                                color: colors.textMuted,
                                marginTop: Spacing['0.5'],
                              }}
                            >
                              {option.description}
                            </Text>
                          </View>
                          
                          {/* Voice preview button */}
                          {!isLocked && (
                            <TouchableOpacity activeOpacity={0.7}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleVoicePreview(option.id);
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: Radius.lg,
                                backgroundColor: previewingVoiceId === option.id ? colors.accent : colors.buttonBackground,
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginRight: Spacing['2.5'],
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Preview ${option.name} voice`}
                            >
                              {previewingVoiceId === option.id && previewStatus.playing ? (
                                <PauseIcon size={14} color={colors.background} weight="fill" />
                              ) : (
                                <SpeakerHighIcon size={14} color={previewingVoiceId === option.id ? colors.background : colors.textMuted} weight="light" />
                              )}
                            </TouchableOpacity>
                          )}
                          {isLocked && <View style={{ width: 10 }} />}
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              borderWidth: 2,
                              borderColor: isSelected ? colors.text : colors.border,
                              backgroundColor: isSelected ? colors.text : 'transparent',
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            {isSelected && (
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: colors.background,
                                }}
                              />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </Animated.View>
                )}
              </View>
            </View>

            {/* Time options (outside the card for cleaner expand) */}
            {showTimeSelector && (
              <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ marginTop: -Spacing['4'], marginBottom: Spacing['6'] }}>
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
          </Animated.View>

          {/* Bible Translation section */}
          <Animated.View entering={FadeInDown.duration(400).delay(160)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
                letterSpacing: 1,
                marginBottom: Spacing['3'],
              }}
            >
              Bible Translation
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'translation' ? null : 'translation');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: Spacing['4'],
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
                  <BookIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Translation
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    {BIBLE_TRANSLATIONS.find((t) => t.value === user?.bibleTranslation)?.label ?? 'WEB'}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{
                    transform: [{ rotate: expandedPreference === 'translation' ? '180deg' : '0deg' }],
                  }}
                />
              </TouchableOpacity>

              {/* Translation options */}
              {expandedPreference === 'translation' && (
                <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ padding: Spacing['2'] }}>
                  {!user?.isPremium && (
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: FontSize.xs,
                        color: colors.textMuted,
                        marginBottom: Spacing['2.5'],
                        paddingHorizontal: Spacing['1'],
                        lineHeight: 17,
                      }}
                    >
                      Licensed translations — we pay for each one so you can read them here. Included with Premium.
                    </Text>
                  )}
                  {BIBLE_TRANSLATIONS.map((option) => {
                    const isSelected = (user?.bibleTranslation ?? 'WEB') === option.value;
                    const isLocked = option.premium && !user?.isPremium;
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={option.value}
                        onPress={() => {
                          if (isLocked) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            setPremiumFeature('translation');
                            return;
                          }
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({ bibleTranslation: option.value });
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          paddingVertical: Spacing['3'],
                          paddingHorizontal: Spacing['3'],
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: Spacing['1'],
                          opacity: isLocked ? 0.6 : 1,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text
                              style={{
                                fontFamily: FontFamily.uiMedium,
                                fontSize: 15,
                                color: colors.text,
                              }}
                            >
                              {option.label}
                            </Text>
                            {option.premium && !user?.isPremium && (
                              <LockIcon size={14} color={colors.textMuted} weight="light" />
                            )}
                          </View>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: FontSize.xs,
                              color: colors.textMuted,
                              marginTop: Spacing['0.5'],
                            }}
                          >
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.background,
                              }}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}
            </View>
          </Animated.View>

          {/* Writing Style section */}
          <Animated.View entering={FadeInDown.duration(400).delay(175)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
                letterSpacing: 1,
                marginBottom: Spacing['3'],
              }}
            >
              Writing Style
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
          {/* Tone preference */}
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
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Tone
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    {TONE_OPTIONS.find((o) => o.value === user?.writingStyle?.tone)?.label ?? 'Like a friend'}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{
                    transform: [{ rotate: expandedPreference === 'tone' ? '180deg' : '0deg' }],
                  }}
                />
              </TouchableOpacity>

              {/* Tone options */}
              {expandedPreference === 'tone' && (
                <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ padding: Spacing['2'] }}>
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
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 15,
                              color: colors.text,
                            }}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: FontSize.xs,
                              color: colors.textMuted,
                              marginTop: Spacing['0.5'],
                            }}
                          >
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.background,
                              }}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}

              {/* Depth preference */}
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.buttonBackground,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <StackIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Depth
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    {DEPTH_OPTIONS.find((o) => o.value === user?.writingStyle?.depth)?.label ?? 'A good balance'}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{
                    transform: [{ rotate: expandedPreference === 'depth' ? '180deg' : '0deg' }],
                  }}
                />
              </TouchableOpacity>

              {/* Depth options */}
              {expandedPreference === 'depth' && (
                <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ padding: Spacing['2'] }}>
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
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 15,
                              color: colors.text,
                            }}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: FontSize.xs,
                              color: colors.textMuted,
                              marginTop: Spacing['0.5'],
                            }}
                          >
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.background,
                              }}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}

              {/* Faith background preference */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'faith' ? null : 'faith');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: Spacing['4'],
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
                  <CompassIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Faith Background
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    {FAITH_OPTIONS.find((o) => o.value === user?.writingStyle?.faithBackground)?.label ?? "I'm growing"}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{
                    transform: [{ rotate: expandedPreference === 'faith' ? '180deg' : '0deg' }],
                  }}
                />
              </TouchableOpacity>

              {/* Faith options */}
              {expandedPreference === 'faith' && (
                <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ padding: Spacing['2'] }}>
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
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 15,
                              color: colors.text,
                            }}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: FontSize.xs,
                              color: colors.textMuted,
                              marginTop: Spacing['0.5'],
                            }}
                          >
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.background,
                              }}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}

              {/* Life stage preference */}
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.buttonBackground,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <HourglassIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Life Stage
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    {LIFE_STAGE_OPTIONS.find((o) => o.value === user?.writingStyle?.lifeStage)?.label ?? "I'm building my life"}
                  </Text>
                </View>
                <CaretDownIcon
                  size={20}
                  color={colors.textMuted}
                  weight="light"
                  style={{
                    transform: [{ rotate: expandedPreference === 'lifeStage' ? '180deg' : '0deg' }],
                  }}
                />
              </TouchableOpacity>

              {/* Life stage options */}
              {expandedPreference === 'lifeStage' && (
                <Animated.View entering={FadeIn.duration(Duration.normal)} style={{ padding: Spacing['2'] }}>
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
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 15,
                              color: colors.text,
                            }}
                          >
                            {option.label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: FontSize.xs,
                              color: colors.textMuted,
                              marginTop: Spacing['0.5'],
                            }}
                          >
                            {option.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: isSelected ? colors.text : colors.border,
                            backgroundColor: isSelected ? colors.text : 'transparent',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          {isSelected && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: colors.background,
                              }}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </Animated.View>
              )}
            </View>
          </Animated.View>
          {/* Your Privacy */}
          <Animated.View entering={FadeInDown.duration(400).delay(150)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
                letterSpacing: 1,
                marginBottom: Spacing['3'],
              }}
            >
              Your Privacy
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: Spacing['5'],
                marginBottom: Spacing['6'],
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 15,
                  color: colors.text,
                  marginBottom: Spacing['3'],
                }}
              >
                Your data stays yours
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.sm,
                  color: colors.textMuted,
                  lineHeight: 22,
                  marginBottom: Spacing['2'],
                }}
              >
                Your journal entries, reflections, and personal story stay on your device.
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.sm,
                  color: colors.textMuted,
                  lineHeight: 22,
                  marginBottom: Spacing['2'],
                }}
              >
                We never train AI models on your private writing.
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.sm,
                  color: colors.textMuted,
                  lineHeight: 22,
                }}
              >
                Your data is yours — export or delete anytime.
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(175)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
                letterSpacing: 1,
                marginBottom: Spacing['3'],
              }}
            >
              Support
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing['6'],
              }}
            >
              {user?.isPremium && (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
                  accessibilityRole="link"
                  accessibilityLabel="Manage Subscription"
                  accessibilityHint="Opens Apple subscription management"
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
                    <CreditCardIcon size={18} color={colors.text} weight="light" />
                  </View>
                  <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.buttonBackground,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {isExportingData ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <ChatDotsIcon size={18} color={colors.text} weight="light" />
                  )}
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    {isExportingData ? 'Sending report...' : 'Report a bug'}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.buttonBackground,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <StarIcon size={18} color={colors.text} weight="fill" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Rate Unfold
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.xs,
                      color: colors.textMuted,
                      marginTop: Spacing['0.5'],
                    }}
                  >
                    Leave a review
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.7}
                onPress={() => Linking.openURL('https://unfoldapp.co/privacy')}
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.buttonBackground,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <LockIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Privacy Policy
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.7}
                onPress={() => Linking.openURL('https://unfoldapp.co/terms')}
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: colors.buttonBackground,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <BookIcon size={18} color={colors.text} weight="light" />
                </View>
                <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Terms of Use
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* AI provider disclosure */}
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textSubtle,
                textAlign: 'center',
                marginTop: Spacing['3'],
                paddingHorizontal: Spacing['4'],
                lineHeight: 17,
              }}
            >
              Devotionals generated by Grok (xAI). Audio by Cartesia.
            </Text>
          </Animated.View>

          {/* Danger zone */}
          <Animated.View entering={FadeInDown.duration(400).delay(200)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textHint,
                letterSpacing: 1,
                marginBottom: Spacing['3'],
              }}
            >
              Data
            </Text>

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

            {isAuthenticated && !isAnonymous && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowDeleteAccount(true);
                }}
                accessibilityLabel="Delete account"
                accessibilityHint="Permanently delete your account and all data"
              >
                <View
                  style={{
                    borderRadius: Radius.md,
                    paddingVertical: Spacing['3.5'],
                    paddingHorizontal: Spacing['4'],
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <TrashIcon size={20} color={colors.error} weight="light" />
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.error,
                      marginLeft: Spacing['3'],
                    }}
                  >
                    Delete account
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* App info */}
          <Animated.View
            entering={FadeIn.duration(400).delay(300)}
            style={{ marginTop: Spacing['12'], alignItems: 'center' }}
          >
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
            {__DEV__ && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/(tabs)/(you)/component-catalog')}
                style={{ marginTop: Spacing['3'] }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: FontSize.xs,
                    color: colors.accent,
                  }}
                >
                  Component Catalog
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <PremiumFeatureSheet
        visible={!!premiumFeature}
        onClose={() => setPremiumFeature(null)}
        feature={premiumFeature ?? 'general'}
      />

      <DeleteAccountSheet
        visible={showDeleteAccount}
        onClose={() => setShowDeleteAccount(false)}
      />
    </View>
  );
}
