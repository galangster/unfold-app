import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Linking, Platform, Alert, TextInput, ActivityIndicator, AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Crown, Trash2, Lock, Play, Star, ChevronDown, MessageSquare, Layers, Compass, Book, Sun, Moon, Monitor, UserCircle, Pencil, Check, Palette, Type } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore, FontSize, WritingTone, ContentDepth, FaithBackground, BIBLE_TRANSLATIONS, BibleTranslation, ThemeMode, ACCENT_THEMES, AccentThemeId, READING_FONTS, ReadingFontId } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import {
  scheduleDailyReminder,
  cancelAllReminders,
  areNotificationsEnabled,
} from '@/lib/notifications';
import { exportBugReportBundleToFile, logBugEvent } from '@/lib/bug-logger';
import { CARTESIA_VOICES } from '@/lib/cartesia';

const BACKEND_URL = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL || 'http://localhost:3000';

const REMINDER_TIMES = [
  { value: '6:00 AM', label: 'Early morning' },
  { value: '8:00 AM', label: 'Morning' },
  { value: '12:00 PM', label: 'Midday' },
  { value: '6:00 PM', label: 'Evening' },
  { value: '9:00 PM', label: 'Night' },
];

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
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

export default function SettingsScreen() {
  const router = useRouter();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const reset = useUnfoldStore((s) => s.reset);
  const { colors, isDark } = useTheme();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showTimeSelector, setShowTimeSelector] = useState(false);
  const [expandedPreference, setExpandedPreference] = useState<'tone' | 'depth' | 'faith' | 'translation' | null>(null);
  const [expandedPremium, setExpandedPremium] = useState<'colors' | 'fonts' | null>('colors');

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? '');
  const [editAboutMe, setEditAboutMe] = useState(user?.aboutMe ?? '');

  // Loading states for async operations
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

  const handleToggleNotifications = async (value: boolean) => {
    // If not premium, prompt to upgrade
    if (!user?.isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/paywall');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (value) {
      // Enable notifications - schedule with current time
      const time = user?.reminderTime ?? '8:00 AM';
      const result = await scheduleDailyReminder(time);
      if (result) {
        setNotificationsEnabled(true);
        updateUser({ reminderTime: time });
      }
    } else {
      // Disable notifications
      await cancelAllReminders();
      setNotificationsEnabled(false);
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
      const response = await fetch(`${BACKEND_URL}/api/bug-report/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Return to the previous screen"
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
            Settings
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Premium section */}
          {!user?.isPremium && (
            <Animated.View entering={FadeInDown.duration(400)}>
              <Pressable 
                onPress={handleUpgrade} 
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Premium"
                accessibilityHint="Unlock unlimited devotionals and more premium features"
                style={{ marginBottom: 24 }}
              >
                <View
                  style={{
                    backgroundColor: colors.buttonBackground,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: colors.inputBackground,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Crown size={22} color={colors.text} />
                  </View>
                  <View style={{ marginLeft: 16, flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 16,
                        color: colors.text,
                        marginBottom: 2,
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
              </Pressable>
            </Animated.View>
          )}

          {/* Profile section */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textHint,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Profile
              </Text>
              {!isEditingProfile ? (
                <Pressable
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
                  <Pencil size={14} color={colors.textSubtle} />
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Pressable
                    onPress={handleCancelEditProfile}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel editing"
                    accessibilityHint="Discard changes and exit edit mode"
                  >
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textSubtle }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveProfile}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Save profile"
                    accessibilityHint="Save your profile changes"
                  >
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent }}>Save</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
              }}
            >
              {/* Name */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                  <UserCircle size={18} color={colors.text} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 12,
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
                        marginTop: 2,
                        padding: 0,
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
                        marginTop: 2,
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
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textMuted,
                    marginBottom: 6,
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
                      fontSize: 14,
                      color: colors.text,
                      lineHeight: 20,
                      minHeight: 80,
                      padding: 0,
                    }}
                    placeholder="Tell us about yourself..."
                    placeholderTextColor={colors.textHint}
                  />
                ) : (
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 14,
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
                fontSize: 12,
                color: colors.textHint,
                marginTop: -16,
                marginBottom: 24,
                paddingHorizontal: 4,
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
                fontSize: 12,
                color: colors.textHint,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Reading
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                    <Pressable
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
                        marginLeft: index > 0 ? 8 : 0,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor:
                            user?.fontSize === size.value
                              ? colors.text
                              : colors.buttonBackground,
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          borderRadius: 8,
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
                    </Pressable>
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
                fontSize: 12,
                color: colors.textHint,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Appearance
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                      <Pressable
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
                          marginLeft: index > 0 ? 8 : 0,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: isSelected
                              ? colors.text
                              : colors.buttonBackground,
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.text : colors.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Icon
                            size={14}
                            color={isSelected ? colors.background : colors.text}
                          />
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: 12,
                              color: isSelected ? colors.background : colors.text,
                              marginLeft: 6,
                            }}
                          >
                            {option.label}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Premium Customization section */}
          <Animated.View entering={FadeInDown.duration(400).delay(157)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textHint,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Premium
              </Text>
              {!user?.isPremium && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginLeft: 8,
                    backgroundColor: colors.buttonBackground,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                  }}
                >
                  <Lock size={10} color={colors.textSubtle} />
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 10,
                      color: colors.textSubtle,
                      marginLeft: 4,
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
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
                opacity: user?.isPremium ? 1 : 0.7,
              }}
            >
              {/* Accent Color subsection - Collapsible */}
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedPremium(expandedPremium === 'colors' ? null : 'colors');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 16,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Palette size={18} color={colors.text} />
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
                  <ChevronDown
                    size={18}
                    color={colors.textMuted}
                    style={{
                      transform: [{ rotate: expandedPremium === 'colors' ? '180deg' : '0deg' }],
                    }}
                  />
                </Pressable>

                {expandedPremium === 'colors' && (
                  <Animated.View entering={FadeIn.duration(200)} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      {ACCENT_THEMES.map((theme) => {
                        const isSelected = (user?.accentTheme ?? 'gold') === theme.id;
                        const swatchColor = isDark ? theme.dark : theme.light;
                        return (
                          <Pressable
                            key={theme.id}
                            onPress={() => {
                              if (!user?.isPremium) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                router.push('/paywall');
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
                                <Check size={16} color={isDark ? '#000' : '#fff'} strokeWidth={3} />
                              )}
                            </View>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: 11,
                                color: isSelected ? colors.text : colors.textMuted,
                                marginTop: 6,
                              }}
                            >
                              {theme.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Animated.View>
                )}
              </View>

              {/* Reading Font subsection - Collapsible */}
              <View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedPremium(expandedPremium === 'fonts' ? null : 'fonts');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 16,
                    borderBottomWidth: expandedPremium === 'fonts' ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Type size={18} color={colors.text} />
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textMuted,
                      }}
                    >
                      {READING_FONTS.find(f => f.id === (user?.readingFont ?? 'source-serif'))?.name}
                    </Text>
                    <ChevronDown
                      size={18}
                      color={colors.textMuted}
                      style={{
                        transform: [{ rotate: expandedPremium === 'fonts' ? '180deg' : '0deg' }],
                      }}
                    />
                  </View>
                </Pressable>

                {expandedPremium === 'fonts' && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    {READING_FONTS.map((font, index) => {
                      const isSelected = (user?.readingFont ?? 'source-serif') === font.id;
                      return (
                        <Pressable
                          key={font.id}
                          onPress={() => {
                            if (!user?.isPremium) {
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                              router.push('/paywall');
                              return;
                            }
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            updateUser({ readingFont: font.id });
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 13,
                            paddingHorizontal: 16,
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
                                marginBottom: 2,
                              }}
                            >
                              {font.name}
                            </Text>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: 12,
                                color: colors.textMuted,
                              }}
                            >
                              {font.preview}
                            </Text>
                          </View>
                          {isSelected && (
                            <Check size={18} color={colors.accent} strokeWidth={2.5} />
                          )}
                        </Pressable>
                      );
                    })}
                  </Animated.View>
                )}
              </View>

              {/* Notifications subsection */}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 14,
                      color: colors.text,
                    }}
                  >
                    Reminders
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleToggleNotifications(!notificationsEnabled)}
                  accessibilityRole="button"
                  accessibilityLabel="Daily reminders"
                  accessibilityHint={user?.isPremium ? (notificationsEnabled ? "Turn off daily reminder notifications" : "Turn on daily reminder notifications") : "Premium feature. Opens upgrade options"}
                  accessibilityState={{ disabled: !user?.isPremium, selected: notificationsEnabled && user?.isPremium }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 13,
                    paddingHorizontal: 16,
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
                      fontFamily: FontFamily.mono,
                      fontSize: 14,
                      color: (user?.isPremium ? notificationsEnabled : false) ? colors.text : colors.textMuted,
                    }}
                  >
                    {(user?.isPremium ? notificationsEnabled : false) ? 'On' : 'Off'}
                  </Text>
                </Pressable>

                {notificationsEnabled && user?.isPremium && (
                  <Pressable
                    onPress={() => setShowTimeSelector(!showTimeSelector)}
                    accessibilityRole="button"
                    accessibilityLabel="Reminder time"
                    accessibilityHint={`Current reminder time is ${user?.reminderTime ?? '8:00 AM'}. Tap to change`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 13,
                      paddingHorizontal: 16,
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
                        fontFamily: FontFamily.mono,
                        fontSize: 14,
                        color: colors.textMuted,
                      }}
                    >
                      {user?.reminderTime ?? '8:00 AM'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Time options (outside the card for cleaner expand) */}
            {showTimeSelector && (
              <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: -16, marginBottom: 24 }}>
                {REMINDER_TIMES.map((time) => (
                  <Pressable
                    key={time.value}
                    onPress={() => handleSelectTime(time.value)}
                  >
                    <View
                      style={{
                        backgroundColor:
                          user?.reminderTime === time.value
                            ? colors.buttonBackgroundPressed
                            : 'transparent',
                        paddingVertical: 14,
                        paddingHorizontal: 16,
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
                          fontFamily: FontFamily.mono,
                          fontSize: 13,
                          color: colors.textMuted,
                        }}
                      >
                        {time.value}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </Animated.View>
            )}
          </Animated.View>

          {/* Bible Translation section */}
          <Animated.View entering={FadeInDown.duration(400).delay(160)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textHint,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Bible Translation
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
              }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'translation' ? null : 'translation');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                  <Book size={18} color={colors.text} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
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
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {BIBLE_TRANSLATIONS.find((t) => t.value === user?.bibleTranslation)?.label ?? 'NIV'}
                  </Text>
                </View>
                <ChevronDown
                  size={20}
                  color={colors.textMuted}
                  style={{
                    transform: [{ rotate: expandedPreference === 'translation' ? '180deg' : '0deg' }],
                  }}
                />
              </Pressable>

              {/* Translation options */}
              {expandedPreference === 'translation' && (
                <Animated.View entering={FadeIn.duration(200)} style={{ padding: 8 }}>
                  {BIBLE_TRANSLATIONS.map((option) => {
                    const isSelected = (user?.bibleTranslation ?? 'NIV') === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({ bibleTranslation: option.value });
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 4,
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
                              fontSize: 12,
                              color: colors.textMuted,
                              marginTop: 2,
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
                      </Pressable>
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
                fontSize: 12,
                color: colors.textHint,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Writing Style
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
              }}
            >
              {/* Voice section */}
          <Animated.View entering={FadeInDown.duration(400).delay(170)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textHint,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Voice
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
              }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'voice' ? null : 'voice');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                  <Play size={18} color={colors.text} fill={colors.text} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
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
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {CARTESIA_VOICES.find((v) => v.id === user?.preferredVoice)?.name ?? 'Katie'}
                  </Text>
                </View>
                <ChevronDown
                  size={20}
                  color={colors.textMuted}
                  style={{
                    transform: [{ rotate: expandedPreference === 'voice' ? '180deg' : '0deg' }],
                  }}
                />
              </Pressable>

              {/* Voice options */}
              {expandedPreference === 'voice' && (
                <Animated.View entering={FadeIn.duration(200)} style={{ padding: 8 }}>
                  {CARTESIA_VOICES.map((option) => {
                    const isSelected = (user?.preferredVoice ?? '694f9389-aac1-45b6-b726-9d9369183238') === option.id;
                    const isLocked = option.premium && !user?.isPremium;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          if (isLocked) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            router.push('/paywall');
                            return;
                          }
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateUser({ preferredVoice: option.id });
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 4,
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
                              {option.name}
                            </Text>
                            {option.premium && !user?.isPremium && (
                              <Lock size={14} color={colors.textMuted} />
                            )}
                          </View>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: 12,
                              color: colors.textMuted,
                              marginTop: 2,
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
                      </Pressable>
                    );
                  })}
                </Animated.View>
              )}
            </View>
          </Animated.View>

          {/* Tone preference */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'tone' ? null : 'tone');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                  <MessageSquare size={18} color={colors.text} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
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
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {TONE_OPTIONS.find((o) => o.value === user?.writingStyle?.tone)?.label ?? 'Like a friend'}
                  </Text>
                </View>
                <ChevronDown
                  size={20}
                  color={colors.textMuted}
                  style={{
                    transform: [{ rotate: expandedPreference === 'tone' ? '180deg' : '0deg' }],
                  }}
                />
              </Pressable>

              {/* Tone options */}
              {expandedPreference === 'tone' && (
                <Animated.View entering={FadeIn.duration(200)} style={{ padding: 8 }}>
                  {TONE_OPTIONS.map((option) => {
                    const isSelected = user?.writingStyle?.tone === option.value;
                    return (
                      <Pressable
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
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 4,
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
                              fontSize: 12,
                              color: colors.textMuted,
                              marginTop: 2,
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
                      </Pressable>
                    );
                  })}
                </Animated.View>
              )}

              {/* Depth preference */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'depth' ? null : 'depth');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                  <Layers size={18} color={colors.text} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
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
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {DEPTH_OPTIONS.find((o) => o.value === user?.writingStyle?.depth)?.label ?? 'A good balance'}
                  </Text>
                </View>
                <ChevronDown
                  size={20}
                  color={colors.textMuted}
                  style={{
                    transform: [{ rotate: expandedPreference === 'depth' ? '180deg' : '0deg' }],
                  }}
                />
              </Pressable>

              {/* Depth options */}
              {expandedPreference === 'depth' && (
                <Animated.View entering={FadeIn.duration(200)} style={{ padding: 8 }}>
                  {DEPTH_OPTIONS.map((option) => {
                    const isSelected = user?.writingStyle?.depth === option.value;
                    return (
                      <Pressable
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
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 4,
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
                              fontSize: 12,
                              color: colors.textMuted,
                              marginTop: 2,
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
                      </Pressable>
                    );
                  })}
                </Animated.View>
              )}

              {/* Faith background preference */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedPreference(expandedPreference === 'faith' ? null : 'faith');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                  <Compass size={18} color={colors.text} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    Faith Journey
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {FAITH_OPTIONS.find((o) => o.value === user?.writingStyle?.faithBackground)?.label ?? "I'm growing"}
                  </Text>
                </View>
                <ChevronDown
                  size={20}
                  color={colors.textMuted}
                  style={{
                    transform: [{ rotate: expandedPreference === 'faith' ? '180deg' : '0deg' }],
                  }}
                />
              </Pressable>

              {/* Faith options */}
              {expandedPreference === 'faith' && (
                <Animated.View entering={FadeIn.duration(200)} style={{ padding: 8 }}>
                  {FAITH_OPTIONS.map((option) => {
                    const isSelected = user?.writingStyle?.faithBackground === option.value;
                    return (
                      <Pressable
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
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 4,
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
                              fontSize: 12,
                              color: colors.textMuted,
                              marginTop: 2,
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
                      </Pressable>
                    );
                  })}
                </Animated.View>
              )}
            </View>
          </Animated.View>

                    {/* Support section */}
          <Animated.View entering={FadeInDown.duration(400).delay(175)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textHint,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Support
            </Text>

            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 24,
              }}
            >
              <Pressable
                onPress={handleReportBug}
                disabled={isExportingData}
                accessibilityState={{ disabled: isExportingData }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                    <MessageSquare size={18} color={colors.text} />
                  )}
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
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
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {isExportingData ? 'Please wait...' : 'Send diagnostics report'}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={handleRateApp}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
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
                  <Star size={18} color={colors.text} fill={colors.text} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
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
                      fontSize: 12,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    Leave a review
                  </Text>
                </View>
              </Pressable>
            </View>
          </Animated.View>

          {/* Danger zone */}
          <Animated.View entering={FadeInDown.duration(400).delay(200)}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textHint,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Data
            </Text>

            <Pressable onPress={handleResetData} disabled={isDeletingAccount} accessibilityState={{ disabled: isDeletingAccount }}>
              <View
                style={{
                  borderRadius: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  opacity: isDeletingAccount ? 0.6 : 1,
                }}
              >
                {isDeletingAccount ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Trash2 size={20} color={colors.error} />
                )}
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.error,
                    marginLeft: 12,
                  }}
                >
                  {isDeletingAccount ? 'Resetting...' : 'Reset all data'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* App info */}
          <Animated.View
            entering={FadeIn.duration(400).delay(300)}
            style={{ marginTop: 48, alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 24,
                color: colors.textHint,
              }}
            >
              Unfold
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textHint,
                marginTop: 4,
              }}
            >
              Version 1.0.0
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
