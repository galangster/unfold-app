/**
 * RichMessageText — renders companion message text with:
 * - Tappable scripture reference pills ([Romans 5:8] → accent inline text)
 * - Blockquote formatting (lines starting with > or ")
 * - Markdown rendering: headers, **bold**, *italic*, bullet lists
 * - Paragraph breaks
 *
 * Uses nested <Text> with onPress for inline tappable verses
 * (TouchableOpacity can't be nested inside Text in RN).
 */
import { memo, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { parseScriptureReferences, type ScriptureRef } from '@/lib/scripture-parser';
import { smartQuotes } from '@/lib/smart-quotes';

interface Props {
  text: string;
  onVersePress: (reference: string) => void;
}

// ── Segment types ─────────────────────────────────────────────────────────

type TextSegment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'verse'; reference: string };

// ── Pre-process full text: strip markdown line-level syntax ──────────────

export function preprocessMarkdown(text: string): string {
  // Process line by line, building paragraphs. Headers and blank lines create paragraph breaks.
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let currentLines: string[] = [];

  const isListLine = (line: string) => /^(• |\d+\. )/.test(line);

  const flushCurrent = () => {
    if (currentLines.length > 0) {
      // Prose lines reflow into one line; list items keep their own line so
      // consecutive bullets don't collapse into a single run-on sentence.
      const joined = currentLines
        .map((line, i) => (i === 0 ? line : isListLine(line) ? `\n${line}` : ` ${line}`))
        .join('');
      paragraphs.push(joined);
      currentLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank line = paragraph break
    if (!trimmed) {
      flushCurrent();
      continue;
    }

    // Markdown headers (# Header) become their own paragraph block
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushCurrent();
      const headerText = trimmed.replace(/^#{1,6}\s+/, '');
      paragraphs.push(`__HEADER__${headerText}__HEADER__`);
      continue;
    }

    // Bold-only lines (**Header Text**) also become headers
    if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      flushCurrent();
      const headerText = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '');
      paragraphs.push(`__HEADER__${headerText}__HEADER__`);
      continue;
    }

    // Lines starting with bold (**Header:** body text) — split into header + body
    const boldStartMatch = trimmed.match(/^\*\*([^*]+)\*\*\s*(.+)/);
    if (boldStartMatch) {
      flushCurrent();
      paragraphs.push(`__HEADER__${boldStartMatch[1]}__HEADER__`);
      currentLines.push(boldStartMatch[2]);
      continue;
    }

    // Horizontal rules
    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      flushCurrent();
      continue;
    }

    // Bullet lists: - item or * item
    if (/^[-*]\s+/.test(trimmed)) {
      currentLines.push('\u2022 ' + trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    // Numbered lists: 1. item -- preserve the ordinal marker instead of flattening to a bullet
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      currentLines.push(`${numberedMatch[1]}. ${numberedMatch[2]}`);
      continue;
    }

    // Regular text line — accumulate into current paragraph
    currentLines.push(trimmed);
  }

  flushCurrent();
  return paragraphs.join('\n\n');
}

// ── Parse text into segments with bold, italic, and verse refs ───────────

export function parseSegments(text: string): TextSegment[] {
  // First, find scripture references (bracket and bare)
  const bracketRefs: ScriptureRef[] = [];
  const bracketRegex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = bracketRegex.exec(text)) !== null) {
    const inner = match[1];
    const parsed = parseScriptureReferences(inner);
    if (parsed.length > 0) {
      bracketRefs.push({
        reference: inner,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  const bareRefs = parseScriptureReferences(text);

  const allRefs = [...bracketRefs];
  for (const bare of bareRefs) {
    const overlaps = bracketRefs.some(
      (br) => bare.startIndex >= br.startIndex && bare.endIndex <= br.endIndex
    );
    if (!overlaps) {
      allRefs.push(bare);
    }
  }

  allRefs.sort((a, b) => a.startIndex - b.startIndex);

  // AI responses routinely bold or italicize verse references (**Psalm 46:10**).
  // The refs are cut out before inline markdown runs, so a marker pair that
  // directly wraps a reference would be split across two chunks and render as
  // literal asterisks. The pill already carries the emphasis — swallow the
  // wrapping markers into the reference bounds instead.
  for (const ref of allRefs) {
    for (const marker of ['**', '*']) {
      if (
        ref.startIndex >= marker.length &&
        text.slice(ref.startIndex - marker.length, ref.startIndex) === marker &&
        text.startsWith(marker, ref.endIndex)
      ) {
        ref.startIndex -= marker.length;
        ref.endIndex += marker.length;
      }
    }
  }

  // Split text around verse refs first, then parse inline markdown in each text chunk
  const chunks: TextSegment[] = [];
  let cursor = 0;

  for (const ref of allRefs) {
    if (ref.startIndex > cursor) {
      chunks.push(...parseInlineMarkdown(text.slice(cursor, ref.startIndex)));
    }
    chunks.push({ type: 'verse', reference: ref.reference });
    cursor = ref.endIndex;
  }
  if (cursor < text.length) {
    chunks.push(...parseInlineMarkdown(text.slice(cursor)));
  }

  if (chunks.length === 0) {
    return parseInlineMarkdown(text);
  }

  return chunks;
}

// ── Parse inline bold/italic markdown within a text chunk ────────────────

function parseInlineMarkdown(text: string): TextSegment[] {
  // Match **bold** and *italic* (bold first since ** contains *)
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  const result: TextSegment[] = [];
  let cursor = 0;
  let inlineMatch: RegExpExecArray | null;

  while ((inlineMatch = regex.exec(text)) !== null) {
    if (inlineMatch.index > cursor) {
      result.push({ type: 'text', content: text.slice(cursor, inlineMatch.index) });
    }
    if (inlineMatch[1] != null) {
      // **bold**
      result.push({ type: 'bold', content: inlineMatch[1] });
    } else if (inlineMatch[2] != null) {
      // *italic*
      result.push({ type: 'italic', content: inlineMatch[2] });
    }
    cursor = inlineMatch.index + inlineMatch[0].length;
  }

  if (cursor < text.length) {
    result.push({ type: 'text', content: text.slice(cursor) });
  }
  if (result.length === 0) {
    return [{ type: 'text', content: text }];
  }
  return result;
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Verse Citation Tap
 *
 *   0ms   haptic Light + pill background flash 10%→30%
 * 300ms   pill background returns to 10%
 * ───────────────────────────────────────────────────────── */

// ── Inline text renderer with verse taps ──────────────────────────────────

function InlineText({
  text,
  onVersePress,
  isBlockquote,
}: {
  text: string;
  onVersePress: (ref: string) => void;
  isBlockquote?: boolean;
}) {
  const { colors } = useTheme();
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersePress = useCallback((index: number, reference: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlashIndex(index);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashIndex(null), 300);
    onVersePress(reference);
  }, [onVersePress]);

  const segments = useMemo(() => parseSegments(text), [text]);

  return (
    <Text
      style={{
        ...Typography.bodyRelaxed,
        fontFamily: isBlockquote ? FontFamily.bodyItalic : FontFamily.body,
        color: colors.text,
        fontStyle: isBlockquote ? 'italic' : 'normal',
      }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'verse') {
          return (
            <Text
              key={i}
              onPress={() => handleVersePress(i, seg.reference)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${seg.reference}`}
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.sm,
                color: colors.accent,
                backgroundColor: alpha(colors.accent, flashIndex === i ? 0.30 : 0.10),
                borderRadius: 6,
                paddingHorizontal: 2,
              }}
            >
              {' '}{seg.reference}{' '}
            </Text>
          );
        }
        if (seg.type === 'bold') {
          return (
            <Text
              key={i}
              style={{ fontFamily: FontFamily.bodyBold ?? FontFamily.uiSemiBold }}
            >
              {seg.content}
            </Text>
          );
        }
        if (seg.type === 'italic') {
          return (
            <Text
              key={i}
              style={{ fontStyle: 'italic' }}
            >
              {seg.content}
            </Text>
          );
        }
        return <Text key={i}>{seg.content}</Text>;
      })}
    </Text>
  );
}

// ── Main component ────────────────────────────────────────────────────────

// Memoized: during streaming the stable-paragraph prefix re-renders with an
// unchanged `text` on every token (WR-18) — skip the parse + block rebuild.
export const RichMessageText = memo(function RichMessageText({ text, onVersePress }: Props) {
  const { colors } = useTheme();

  const blocks = useMemo(() => {
    // Typographic quotes, then markdown pre-process (headers, lists -> bullets)
    const processed = preprocessMarkdown(smartQuotes(text));

    // Split on double newlines for paragraphs
    const paragraphs = processed.split(/\n{2,}/);

    return paragraphs
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Detect headers (from preprocessMarkdown markers)
        const headerMatch = trimmed.match(/^__HEADER__(.+?)__HEADER__$/);
        if (headerMatch) {
          return { type: 'header' as const, content: headerMatch[1] };
        }

        // Detect blockquotes: only markdown > prefix (not opening quotes —
        // those are too greedy when AI mixes scripture with commentary)
        if (trimmed.startsWith('>')) {
          const cleanText = trimmed.replace(/^>\s*/, '');
          return { type: 'blockquote' as const, content: cleanText };
        }

        return { type: 'paragraph' as const, content: trimmed };
      })
      .filter(Boolean);
  }, [text]);

  return (
    <View>
      {blocks.map((block, i) => {
        if (!block) return null;

        if (block.type === 'header') {
          return (
            <View key={i} style={{ marginTop: i > 0 ? Spacing['5'] : 0, marginBottom: Spacing['2'] }}>
              <Text style={{
                fontFamily: FontFamily.bodyBold ?? FontFamily.uiSemiBold,
                fontSize: FontSize.lg,
                lineHeight: 24,
                color: colors.text,
              }}>
                {block.content}
              </Text>
            </View>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <View
              key={i}
              style={{
                paddingHorizontal: Spacing['3'],
                paddingVertical: Spacing['2'],
                marginVertical: 4,
                borderRadius: Radius.sm,
                backgroundColor: alpha(colors.accent, 0.05),
                borderTopWidth: StyleSheet.hairlineWidth,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderTopColor: alpha(colors.accent, 0.24),
                borderBottomColor: alpha(colors.accent, 0.14),
              }}
            >
              <InlineText
                text={block.content}
                onVersePress={onVersePress}
                isBlockquote
              />
            </View>
          );
        }

        return (
          <View key={i} style={i > 0 ? { marginTop: Spacing['3'] } : undefined}>
            <InlineText text={block.content} onVersePress={onVersePress} />
          </View>
        );
      })}
    </View>
  );
});
