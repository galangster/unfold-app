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
  layoutFontScale?: number;
}

// ── Segment types ─────────────────────────────────────────────────────────

type InlineSegment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string };

type TextSegment = InlineSegment | { type: 'verse'; reference: string };

/**
 * U+202F NARROW NO-BREAK SPACE — the glue on each side of a verse pill's
 * reference. Non-breaking, so punctuation after the pill never wraps away
 * from it; narrower than a word space, so the pill does not read as double
 * spaced next to the surrounding text's own spaces.
 */
export const VERSE_PILL_PAD = '\u202F';

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

/**
 * Markdown first, then verse pills. Cutting refs first splits a pair like
 * `**Read Acts 5:27-32 aloud together.**` into `**Read ` + pill + ` aloud…**`,
 * so the leftover asterisks render literally. Parsing emphasis first keeps
 * the span intact; pills are restored inside each text/bold/italic run.
 */
export function parseSegments(text: string): TextSegment[] {
  return parseInlineMarkdown(text).flatMap(splitVersesInSegment);
}

function extractVerseRefs(text: string): ScriptureRef[] {
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

  const allRefs = [...bracketRefs];
  for (const bare of parseScriptureReferences(text)) {
    const overlaps = bracketRefs.some(
      (br) => bare.startIndex >= br.startIndex && bare.endIndex <= br.endIndex
    );
    if (!overlaps) {
      allRefs.push(bare);
    }
  }

  allRefs.sort((a, b) => a.startIndex - b.startIndex);
  return allRefs;
}

function splitVersesInSegment(seg: InlineSegment): TextSegment[] {
  const refs = extractVerseRefs(seg.content);
  if (refs.length === 0) return [seg];

  const chunks: TextSegment[] = [];
  let cursor = 0;

  for (const ref of refs) {
    if (ref.startIndex > cursor) {
      chunks.push({ type: seg.type, content: seg.content.slice(cursor, ref.startIndex) });
    }
    chunks.push({ type: 'verse', reference: ref.reference });
    cursor = ref.endIndex;
  }
  if (cursor < seg.content.length) {
    chunks.push({ type: seg.type, content: seg.content.slice(cursor) });
  }
  return chunks;
}

// ── Parse inline bold/italic markdown within a text chunk ────────────────

function parseInlineMarkdown(text: string): InlineSegment[] {
  // Match **bold** and *italic* (bold first since ** contains *)
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  const result: InlineSegment[] = [];
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
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersePress = useCallback((key: string, reference: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlashKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 300);
    onVersePress(reference);
  }, [onVersePress]);

  const lines = useMemo(() => text.split('\n'), [text]);

  // Numbered/bullet items stay one paragraph in preprocessMarkdown but each
  // line must be its own Text. iOS nested Text with a smaller tinted pill
  // routinely drops the last wrapped line of a long run (Jordan item 4).
  return (
    <>
      {lines.map((line, lineIndex) => (
        <MessageLine
          key={lineIndex}
          text={line}
          lineIndex={lineIndex}
          onVersePress={handleVersePress}
          flashKey={flashKey}
          isBlockquote={isBlockquote}
          colors={colors}
        />
      ))}
    </>
  );
}

function MessageLine({
  text,
  lineIndex,
  onVersePress,
  flashKey,
  isBlockquote,
  colors,
}: {
  text: string;
  lineIndex: number;
  onVersePress: (key: string, reference: string) => void;
  flashKey: string | null;
  isBlockquote?: boolean;
  colors: { text: string; accent: string };
}) {
  const segments = useMemo(() => parseSegments(text), [text]);

  return (
    <Text
      style={{
        ...Typography.bodyRelaxed,
        fontFamily: isBlockquote ? FontFamily.bodyMedium : FontFamily.body,
        color: colors.text,
        fontStyle: 'normal',
      }}
    >
      {segments.map((seg, i) => {
        const key = `${lineIndex}-${i}`;
        if (seg.type === 'verse') {
          // The pill's breathing room is a narrow no-break space on each side
          // of the reference, not ordinary spaces: ordinary spaces doubled the
          // gap before the pill and gave following punctuation a break
          // opportunity, so it floated ("1 Kings 19:11-12 ?") or wrapped onto
          // its own line. Nested Text ignores padding on iOS/Android, so the
          // glue characters are what keeps the tinted background from hugging
          // the glyphs there; the small web-only padding rounds it out.
          return (
            <Text
              key={key}
              onPress={() => onVersePress(key, seg.reference)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${seg.reference}`}
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.sm,
                lineHeight: FontSize.sm * 1.8,
                color: colors.accent,
                backgroundColor: alpha(colors.accent, flashKey === key ? 0.30 : 0.10),
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 4,
              }}
            >
              {VERSE_PILL_PAD}{seg.reference}{VERSE_PILL_PAD}
            </Text>
          );
        }
        if (seg.type === 'bold') {
          return (
            <Text
              key={key}
              style={{ fontFamily: FontFamily.bodyBold ?? FontFamily.uiSemiBold }}
            >
              {seg.content}
            </Text>
          );
        }
        if (seg.type === 'italic') {
          return (
            <Text
              key={key}
              style={{ fontFamily: FontFamily.bodyMedium, fontStyle: 'normal' }}
            >
              {seg.content}
            </Text>
          );
        }
        return <Text key={key}>{seg.content}</Text>;
      })}
    </Text>
  );
}

// ── Main component ────────────────────────────────────────────────────────

// Memoized: during streaming the stable-paragraph prefix re-renders with an
// unchanged `text` on every token (WR-18) — skip the parse + block rebuild.
export const RichMessageText = memo(function RichMessageText({ text, onVersePress, layoutFontScale = 1 }: Props) {
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
    <View key={`font-scale-${layoutFontScale}`}>
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
