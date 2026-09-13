/**
 * CompanionMessageContent — incoming Companion bubble.
 * The latest reply owns one stable presence slot below its text.
 * Renders rich text (verse pills, blockquotes, bold, italic, bullets)
 * for complete messages, lightly-stripped text during streaming.
 *
 * ANIMATION: Fade in on mount (200ms, ease-out).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import Animated, { FadeIn, LinearTransition, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { CompanionOrb, type CompanionExpression } from '@/components/CompanionOrb';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Typography } from '@/constants/typography';
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
    .replace(/^(\d+)\.\s+/gm, '$1. ')  // numbered lists, preserve ordering
    .replace(/^[-*_]{3,}\s*$/gm, '');   // horizontal rules
}

interface Props {
  message: CompanionMessage;
  showIcon: boolean;
  isStreaming: boolean;
  companionExpression?: CompanionExpression;
  active?: boolean;
  reduceMotion?: boolean;
  onVersePress?: (reference: string) => void;
  onRetry?: () => void;
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Companion Message Entrance
 *
 *   0ms   message container: opacity 0→1 (200ms, ease-out)
 *         first response text fades in once, without delaying its layout
 * ───────────────────────────────────────────────────────── */

const ENTERING = FadeIn.duration(Duration.normal).easing(Ease.out);
const TEXT_ENTERING = FadeIn.duration(Duration.fast).easing(Ease.out);
const SURFACE_GROWTH = LinearTransition.duration(180).easing(Ease.out).reduceMotion(ReduceMotion.Never);

// Row inset plus bubble padding aligns actions and suggestions with reply text.
const BUBBLE_HORIZONTAL_PADDING = Spacing['4'] + Spacing['0.5'];
export const COMPANION_TEXT_INDENT = Spacing['4'] + BUBBLE_HORIZONTAL_PADDING;

/**
 * Streaming text leaf: strips markdown while rendering the actual text
 * received from the live request. It does not add a cursor or reveal queue.
 */
function StreamingText({ content, color }: { content: string; color: string }) {
  const stripped = useMemo(() => smartQuotes(stripMarkdownLight(content)), [content]);
  return (
    <Text
      style={{
        ...Typography.bodyRelaxed,
        color,
      }}
    >
      {stripped}
    </Text>
  );
}

export function CompanionMessageContent({
  message,
  showIcon,
  isStreaming,
  companionExpression,
  active = true,
  reduceMotion,
  onVersePress,
  onRetry,
}: Props) {
  const { colors } = useTheme();
  const initialReducedMotion = useReducedMotion();
  const reducedMotion = reduceMotion ?? initialReducedMotion;
  const [thinkingMounted, setThinkingMounted] = useState(!isStreaming);

  const isComplete = message.status === 'complete';
  const hasMessageBody = message.status === 'error' || message.content.length > 0;

  // A newly mounted pending row starts as the reunited Companion. The next
  // commit supplies `thinking`, so the same avatar instance morphs into the
  // three live spheres without delaying the request.
  useEffect(() => {
    if (isStreaming && !thinkingMounted) setThinkingMounted(true);
  }, [isStreaming, thinkingMounted]);

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

  // Error rows: an interrupted reply keeps its partial text in `content`
  // (rendered below as normal reply text, with a short error line beneath);
  // every other error row stores the error string itself in `content`.
  const interruptedReply = message.status === 'error' && message.interrupted ? message.content : '';
  const errorText = interruptedReply
    ? `Something interrupted this reply. ${onRetry ? 'Tap to retry.' : 'Try again?'}`
    : message.content || (onRetry ? 'Something went wrong. Tap to retry.' : 'Something went wrong. Try again?');
  const errorBoxStyle: ViewStyle = {
    backgroundColor: alpha(colors.error, 0.10),
    borderRadius: Radius.md,
    padding: Spacing['3'],
    marginTop: interruptedReply ? Spacing['3'] : undefined,
  };
  const errorTextStyle: TextStyle = {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: colors.error,
    lineHeight: 20,
  };

  return (
    <Animated.View
      entering={reducedMotion ? undefined : ENTERING}
      style={{ alignItems: 'flex-start', paddingHorizontal: Spacing['4'] }}
    >
      <View
        testID="companion-message-bubble"
        style={{
            maxWidth: '88%',
            paddingHorizontal: BUBBLE_HORIZONTAL_PADDING,
            paddingVertical: Spacing['3'],
        }}
      >
        {/* Animate only the empty surface. Text keeps its natural size and layout. */}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          layout={showIcon && active && !reducedMotion ? SURFACE_GROWTH : undefined}
          style={[StyleSheet.absoluteFill, {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: Radius.xl,
            borderBottomLeftRadius: Radius.sm,
            borderCurve: 'continuous',
          }]}
        />
        {hasMessageBody && (
        <Animated.View
          key="message-body"
          entering={reducedMotion ? undefined : TEXT_ENTERING}
          style={{ minWidth: 0, flexShrink: 1 }}
        >
        {message.status === 'error' ? (
          <>
            {interruptedReply.length > 0 && (
              <RichMessageText
                text={interruptedReply}
                onVersePress={onVersePress ?? noopVersePress}
              />
            )}
            {onRetry ? (
              <Pressable
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry sending your message"
                style={errorBoxStyle}
              >
                <Text style={errorTextStyle}>{errorText}</Text>
              </Pressable>
            ) : (
              <View style={errorBoxStyle}>
                <Text style={errorTextStyle}>{errorText}</Text>
              </View>
            )}
          </>
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
        </Animated.View>
        )}

        {showIcon && (
          <View
            key="presence"
            testID="companion-presence-slot"
            style={{
              width: 48,
              height: 48,
              marginTop: hasMessageBody ? Spacing['2'] : 0,
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
            }}
            accessible={isStreaming}
            accessibilityLabel={isStreaming ? 'Companion is replying' : undefined}
            accessibilityLiveRegion="polite"
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <CompanionOrb
              accentColor={colors.accent}
              size={48}
              expression={companionExpression}
              thinking={isStreaming && thinkingMounted}
              active={active}
            />
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
