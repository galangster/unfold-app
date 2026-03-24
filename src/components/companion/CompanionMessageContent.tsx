/**
 * CompanionMessageContent — full-width, no bubble.
 * Shows companion icon on first message of a group.
 * Renders rich text (verse pills, blockquotes, bold, italic, bullets)
 * for complete messages, lightly-stripped text during streaming.
 *
 * ANIMATION: Fade in on mount (200ms, ease-out).
 */
import { useMemo } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { CompanionOrb } from '@/components/CompanionOrb';
import { FontFamily, FontSize } from '@/constants/fonts';
import { StreamingCursor } from './StreamingCursor';
import { RichMessageText } from './RichMessageText';
import type { CompanionMessage } from '@/lib/companion-chat-store';

/** Lightweight markdown strip for streaming text — removes syntax chars only */
function stripMarkdownLight(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // headers
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/^[-*]\s+/gm, '\u2022 ')  // bullet lists
    .replace(/^\d+\.\s+/gm, '\u2022 ') // numbered lists
    .replace(/^[-*_]{3,}\s*$/gm, '');   // horizontal rules
}

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

/** Memoized streaming text that strips markdown on the fly */
function StreamingText({ content, color }: { content: string; color: string }) {
  const stripped = useMemo(() => stripMarkdownLight(content), [content]);
  return (
    <Text
      style={{
        fontFamily: FontFamily.body,
        fontSize: FontSize.base,
        lineHeight: 27.2,
        color,
      }}
    >
      {stripped}
    </Text>
  );
}

export function CompanionMessageContent({ message, showIcon, isStreaming, onVersePress }: Props) {
  const { colors } = useTheme();

  const isComplete = message.status === 'complete';

  return (
    <Animated.View entering={ENTERING} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: Spacing['4'] }}>
      {/* Icon column — 28px wide + 12px gap = 40px indent */}
      <View style={{ width: 28, marginRight: Spacing['3'] }}>
        {showIcon && (
          <CompanionOrb accentColor={colors.accent} size={28} />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingRight: Spacing['6'] }}>
        {message.status === 'error' ? (
          <View
            style={{
              backgroundColor: alpha(colors.error, 0.10),
              borderRadius: Radius.md,
              padding: Spacing['3'],
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.sm,
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
          // Streaming or pending — lightly stripped text with cursor
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <StreamingText content={message.content} color={colors.text} />
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
