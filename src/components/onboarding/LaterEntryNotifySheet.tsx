import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, View } from 'react-native';
import { AutoTrialNotifyCard } from '@/components/onboarding/AutoTrialNotifyCard';
import {
  askNotificationPermissionInContext,
  readNotificationPermissionState,
  type NotificationPermissionState,
} from '@/lib/notification-ask';
import { useUIState } from '@/lib/ui-state';

export function LaterEntryNotifySheet() {
  const pending = useUIState((state) => state.laterEntryNotifyAskPending);
  const [permission, setPermission] = useState<NotificationPermissionState>('undetermined');
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'registering' | 'registration_failed'>('idle');

  useEffect(() => {
    if (!pending) return;
    void readNotificationPermissionState().then(setPermission);
  }, [pending]);

  const hide = () => {
    useUIState.getState().setLaterEntryNotifyAskPending(false);
    setPhase('idle');
  };

  const onAsk = async () => {
    setPhase('requesting');
    const result = await askNotificationPermissionInContext({
      trigger: 'later_entry_fallback',
      registration: 'await',
    });
    if (result === 'registration_failed') {
      setPermission('granted');
      setPhase('registration_failed');
      return;
    }
    setPhase('idle');
    hide();
  };

  if (!pending) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={hide}>
      {/* DG-1: visual treatment pending 07-design-final.md */}
      <View>
        <AutoTrialNotifyCard
          permission={permission}
          phase={phase}
          onAsk={() => {
            void onAsk();
          }}
          onOpenSettings={() => {
            void Linking.openSettings();
            hide();
          }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={hide}>
          <View />
        </Pressable>
      </View>
    </Modal>
  );
}
