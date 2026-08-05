import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import {
  scheduleDailyReminder,
  cancelNotificationById,
  NOTIFICATION_IDS,
  areNotificationsEnabled,
} from '@/lib/notifications';
import { formatReminderTime } from '@/lib/format-reminder-time';
// NOTE: scheduleMiddayCheckIn / scheduleEveningWindDown / cancelMiddayCheckIn /
// cancelEveningWindDown are NOT imported here anymore. Check-in notification
// scheduling is owned exclusively by `useCheckInNotifications` — this section
// only mutates store state (via setMiddayCheckInEnabled etc.), and the
// single-owner hook reacts to those changes through its fingerprint watcher.
// See ~/vault/standards/one-owner-per-os-resource.md
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { SettingsSectionHeader, getSettingsCardStyle } from './SettingsSectionHeader';

const REMINDER_TIMES = [
  { value: '6:00 AM', label: 'Early morning' },
  { value: '8:00 AM', label: 'Morning' },
  { value: '12:00 PM', label: 'Midday' },
  { value: '6:00 PM', label: 'Evening' },
  { value: '9:00 PM', label: 'Night' },
];

export function RemindersSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
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

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showTimeSelector, setShowTimeSelector] = useState(false);

  // Check notification status on mount
  useEffect(() => {
    const checkNotifications = async () => {
      const enabled = await areNotificationsEnabled();
      const dailyReminderIntentEnabled = user?.dailyReminderEnabled ?? Boolean(user?.reminderTime);
      setNotificationsEnabled(enabled && !!user?.reminderTime && dailyReminderIntentEnabled);
    };
    checkNotifications();
  }, [user?.dailyReminderEnabled, user?.reminderTime]);

  const handleToggleNotifications = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value) {
      const time = user?.reminderTime ?? '8:00 AM';
      const result = await scheduleDailyReminder(time);
      if (result) {
        setNotificationsEnabled(true);
        updateUser({ reminderTime: time, dailyReminderEnabled: true });
        // Midday / evening check-in scheduling is owned by
        // `useCheckInNotifications` — it will detect any permission change
        // on the next foreground reconcile (or immediately, via its
        // fingerprint watcher, if policy / enabled flags change here).
      }
    } else {
      await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);
      setNotificationsEnabled(false);
      updateUser({ dailyReminderEnabled: false });
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
    updateUser({ reminderTime: time, dailyReminderEnabled: true });
    setShowTimeSelector(false);
  };

  return (
    <>
      <SettingsSectionHeader label="Reminders" />

      <View style={getSettingsCardStyle(colors)}>
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
              color: notificationsEnabled ? colors.text : colors.textMuted,
            }}
          >
            {notificationsEnabled ? 'On' : 'Off'}
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
              {formatReminderTime(user?.reminderTime ?? '8:00 AM')}
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
              {checkInGranted ? formatReminderTime(middayCheckInTime) : 'Premium'}
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
              {checkInGranted ? formatReminderTime(eveningWindDownTime) : 'Premium'}
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
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
          accessibilityRole="radiogroup"
          style={{ marginTop: -Spacing['4'], marginBottom: Spacing['6'] }}
        >
          {REMINDER_TIMES.map((time) => (
            <TouchableOpacity activeOpacity={0.7}
              key={time.value}
              onPress={() => handleSelectTime(time.value)}
              accessibilityRole="radio"
              accessibilityLabel={formatReminderTime(time.value)}
              accessibilityState={{ selected: user?.reminderTime === time.value }}
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
                  {formatReminderTime(time.value)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}
    </>
  );
}
