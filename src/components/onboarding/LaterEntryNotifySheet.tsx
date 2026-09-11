import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { NotifyNote, NOTIFY_NOTE_COPY } from '@/components/generating/NotifyNote';
import {
  askNotificationPermissionInContext,
  readNotificationPermissionState,
  type NotificationPermissionState,
} from '@/lib/notification-ask';
import { useTheme } from '@/lib/theme';
import { useUIState } from '@/lib/ui-state';

type LaterEntryNotifyPhase = 'idle' | 'requesting' | 'registration_failed';

export function LaterEntryNotifySheet() {
  const pending = useUIState((state) => state.laterEntryNotifyAskPending);
  const { colors } = useTheme();
  const [permission, setPermission] = useState<NotificationPermissionState>('undetermined');
  const [phase, setPhase] = useState<LaterEntryNotifyPhase>('idle');
  const noteColors = {
    inputBackground: colors.backgroundElevated,
    border: colors.border,
    textMuted: colors.textMuted,
    textSubtle: colors.textSubtle,
  };

  useEffect(() => {
    if (!pending) return;
    void readNotificationPermissionState().then(setPermission);
  }, [pending]);

  const hide = () => {
    useUIState.getState().setLaterEntryNotifyAskPending(false);
    setPhase('idle');
    setPermission('undetermined');
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
    hide();
  };

  if (!pending) return null;

  const denied = permission === 'denied';
  const failed = phase === 'registration_failed';
  const noteText = denied
    ? NOTIFY_NOTE_COPY.denied
    : failed
      ? NOTIFY_NOTE_COPY['registration-failed']
      : 'We\u2019ll nudge you when it\u2019s\u00A0ready.';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={hide}>
      <View>
        <NotifyNote entering={undefined} colors={noteColors} text={noteText}>
          {denied ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
              onPress={() => {
                void Linking.openSettings();
                hide();
              }}
            >
              <Text>Open Settings</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notify me"
              disabled={phase === 'requesting'}
              onPress={() => {
                void onAsk();
              }}
            >
              <Text>{failed ? 'Notify me again' : 'Notify me'}</Text>
            </Pressable>
          )}
        </NotifyNote>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={hide}>
          <View />
        </Pressable>
      </View>
    </Modal>
  );
}
