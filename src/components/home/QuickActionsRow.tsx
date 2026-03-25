import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PenIcon, ChatCircleDotsIcon, BookOpenIcon, HighlighterIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

interface Props {
  onJournalPress: () => void;
  onCompanionPress: () => void;
  onBiblePress: () => void;
  onRememberThisPress?: () => void;
  hasHighlights?: boolean;
}

const BASE_DELAY = 240;
const STAGGER_DELAY = 60;
const ICON_SIZE = 16;

interface ActionPillProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  index: number;
  entering: (anim: any) => any;
  accessibilityHint?: string;
}

function ActionPill({ icon, label, onPress, index, entering, accessibilityHint }: ActionPillProps) {
  const { colors } = useTheme();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View
      entering={entering(
        FadeIn.duration(400).delay(BASE_DELAY + index * STAGGER_DELAY)
      )}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={[
          styles.pill,
          { backgroundColor: colors.buttonBackground },
        ]}
      >
        {icon}
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function QuickActionsRow({
  onJournalPress,
  onCompanionPress,
  onBiblePress,
  onRememberThisPress,
  hasHighlights,
}: Props) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();

  const showHighlightPill = hasHighlights && onRememberThisPress != null;

  return (
    <Animated.View style={styles.container}>
      <ActionPill
        icon={<PenIcon size={ICON_SIZE} color={colors.textMuted} weight="light" />}
        label="Journal"
        onPress={onJournalPress}
        index={0}
        entering={entering}
        accessibilityHint="Open your journal"
      />
      <ActionPill
        icon={<ChatCircleDotsIcon size={ICON_SIZE} color={colors.textMuted} weight="light" />}
        label="Companion"
        onPress={onCompanionPress}
        index={1}
        entering={entering}
        accessibilityHint="Chat with your companion"
      />
      <ActionPill
        icon={<BookOpenIcon size={ICON_SIZE} color={colors.textMuted} weight="light" />}
        label="Bible"
        onPress={onBiblePress}
        index={2}
        entering={entering}
        accessibilityHint="Open the Bible reader"
      />
      {showHighlightPill && (
        <ActionPill
          icon={<HighlighterIcon size={ICON_SIZE} color={colors.accent} weight="light" />}
          label="Highlights"
          onPress={onRememberThisPress}
          index={3}
          entering={entering}
          accessibilityHint="View your highlights"
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['4'],
    gap: Spacing['2'],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
    borderRadius: Radius.xl,
    gap: 6,
  },
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});
