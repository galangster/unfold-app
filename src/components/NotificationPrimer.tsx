import { View, Text, TouchableOpacity, Modal } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BellIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { alpha } from '@/components/ui';
import { requestNotificationPermissions } from '@/lib/notifications';
import { registerPushToken } from '@/lib/push-notifications';

/**
 * In-app primer shown after the first completed day.
 *
 * Deliberately a primer, not the OS dialog: iOS grants exactly one system
 * prompt, so we only spend it once the user has said yes here. Declining this
 * costs nothing and leaves the real prompt available later.
 *
 * Placement matters more than the copy. Day progression is calendar-gated —
 * having finished today's reading, the user cannot continue until tomorrow, so
 * "we'll tell you when tomorrow's is ready" is the one thing they actually want
 * at this exact moment. The previous ask fired on a loading spinner during
 * generation, before the reader had seen a single word.
 */
export function NotificationPrimer({
  visible,
  onResolved,
}: {
  visible: boolean;
  /** Called once the user has accepted or declined. Always fires. */
  onResolved: (granted: boolean) => void;
}) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  const handleEnable = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let granted = false;
    try {
      granted = await requestNotificationPermissions();
      if (granted) void registerPushToken();
    } catch {
      granted = false;
    }
    onResolved(granted);
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onResolved(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View
        style={{
          flex: 1,
          backgroundColor: alpha(colors.background, 0.96),
          justifyContent: 'center',
          paddingHorizontal: Spacing['6'],
        }}
      >
        <Animated.View
          entering={reducedMotion ? undefined : FadeInUp.duration(Duration.slow).easing(Ease.out)}
          style={{ alignItems: 'center' }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: alpha(colors.accent, 0.1),
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: Spacing['5'],
            }}
          >
            <BellIcon size={22} color={colors.accent} weight="light" />
          </View>

          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 26,
              lineHeight: 32,
              color: colors.text,
              textAlign: 'center',
              marginBottom: Spacing['3'],
            }}
          >
            {'Tomorrow’s reading is\nwritten overnight'}
          </Text>

          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 16,
              lineHeight: 24,
              color: colors.textMuted,
              textAlign: 'center',
              marginBottom: Spacing['8'],
            }}
          >
            {'We’ll let you know the moment it’s ready.'}
          </Text>
        </Animated.View>

        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(200).easing(Ease.out)}
          style={{ gap: Spacing['3'] }}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleEnable}
            accessibilityRole="button"
            accessibilityLabel="Turn on notifications"
            style={{
              backgroundColor: colors.buttonBackground,
              paddingVertical: Spacing['4'],
              borderRadius: Radius.full,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.base,
                color: colors.background,
              }}
            >
              Notify me
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            style={{ paddingVertical: Spacing['3'], alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.sm,
                color: colors.textHint,
              }}
            >
              Not now
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
