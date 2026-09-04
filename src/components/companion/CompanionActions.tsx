/**
 * CompanionActions — post-response action row.
 * Copy, share, save to journal, try another reply, thumbs up/down.
 * Staggered 80ms fade-in per Storyboard D.
 * A thumbs-down opens a "What was off?" row of reason chips; picking one
 * records the reason and offers a regenerate that carries it.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Share, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import {
  ArrowsClockwiseIcon,
  CopyIcon,
  NotePencilIcon,
  ShareNetworkIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  CheckIcon,
} from '@/components/icons';
import { Chip } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { Duration } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { FEEDBACK_REASONS } from '@/lib/companion-regenerate';
import { COMPANION_TEXT_INDENT } from './CompanionMessageContent';

const EASE_OUT = Easing.out(Easing.cubic);
const STAGGER = 80;
const CONFIRMATION_MS = 2000;

interface Props {
  messageId: string;
  content: string;
  feedback: 'positive' | 'negative' | null;
  /** Reason chip id recorded with a thumbs-down (FEEDBACK_REASONS). */
  feedbackReason?: string | null;
  /** Present only on a reply that can be regenerated (the last finished one). */
  onRegenerate?: (reason?: string) => void;
  /** Present only when a current series exists to file the entry under. Returns true when saved. */
  onSaveToJournal?: (messageId: string) => boolean;
  visible: boolean;
}

function ActionButton({
  icon: Icon,
  activeIcon: ActiveIcon,
  delay,
  isActive,
  activeColor,
  onPress,
  accessibilityLabel,
  hintColor,
}: {
  icon: React.ComponentType<any>;
  activeIcon?: React.ComponentType<any>;
  delay: number;
  isActive: boolean;
  activeColor: string;
  onPress: () => void;
  accessibilityLabel: string;
  hintColor: string;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: Duration.fast, easing: EASE_OUT }));
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const CurrentIcon = isActive && ActiveIcon ? ActiveIcon : Icon;
  const color = isActive ? activeColor : hintColor;
  const weight = isActive ? 'fill' : ('light' as const);

  return (
    <Animated.View style={style}>
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={4}
        style={{
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CurrentIcon size={18} color={color} weight={weight} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function CompanionActions({
  messageId,
  content,
  feedback,
  feedbackReason = null,
  onRegenerate,
  onSaveToJournal,
  visible,
}: Props) {
  const { colors } = useTheme();
  const setFeedback = useCompanionChatStore((s) => s.setFeedback);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!visible) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(content);
    setCopied(true);
    AccessibilityInfo.announceForAccessibility('Copied');
    setTimeout(() => setCopied(false), CONFIRMATION_MS);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: content });
    } catch {
      // Share cancelled or failed
    }
  };

  const handleSaveToJournal = () => {
    if (!onSaveToJournal || !onSaveToJournal(messageId)) return;
    setSaved(true);
    AccessibilityInfo.announceForAccessibility('Saved to journal');
    setTimeout(() => setSaved(false), CONFIRMATION_MS);
  };

  const selectedReason = FEEDBACK_REASONS.find((reason) => reason.id === feedbackReason) ?? null;

  // Buttons in row order; delays follow the position so optional buttons
  // never leave a gap in the stagger.
  const buttons = [
    {
      key: 'copy',
      icon: copied ? CheckIcon : CopyIcon,
      isActive: copied,
      activeColor: colors.success,
      onPress: handleCopy,
      accessibilityLabel: copied ? 'Copied' : 'Copy response',
    },
    {
      key: 'share',
      icon: ShareNetworkIcon,
      isActive: false,
      activeColor: colors.accent,
      onPress: handleShare,
      accessibilityLabel: 'Share response',
    },
    ...(onSaveToJournal
      ? [{
          key: 'journal',
          icon: saved ? CheckIcon : NotePencilIcon,
          isActive: saved,
          activeColor: colors.success,
          onPress: handleSaveToJournal,
          accessibilityLabel: saved ? 'Saved to journal' : 'Save to journal',
        }]
      : []),
    ...(onRegenerate
      ? [{
          key: 'regenerate',
          icon: ArrowsClockwiseIcon,
          isActive: false,
          activeColor: colors.accent,
          onPress: () => onRegenerate(),
          accessibilityLabel: 'Try another reply',
        }]
      : []),
    {
      key: 'up',
      icon: ThumbsUpIcon,
      isActive: feedback === 'positive',
      activeColor: colors.accent,
      onPress: () => setFeedback(messageId, 'positive'),
      accessibilityLabel: 'Helpful',
    },
    {
      key: 'down',
      icon: ThumbsDownIcon,
      isActive: feedback === 'negative',
      activeColor: colors.error,
      onPress: () => setFeedback(messageId, 'negative'),
      accessibilityLabel: 'Not helpful',
    },
  ];

  return (
    <View style={{ paddingLeft: COMPANION_TEXT_INDENT, marginTop: Spacing['2'] }}>
      <View style={{ flexDirection: 'row', gap: Spacing['4'] }}>
        {buttons.map((button, index) => (
          <ActionButton
            key={button.key}
            icon={button.icon}
            delay={index * STAGGER}
            isActive={button.isActive}
            activeColor={button.activeColor}
            onPress={button.onPress}
            accessibilityLabel={button.accessibilityLabel}
            hintColor={colors.textHint}
          />
        ))}
      </View>

      {feedback === 'negative' && (
        <View style={{ marginTop: Spacing['2'], gap: Spacing['2'] }}>
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.xs,
              color: colors.textMuted,
            }}
          >
            What was off?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'] }}>
            {FEEDBACK_REASONS.map((reason) => (
              <Chip
                key={reason.id}
                variant="filter"
                label={reason.label}
                selected={reason.id === feedbackReason}
                onPress={() => setFeedback(messageId, 'negative', reason.id)}
              />
            ))}
          </View>
          {selectedReason && onRegenerate && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try another reply"
              hitSlop={4}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRegenerate(selectedReason.id);
              }}
              style={{ alignSelf: 'flex-start', paddingVertical: Spacing['1'] }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: FontSize.sm,
                  color: colors.accent,
                }}
              >
                Try another reply
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
