import { type ComponentProps, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { BellIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import type { NotifyControlState } from '@/lib/generating-notify-state';

/** Notification status below the generation actions. */
export const NOTIFY_NOTE_COPY: Record<Extract<NotifyControlState, 'pending' | 'denied' | 'registration-failed' | 'registration-unavailable'>, string> = {
  pending: 'Setting up your notification\u2026',
  denied: 'Notifications are off. You can turn them on in\u00A0Settings.',
  'registration-failed': 'We couldn\u2019t set up notifications.',
  'registration-unavailable': 'Notifications aren\u2019t available here.',
};

export type NotifyNoteColors = {
  textMuted: string;
};

/**
 * A boxless note under the notify control: an icon (the bell unless given)
 * beside muted copy, with an optional action below it.
 */
export function NotifyNote({
  entering,
  colors,
  text,
  icon,
  gap,
  children,
}: {
  entering: ComponentProps<typeof Animated.View>['entering'];
  colors: NotifyNoteColors;
  text: string;
  icon?: ReactNode;
  gap?: number;
  children?: ReactNode;
}) {
  return (
    <Animated.View
      entering={entering}
      style={{ marginTop: Spacing['4'], width: '100%', alignItems: 'center', gap }}
    >
      <View style={styles.notifyNote}>
        <View style={styles.icon}>
          {icon ?? <BellIcon size={14} color={colors.textMuted} weight="light" />}
        </View>
        <Text style={[styles.notifyNoteText, { color: colors.textMuted }]}>{text}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  notifyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    maxWidth: '100%',
    gap: Spacing['2'],
  },
  icon: {
    minHeight: 20,
    justifyContent: 'center',
  },
  notifyNoteText: {
    flexShrink: 1,
    fontFamily: FontFamily.ui,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
