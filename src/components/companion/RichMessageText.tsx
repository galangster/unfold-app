/**
 * RichMessageText — renders companion message text with:
 * - Tappable scripture reference pills ([Romans 5:8] → accent inline text)
 * - Blockquote formatting (lines starting with > or ")
 * - Paragraph breaks
 *
 * Uses nested <Text> with onPress for inline tappable verses
 * (TouchableOpacity can't be nested inside Text in RN).
 */
import { useMemo, useState, useRef, useCallback } from 'react';
import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { parseScriptureReferences, type ScriptureRef } from '@/lib/scripture-parser';

interface Props {
  text: string;
  onVersePress: (reference: string) => void;
}

// ── Segment types ─────────────────────────────────────────────────────────

type TextSegment =
  | { type: 'text'; content: string }
  | { type: 'verse'; reference: string };

// ── Parse text into segments ──────────────────────────────────────────────

function parseSegments(text: string): TextSegment[] {
  // Find scripture references wrapped in brackets: [Romans 5:8]
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

  // Also find bare scripture references (without brackets)
  const bareRefs = parseScriptureReferences(text);

  // Merge, preferring bracket refs (avoid duplicates)
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

  if (allRefs.length === 0) {
    return [{ type: 'text', content: text }];
  }

  const result: TextSegment[] = [];
  let cursor = 0;

  for (const ref of allRefs) {
    if (ref.startIndex > cursor) {
      result.push({ type: 'text', content: text.slice(cursor, ref.startIndex) });
    }
    result.push({ type: 'verse', reference: ref.reference });
    cursor = ref.endIndex;
  }
  if (cursor < text.length) {
    result.push({ type: 'text', content: text.slice(cursor) });
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
        fontSize: 16,
        lineHeight: isBlockquote ? 26 : 27.2,
        color: colors.text,
        fontStyle: isBlockquote ? 'italic' : 'normal',
      }}
    >
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <Text key={i}>{seg.content}</Text>
        ) : (
          <Text
            key={i}
            onPress={() => handleVersePress(i, seg.reference)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${seg.reference}`}
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 14,
              color: colors.accent,
              backgroundColor: colors.accent + (flashIndex === i ? '4D' : '1A'), // 30% flash / 10% rest
              borderRadius: 6,
              paddingHorizontal: 2,
              lineHeight: 22,
            }}
          >
            {' '}{seg.reference}{' '}
          </Text>
        )
      )}
    </Text>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function RichMessageText({ text, onVersePress }: Props) {
  const { colors } = useTheme();

  const blocks = useMemo(() => {
    // Split on double newlines for paragraphs
    const paragraphs = text.split(/\n{2,}/);

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
                borderLeftColor: colors.accent + '66', // 40%
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
