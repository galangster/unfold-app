/**
 * NativeHtmlContent — Renders TipTap HTML as native Text/View components.
 *
 * Replaces WebView-based HtmlContentView for read-only note display.
 * Zero white flash since native components render synchronously.
 *
 * Handles TipTap's constrained output:
 *   Block: p, h1-h3, ul, ol, taskList, blockquote
 *   Inline: strong, em, br
 *   Entities: &amp; &lt; &gt; &quot; &nbsp; &#39;
 *
 * Falls back to stripped plain text if parsing fails.
 */

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontFamily } from '@/constants/fonts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NativeHtmlContentProps {
  html: string;
  textColor: string;
  accentColor: string;
  mutedColor: string;
}

interface HtmlColors {
  text: string;
  accent: string;
  muted: string;
}

interface Block {
  tag: string;
  attrs: string;
  inner: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NativeHtmlContent({
  html,
  textColor,
  accentColor,
  mutedColor,
}: NativeHtmlContentProps) {
  const colors: HtmlColors = useMemo(
    () => ({ text: textColor, accent: accentColor, muted: mutedColor }),
    [textColor, accentColor, mutedColor],
  );

  const elements = useMemo(() => {
    try {
      const blocks = extractBlocks(html);
      return blocks.map((block, i) => renderBlock(block, i, colors, 0));
    } catch {
      // Fallback: render as plain stripped text
      return [
        <Text key="fallback" style={[s.paragraph, { color: colors.text }]}>
          {stripTags(html)}
        </Text>,
      ];
    }
  }, [html, colors]);

  return <>{elements}</>;
}

// ---------------------------------------------------------------------------
// Block extraction — iterative tag walker
// ---------------------------------------------------------------------------

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'div']);

function extractBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  let pos = 0;
  const str = html.trim();

  while (pos < str.length) {
    // Skip whitespace
    while (pos < str.length && /\s/.test(str[pos])) pos++;
    if (pos >= str.length) break;

    if (str[pos] !== '<') {
      // Bare text before any tag
      const next = str.indexOf('<', pos);
      const text = next === -1 ? str.slice(pos) : str.slice(pos, next);
      if (text.trim()) blocks.push({ tag: 'text', attrs: '', inner: text.trim() });
      pos = next === -1 ? str.length : next;
      continue;
    }

    // Check for <br> / <br/> / <hr>
    const voidMatch = str.slice(pos).match(/^<(br|hr)\s*\/?>/);
    if (voidMatch) {
      blocks.push({ tag: voidMatch[1], attrs: '', inner: '' });
      pos += voidMatch[0].length;
      continue;
    }

    // Try to match an opening block tag
    const openMatch = str.slice(pos).match(/^<(p|h[1-6]|ul|ol|blockquote|div)(\s[^>]*)?>/)
    if (!openMatch) {
      // Unknown or closing tag — skip to next >
      const nextAngle = str.indexOf('>', pos);
      pos = nextAngle === -1 ? str.length : nextAngle + 1;
      continue;
    }

    const tag = openMatch[1];
    const attrs = (openMatch[2] || '').trim();
    const afterOpen = pos + openMatch[0].length;
    const closeTag = `</${tag}>`;

    // Find balanced close tag (handles nesting of same tag)
    const closePos = findBalancedClose(str, tag, afterOpen);

    if (closePos !== -1) {
      blocks.push({ tag, attrs, inner: str.slice(afterOpen, closePos) });
      pos = closePos + closeTag.length;
    } else {
      // Malformed — skip this tag
      pos = afterOpen;
    }
  }

  return blocks;
}

function findBalancedClose(html: string, tagName: string, startPos: number): number {
  let depth = 1;
  let pos = startPos;
  const closeTag = `</${tagName}>`;
  const openRegex = new RegExp(`<${tagName}[\\s>]`, 'g');

  while (pos < html.length) {
    const nextCloseIdx = html.indexOf(closeTag, pos);
    if (nextCloseIdx === -1) return -1;

    // Count new opens between pos and the close we found
    const segment = html.slice(pos, nextCloseIdx);
    const opens = (segment.match(openRegex) || []).length;
    depth += opens;

    depth--; // for the close tag we found
    if (depth === 0) return nextCloseIdx;

    pos = nextCloseIdx + closeTag.length;
  }

  return -1;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function renderBlock(block: Block, index: number, colors: HtmlColors, depth: number): React.ReactNode {
  const key = `b-${depth}-${index}`;

  switch (block.tag) {
    case 'p': {
      const trimmed = block.inner.trim();
      if (!trimmed || trimmed === '<br>' || trimmed === '<br/>') {
        return <View key={key} style={s.emptyLine} />;
      }
      return (
        <Text key={key} style={[s.paragraph, { color: colors.text }]}>
          {renderInline(trimmed, colors)}
        </Text>
      );
    }

    case 'h1':
      return (
        <Text key={key} style={[s.h1, { color: colors.text }]}>
          {renderInline(block.inner, colors)}
        </Text>
      );

    case 'h2':
      return (
        <Text key={key} style={[s.h2, { color: colors.text }]}>
          {renderInline(block.inner, colors)}
        </Text>
      );

    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return (
        <Text key={key} style={[s.h3, { color: colors.text }]}>
          {renderInline(block.inner, colors)}
        </Text>
      );

    case 'ul':
      if (block.attrs.includes('data-type="taskList"')) {
        return renderTaskList(block.inner, key, colors);
      }
      return renderBulletList(block.inner, key, colors, depth);

    case 'ol':
      return renderOrderedList(block.inner, key, colors, depth);

    case 'blockquote':
      return (
        <View key={key} style={[s.blockquote, { borderLeftColor: colors.accent }]}>
          {renderBlocksFromHtml(block.inner, { ...colors, text: colors.muted }, depth + 1)}
        </View>
      );

    case 'div':
      // Divs appear inside task list items — render children as blocks
      return (
        <View key={key}>
          {renderBlocksFromHtml(block.inner, colors, depth + 1)}
        </View>
      );

    case 'br':
      return <Text key={key}>{'\n'}</Text>;

    case 'text':
      return (
        <Text key={key} style={[s.paragraph, { color: colors.text }]}>
          {decodeEntities(block.inner)}
        </Text>
      );

    default:
      return null;
  }
}

function renderBlocksFromHtml(html: string, colors: HtmlColors, depth: number): React.ReactNode[] {
  const blocks = extractBlocks(html);
  return blocks.map((block, i) => renderBlock(block, i, colors, depth));
}

// ---------------------------------------------------------------------------
// List rendering
// ---------------------------------------------------------------------------

function extractListItems(inner: string): Array<{ attrs: string; content: string }> {
  const items: Array<{ attrs: string; content: string }> = [];
  let pos = 0;

  while (pos < inner.length) {
    // Skip whitespace
    while (pos < inner.length && /\s/.test(inner[pos])) pos++;
    if (pos >= inner.length) break;

    const openMatch = inner.slice(pos).match(/^<li(\s[^>]*)?>/)
    if (!openMatch) {
      pos++;
      continue;
    }

    const attrs = (openMatch[1] || '').trim();
    const afterOpen = pos + openMatch[0].length;

    // Find balanced </li>
    const closePos = findBalancedClose(inner, 'li', afterOpen);

    if (closePos !== -1) {
      items.push({ attrs, content: inner.slice(afterOpen, closePos) });
      pos = closePos + 5; // '</li>'.length
    } else {
      items.push({ attrs, content: inner.slice(afterOpen) });
      break;
    }
  }

  return items;
}

/** Strip a single <p>...</p> wrapper if the content is just one paragraph */
function unwrapP(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p[^>]*>([\s\S]*)<\/p>$/);
  return match ? match[1] : trimmed;
}

/** Check if content has nested lists (for recursive rendering) */
function hasNestedList(content: string): boolean {
  return /<(ul|ol)[\s>]/.test(content);
}

function renderBulletList(inner: string, key: string, colors: HtmlColors, depth: number): React.ReactNode {
  const items = extractListItems(inner);
  return (
    <View key={key} style={s.list}>
      {items.map((item, i) => {
        if (hasNestedList(item.content)) {
          return (
            <View key={`${key}-${i}`}>
              {renderBlocksFromHtml(item.content, colors, depth + 1)}
            </View>
          );
        }
        const content = unwrapP(item.content);
        return (
          <View key={`${key}-${i}`} style={s.bulletItem}>
            <Text style={[s.bullet, { color: colors.accent }]}>{'\u2022'}</Text>
            <Text style={[s.listItemText, { color: colors.text }]}>
              {renderInline(content, colors)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function renderOrderedList(inner: string, key: string, colors: HtmlColors, depth: number): React.ReactNode {
  const items = extractListItems(inner);
  return (
    <View key={key} style={s.list}>
      {items.map((item, i) => {
        if (hasNestedList(item.content)) {
          return (
            <View key={`${key}-${i}`}>
              {renderBlocksFromHtml(item.content, colors, depth + 1)}
            </View>
          );
        }
        const content = unwrapP(item.content);
        return (
          <View key={`${key}-${i}`} style={s.bulletItem}>
            <Text style={[s.orderNum, { color: colors.text }]}>{`${i + 1}.`}</Text>
            <Text style={[s.listItemText, { color: colors.text }]}>
              {renderInline(content, colors)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function renderTaskList(inner: string, key: string, colors: HtmlColors): React.ReactNode {
  const items = extractListItems(inner);
  return (
    <View key={key} style={s.list}>
      {items.map((item, i) => {
        const isChecked = item.attrs.includes('data-checked="true"');
        // Task item structure: <label>...<input>...</label><div><p>text</p></div>
        const divMatch = item.content.match(/<div[^>]*>([\s\S]*)<\/div>/);
        const textContent = divMatch ? unwrapP(divMatch[1]) : unwrapP(item.content);

        return (
          <View key={`${key}-${i}`} style={s.taskItem}>
            <View
              style={[
                s.checkbox,
                {
                  borderColor: isChecked ? colors.accent : colors.muted,
                  backgroundColor: isChecked ? colors.accent + '20' : 'transparent',
                },
              ]}
            >
              {isChecked && (
                <Text style={[s.checkmark, { color: colors.accent }]}>{'\u2713'}</Text>
              )}
            </View>
            <Text
              style={[
                s.listItemText,
                { color: colors.text },
                isChecked && { textDecorationLine: 'line-through' as const, opacity: 0.45 },
              ]}
            >
              {renderInline(textContent, colors)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inline rendering — handles <strong>, <em>, <br>, plain text
// ---------------------------------------------------------------------------

function renderInline(html: string, colors: HtmlColors): React.ReactNode[] {
  if (!html) return [];

  const parts: React.ReactNode[] = [];
  let remaining = html;
  let idx = 0;

  while (remaining.length > 0) {
    const nextTag = remaining.indexOf('<');

    if (nextTag === -1) {
      // No more tags — rest is plain text
      parts.push(decodeEntities(remaining));
      break;
    }

    if (nextTag > 0) {
      // Plain text before the tag
      parts.push(decodeEntities(remaining.slice(0, nextTag)));
      remaining = remaining.slice(nextTag);
    }

    // <strong>...</strong>
    const strongMatch = remaining.match(/^<strong>([\s\S]*?)<\/strong>/);
    if (strongMatch) {
      parts.push(
        <Text key={`s-${idx++}`} style={{ fontFamily: FontFamily.bodyBold }}>
          {renderInline(strongMatch[1], colors)}
        </Text>,
      );
      remaining = remaining.slice(strongMatch[0].length);
      continue;
    }

    // <em>...</em>
    const emMatch = remaining.match(/^<em>([\s\S]*?)<\/em>/);
    if (emMatch) {
      parts.push(
        <Text key={`e-${idx++}`} style={{ fontFamily: FontFamily.bodyItalic }}>
          {renderInline(emMatch[1], colors)}
        </Text>,
      );
      remaining = remaining.slice(emMatch[0].length);
      continue;
    }

    // <br> or <br/>
    const brMatch = remaining.match(/^<br\s*\/?>/);
    if (brMatch) {
      parts.push('\n');
      remaining = remaining.slice(brMatch[0].length);
      continue;
    }

    // <a href="...">text</a> — render text only (no linking in read-only)
    const linkMatch = remaining.match(/^<a[^>]*>([\s\S]*?)<\/a>/);
    if (linkMatch) {
      parts.push(
        <Text key={`a-${idx++}`} style={{ color: colors.accent }}>
          {renderInline(linkMatch[1], colors)}
        </Text>,
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Unknown tag — skip it
    const skipMatch = remaining.match(/^<\/?[a-z][^>]*>/);
    if (skipMatch) {
      remaining = remaining.slice(skipMatch[0].length);
    } else {
      // No closing angle — output rest as text
      parts.push(decodeEntities(remaining));
      break;
    }
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(html: string): string {
  return html
    .replace(/<\/?(p|li|h[1-6]|blockquote|div|ul|ol)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Styles — matched to buildEditorCSS and HtmlContentView template
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  paragraph: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 6,
  },
  h1: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  h2: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  h3: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyLine: {
    height: 14,
  },
  list: {
    marginVertical: 4,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 4,
    marginVertical: 2,
  },
  bullet: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
  },
  orderNum: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
    width: 24,
  },
  listItemText: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
    flex: 1,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingLeft: 4,
    marginVertical: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '700',
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 14,
    marginVertical: 8,
  },
});
