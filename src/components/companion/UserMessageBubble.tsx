/**
 * UserMessageBubble — right-aligned accent-tinted bubble.
 * Subtle tail effect via asymmetric border radius.
 *
 * ANIMATION: Fade + slide up on entrance (200ms, ease-out).
 */
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import type { CompanionMessage } from '@/lib/companion-chat-store';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — User Message Send
 *
 *   0ms   user bubble: opacity 0→1, translateY 6→0
 *         duration 200ms, ease-out cubic
 * ───────────────────────────────────────────────────────── */

const ENTERING = FadeInDown.duration(200).damping(20).stiffness(300);

interface Props {
  message: CompanionMessage;
}

export function UserMessageBubble({ message }: Props) {
  const { colors } = useTheme();

  return (
    <Animated.View
      entering={ENTERING}
      style={{ alignItems: 'flex-end', paddingRight: 16, paddingLeft: 60 }}
    >
      <View
        style={{
          backgroundColor: colors.accent + '26', // 15% opacity
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomRightRadius: 6,
          borderBottomLeftRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 10,
          maxWidth: '78%',
        }}
      >
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: 16,
            lineHeight: 24,
            color: colors.text,
          }}
        >
          {message.content}
        </Text>
      </View>
    </Animated.View>
  );
}
