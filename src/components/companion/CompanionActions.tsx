/**
 * CompanionActions — post-response action row.
 * Copy, share, journal, read aloud, thumbs up/down.
 * Staggered 80ms fade-in per Storyboard D.
 */
import { useEffect, useState } from 'react';
import { View, TouchableOpacity, Alert } from 'react-native';
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
  CopyIcon,
  ShareNetworkIcon,
  BookmarkSimpleIcon,
  SpeakerHighIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  CheckIcon,
} from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { Duration } from '@/constants/animations';
import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { Share } from 'react-native';

const EASE_OUT = Easing.out(Easing.cubic);
const STAGGER = 80;

interface Props {
  messageId: string;
  content: string;
  feedback: 'positive' | 'negative' | null;
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

export function CompanionActions({ messageId, content, feedback, visible }: Props) {
  const { colors } = useTheme();
  const setFeedback = useCompanionChatStore((s) => s.setFeedback);
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: content });
    } catch {
      // Share cancelled or failed
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        paddingLeft: 56, // 16 + 28 + 12 = companion text indent
        gap: 16,
        marginTop: 8,
      }}
    >
      <ActionButton
        icon={copied ? CheckIcon : CopyIcon}
        delay={0}
        isActive={copied}
        activeColor={colors.success}
        onPress={handleCopy}
        accessibilityLabel="Copy response"
        hintColor={colors.textHint}
      />
      <ActionButton
        icon={ShareNetworkIcon}
        delay={STAGGER}
        isActive={false}
        activeColor={colors.accent}
        onPress={handleShare}
        accessibilityLabel="Share response"
        hintColor={colors.textHint}
      />
      <ActionButton
        icon={ThumbsUpIcon}
        delay={STAGGER * 2}
        isActive={feedback === 'positive'}
        activeColor={colors.accent}
        onPress={() => setFeedback(messageId, 'positive')}
        accessibilityLabel="Helpful"
        hintColor={colors.textHint}
      />
      <ActionButton
        icon={ThumbsDownIcon}
        delay={STAGGER * 3}
        isActive={feedback === 'negative'}
        activeColor={colors.error}
        onPress={() => setFeedback(messageId, 'negative')}
        accessibilityLabel="Not helpful"
        hintColor={colors.textHint}
      />
    </View>
  );
}
