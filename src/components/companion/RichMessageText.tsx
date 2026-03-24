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
import { useMemo, useState, useRef, useCallback } from 'react';
import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { FontFamily, FontSize } from '@/constants/fonts';
import { parseScriptureReferences, type ScriptureRef } from '@/lib/scripture-parser';

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

// ── Strip markdown from a line (headers, horizontal rules) ───────────────

function stripLineMarkdown(line: string): string {
  // Remove header markers: # Header → Header
  let cleaned = line.replace(/^#{1,6}\s+/, '');
  // Remove horizontal rules
  if (/^[-*_]{3,}\s*$/.test(cleaned)) return '';
  return cleaned;
}

// ── Pre-process full text: strip markdown line-level syntax ──────────────

function preprocessMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      // Convert unordered list items: - item or * item → bullet
      if (/^[-*]\s+/.test(trimmed)) {
        return '\u2022 ' + trimmed.replace(/^[-*]\s+/, '');
      }
      // Convert numbered list items: 1. item → bullet (keeps numbering simple)
      if (/^\d+\.\s+/.test(trimmed)) {
        return '\u2022 ' + trimmed.replace(/^\d+\.\s+/, '');
      }
      return stripLineMarkdown(trimmed);
    })
    .filter((line) => line !== '')
    .join('\n');
}

// ── Parse text into segments with bold, italic, and verse refs ───────────

function parseSegments(text: string): TextSegment[] {
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
        fontFamily: isBlockquote ? FontFamily.display : FontFamily.body,
        fontSize: FontSize.base,
        lineHeight: isBlockquote ? 26 : 27.2,
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
                lineHeight: 22,
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

export function RichMessageText({ text, onVersePress }: Props) {
  const { colors } = useTheme();

  const blocks = useMemo(() => {
    // Pre-process markdown: strip headers, convert lists to bullets
    const processed = preprocessMarkdown(text);

    // Split on double newlines for paragraphs
    const paragraphs = processed.split(/\n{2,}/);

    return paragraphs
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Detect blockquotes: starts with > or opening quote
        if (
          trimmed.startsWith('>') ||
          trimmed.startsWith('"') ||
          trimmed.startsWith('\u201C')
        ) {
          const cleanText = trimmed
            .replace(/^>\s*/, '')
            .replace(/^["\u201C]/, '')
            .replace(/["\u201D]$/, '');
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

        if (block.type === 'blockquote') {
          return (
            <View
              key={i}
              style={{
                borderLeftWidth: 2,
                borderLeftColor: alpha(colors.accent, 0.40),
                paddingLeft: 12,
                paddingVertical: 4,
                marginVertical: 4,
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
          <View key={i} style={i > 0 ? { marginTop: 12 } : undefined}>
            <InlineText text={block.content} onVersePress={onVersePress} />
          </View>
        );
      })}
    </View>
  );
}
