import { type ComponentProps, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { BellIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import type { NotifyControlState } from '@/lib/generating-notify-state';

/** Copy for the nudge notes under the notify control: one tree, three states. */
export const NOTIFY_NOTE_COPY: Record<Extract<NotifyControlState, 'pending' | 'denied' | 'registration-failed'>, string> = {
  pending: 'Setting up your nudge\u2026',
  denied: 'Notifications are off for Unfold. Turn them on in Settings and we\u2019ll nudge you when it\u2019s\u00A0ready.',
  'registration-failed': 'We couldn\u2019t set up the nudge. Check your connection and tap Notify me\u00A0again.',
};

export type NotifyNoteColors = {
  inputBackground: string;
  border: string;
  textMuted: string;
  textSubtle: string;
};

/**
 * A bordered note under the notify control: an icon (the bell unless given)
 * beside muted copy, with optional content — the Settings link — below it.
 */
export function NotifyNote({
  entering,
  colors,
  text,
  icon,
  centered = false,
  gap,
  children,
}: {
  entering: ComponentProps<typeof Animated.View>['entering'];
  colors: NotifyNoteColors;
  text: string;
  icon?: ReactNode;
  /** Centre the icon on the text (the spinner) instead of top-aligning it. */
  centered?: boolean;
  gap?: number;
  children?: ReactNode;
}) {
  return (
    <Animated.View
      entering={entering}
      style={{ marginTop: Spacing['10'], width: '100%', alignItems: 'center', ...(gap === undefined ? {} : { gap }) }}
    >
      <View
        style={[
          styles.notifyNote,
          { ...(centered ? { alignItems: 'center' as const } : {}), backgroundColor: colors.inputBackground, borderColor: colors.border },
        ]}
      >
        {icon ?? <BellIcon size={14} color={colors.textSubtle} weight="light" />}
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
    width: '100%',
    paddingHorizontal: Spacing['4'],
    paddingVertical: 10,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  notifyNoteText: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 13,
    lineHeight: 18,
    marginLeft: Spacing['2'],
  },
});
