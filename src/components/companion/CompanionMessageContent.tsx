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
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { CompanionOrb } from '@/components/CompanionOrb';
import { FontFamily, FontSize } from '@/constants/fonts';
import { RichMessageText } from './RichMessageText';
import { DevotionalCard } from './DevotionalCard';
import type { CompanionMessage } from '@/lib/companion-chat-store';
import type { DeepLinkData } from '@/lib/parse-deep-links';

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
  isSearching?: boolean;
  onVersePress?: (reference: string) => void;
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Companion Message Entrance
 *
 *   0ms   message container: opacity 0→1 (200ms, ease-out)
 *         streaming cursor starts immediately if streaming
 * ───────────────────────────────────────────────────────── */

const ENTERING = FadeIn.duration(Duration.normal);

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

export function CompanionMessageContent({ message, showIcon, isStreaming, isSearching, onVersePress }: Props) {
  const { colors } = useTheme();

  const isComplete = message.status === 'complete';

  // Build deep link segments for completed messages with deep links
  const deepLinkCards = useMemo(() => {
    if (!message.deepLinks?.length) return null;
    return message.deepLinks;
  }, [message.deepLinks]);

  return (
    <Animated.View entering={ENTERING} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: Spacing['4'] }}>
      {/* Icon column — 28px wide + 12px gap = 40px indent */}
      <View style={{ width: 28, marginRight: Spacing['3'] }}>
        {showIcon && (
          <CompanionOrb accentColor={colors.accent} size={28} animated={false} />
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
          <>
            <RichMessageText
              text={message.content}
              onVersePress={onVersePress}
            />
            {deepLinkCards?.map((dl, i) => (
              <DevotionalCard key={`dl-${i}`} data={dl} />
            ))}
          </>
        ) : (
          // Streaming or pending — lightly stripped text (typing dots handle indicator)
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <StreamingText content={message.content} color={colors.text} />
          </View>
        )}

        {isSearching && (
          <Text style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.xs,
            color: alpha(colors.text, 0.4),
            fontStyle: 'italic',
            marginTop: Spacing['1'],
          }}>
            Looking something up...
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
