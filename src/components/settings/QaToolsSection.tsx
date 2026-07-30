import { Text, Alert } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useUnfoldStore, ThemeMode } from '@/lib/store';
import { debugFireTrialEndingNotification } from '@/lib/trial-notification';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUIState } from '@/lib/ui-state';
import { scheduleDevotionalReadyTapTestNotification } from '@/lib/notifications';
import { buildDevotionalSeed } from '@/lib/dev-seed';
import { SettingsSectionHeader } from './SettingsSectionHeader';

/** Internal QA affordances for notification/reveal verification builds. */
export function QaToolsSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const setHasSeenHomeTooltips = useUnfoldStore((s) => s.setHasSeenHomeTooltips);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const setDebugForceTrialExpired = useUIState((s) => s.setDebugForceTrialExpired);

  if (!isQaToolsEnabled()) {
    return null;
  }

  return (
    <>
      {/* --- QA Tools --- Internal QA affordances for notification/reveal verification builds. */}
      <SettingsSectionHeader label={__DEV__ ? "Dev Tools" : "QA Tools"} />

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
  );
}
