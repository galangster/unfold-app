/**
 * CompanionMessageContent — full-width, no bubble.
 * Shows companion icon on first message of a group.
 * Renders rich text (verse pills, blockquotes) for complete messages,
 * plain text during streaming.
 *
 * ANIMATION: Fade in on mount (200ms, ease-out).
 */
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChatCircleDotsIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { StreamingCursor } from './StreamingCursor';
import { RichMessageText } from './RichMessageText';
import type { CompanionMessage } from '@/lib/companion-chat-store';

interface Props {
  message: CompanionMessage;
  showIcon: boolean;
  isStreaming: boolean;
  onVersePress?: (reference: string) => void;
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Companion Message Entrance
 *
 *   0ms   message container: opacity 0→1 (200ms, ease-out)
 *         streaming cursor starts immediately if streaming
 * ───────────────────────────────────────────────────────── */

const ENTERING = FadeIn.duration(200);

export function CompanionMessageContent({ message, showIcon, isStreaming, onVersePress }: Props) {
  const { colors } = useTheme();

  const isComplete = message.status === 'complete';

  return (
    <Animated.View entering={ENTERING} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 16 }}>
      {/* Icon column — 28px wide + 12px gap = 40px indent */}
      <View style={{ width: 28, marginRight: 12 }}>
        {showIcon && (
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.accent + '1F', // 12%
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChatCircleDotsIcon size={14} color={colors.accent} weight="light" />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingRight: 24 }}>
        {message.status === 'error' ? (
          <View
            style={{
              backgroundColor: colors.error + '1A',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 14,
                color: colors.error,
                lineHeight: 20,
              }}
            >
              {message.content || 'Something went wrong. Try again?'}
            </Text>
          </View>
        ) : isComplete && onVersePress ? (
          // Complete message — rich text with verse pills + blockquotes
          <RichMessageText
            text={message.content}
            onVersePress={onVersePress}
          />
        ) : (
          // Streaming or pending — plain text with cursor
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 16,
                lineHeight: 27.2, // 1.7x — more generous than user messages
                color: colors.text,
              }}
            >
              {message.content}
            </Text>
            {isStreaming && message.status === 'streaming' && (
              <View style={{ marginBottom: 4 }}>
                <StreamingCursor />
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
