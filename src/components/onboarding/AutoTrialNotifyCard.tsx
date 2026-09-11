import { Pressable, Text, View } from 'react-native';
import type { NotificationPermissionState } from '@/lib/notification-ask';

export function AutoTrialNotifyCard({
  permission,
  phase,
  onAsk,
  onOpenSettings,
}: {
  permission: NotificationPermissionState;
  phase: 'idle' | 'requesting' | 'registering' | 'registration_failed';
  onAsk(): void;
  onOpenSettings(): void;
}) {
  // DG-1: visual treatment pending 07-design-final.md
  if (permission === 'granted' && phase !== 'registration_failed') {
    return null;
  }

  const requesting = phase === 'requesting' || phase === 'registering';

  return (
    <View>
      <Text>{`permission:${permission}`}</Text>
      <Text>{`phase:${phase}`}</Text>
      {permission === 'denied' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          onPress={onOpenSettings}
        >
          <Text>Open Settings</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notify me"
          disabled={requesting}
          onPress={onAsk}
        >
          <Text>{phase === 'registration_failed' ? 'Notify me again' : 'Notify me'}</Text>
        </Pressable>
      )}
    </View>
  );
}
