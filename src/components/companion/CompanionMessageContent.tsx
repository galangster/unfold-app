/**
 * CompanionMessageContent — full-width, no bubble.
 * Shows companion icon on first message of a group.
 * Renders rich text (verse pills, blockquotes, bold, italic, bullets)
 * for complete messages, lightly-stripped text during streaming.
 *
 * ANIMATION: Fade in on mount (200ms, ease-out).
 */
import { useMemo, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { useSmoothTextReveal } from '@/lib/use-smooth-text-reveal';
import { StreamingCursor } from './StreamingCursor';
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
import { splitStreamingParagraphs } from '@/lib/streaming-paragraphs';

/** Verse taps land before a message completes; opening the sheet is fine
 * mid-stream, but the handler is optional in props — fall back to a no-op. */
const noopVersePress = () => {};

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

/**
 * Streaming text leaf: strips markdown on the fly and reveals it word by word
 * (useSmoothTextReveal) instead of popping whole chunks every 32ms. Width
 * reservation trick (TypewriterText precedent): the not-yet-revealed suffix
 * renders transparently so the paragraph lays out at its full size and words
 * never reflow mid-line as they appear. The StreamingCursor sits inline at
 * the tail of the revealed prefix.
 */
function StreamingText({ content, color }: { content: string; color: string }) {
  const stripped = useMemo(() => smartQuotes(stripMarkdownLight(content)), [content]);
  const revealed = useSmoothTextReveal(stripped);
  const hidden = stripped.slice(revealed.length);
  return (
    <Text
      style={{
        fontFamily: FontFamily.body,
        fontSize: FontSize.base,
        lineHeight: 27.2,
        color,
      }}
    >
      {revealed}
      <StreamingCursor />
      {hidden.length > 0 && <Text style={{ color: 'transparent' }}>{hidden}</Text>}
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

  // WR-18: completed paragraphs render through the real block renderer while
  // streaming, so the end-of-stream swap only reflows the trailing partial
  // paragraph instead of the whole message. `stable` only changes when a new
  // paragraph boundary arrives, so RichMessageText's parse memo stays warm
  // between boundaries.
  const { stable: stableStreamText, tail: streamTail } = useMemo(
    () => splitStreamingParagraphs(message.content),
    [message.content],
  );

  // WR-18 soften: when THIS mount streamed the message, keep rendering the
  // completed text through the same stable/tail split so the end-of-stream
  // swap reuses the warm stable block list and only the trailing paragraph
  // reflows. History mounts (never streamed here) render in one block.
  const wasStreamingRef = useRef(isStreaming);
  if (isStreaming) wasStreamingRef.current = true;

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
            {wasStreamingRef.current ? (
              <>
                {stableStreamText.length > 0 && (
                  <RichMessageText
                    text={stableStreamText}
                    onVersePress={onVersePress}
                  />
                )}
                {streamTail.length > 0 && (
                  <View style={stableStreamText.length > 0 ? { marginTop: Spacing['3'] } : undefined}>
                    <RichMessageText
                      text={streamTail}
                      onVersePress={onVersePress}
                    />
                  </View>
                )}
              </>
            ) : (
              <RichMessageText
                text={message.content}
                onVersePress={onVersePress}
              />
            )}
            {deepLinkCards?.map((dl, i) => (
              <DevotionalCard key={`dl-${i}`} data={dl} />
            ))}
          </>
        ) : (
          // Streaming or pending — completed paragraphs go through the block
          // renderer (WR-18); only the trailing partial paragraph renders as
          // lightly-stripped plain text.
          <>
            {stableStreamText.length > 0 && (
              <RichMessageText
                text={stableStreamText}
                onVersePress={onVersePress ?? noopVersePress}
              />
            )}
            {(streamTail.length > 0 || stableStreamText.length === 0) && (
              // A single Text in a flex-row won't wrap and clips off-screen at
              // large font scales (FEEL-04); flexShrink lets it wrap within
              // the content column. marginTop matches the block renderer's
              // paragraph spacing so the tail sits like the next block.
              <View
                style={[
                  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
                  stableStreamText.length > 0 && { marginTop: Spacing['3'] },
                ]}
              >
                <View style={{ flexShrink: 1 }}>
                  <StreamingText content={streamTail} color={colors.text} />
                </View>
              </View>
            )}
          </>
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
