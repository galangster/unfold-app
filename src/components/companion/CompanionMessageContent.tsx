/**
 * CompanionMessageContent — full-width, no bubble.
 * Shows companion icon on first message of a group.
 * Renders rich text (verse pills, blockquotes, bold, italic, bullets)
 * for complete messages, lightly-stripped text during streaming.
 *
 * ANIMATION: Fade in on mount (200ms, ease-out).
 */
import { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { CompanionOrb } from '@/components/CompanionOrb';
import { FontFamily, FontSize } from '@/constants/fonts';
import { RichMessageText } from './RichMessageText';
import { DevotionalCard } from './DevotionalCard';
import type { CompanionMessage } from '@/lib/companion-chat-store';
import { smartQuotes } from '@/lib/smart-quotes';

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
  onRetry?: () => void;
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Companion Message Entrance
 *
 *   0ms   message container: opacity 0→1 (200ms, ease-out)
 *         streaming cursor starts immediately if streaming
 * ───────────────────────────────────────────────────────── */

const ENTERING = FadeIn.duration(Duration.normal).easing(Ease.out);

/** Memoized streaming text that strips markdown on the fly */
function StreamingText({ content, color }: { content: string; color: string }) {
  const stripped = useMemo(() => smartQuotes(stripMarkdownLight(content)), [content]);
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

export function CompanionMessageContent({ message, showIcon, isStreaming, isSearching, onVersePress, onRetry }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const isComplete = message.status === 'complete';

  // Build deep link segments for completed messages with deep links
  const deepLinkCards = useMemo(() => {
    if (!message.deepLinks?.length) return null;
    return message.deepLinks;
  }, [message.deepLinks]);

  return (
    <Animated.View entering={reducedMotion ? undefined : ENTERING} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: Spacing['4'] }}>
      {/* Icon column — 28px wide + 12px gap = 40px indent */}
      <View style={{ width: 28, marginRight: Spacing['3'] }}>
        {showIcon && (
          <CompanionOrb accentColor={colors.accent} size={28} animated={false} />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingRight: Spacing['6'] }}>
        {message.status === 'error' ? (
          onRetry ? (
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry sending your message"
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
                {message.content || 'Something went wrong. Tap to retry.'}
              </Text>
            </Pressable>
          ) : (
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
          )
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
          // Streaming or pending — lightly stripped text (typing dots handle indicator).
          // A single Text in a flex-row won't wrap and clips off-screen at large font
          // scales (FEEL-04); flexShrink lets it wrap within the content column.
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <View style={{ flexShrink: 1 }}>
              <StreamingText content={message.content} color={colors.text} />
            </View>
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
