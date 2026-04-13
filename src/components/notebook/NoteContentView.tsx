/**
 * NoteContentView — Native HTML renderer for Notebook notes in READ mode.
 *
 * The Notebook content field stores HTML produced by @10play/tentap-editor
 * (TipTap in a RN WebView). Historically, viewing a note mounted the same
 * WebView the editor uses — which meant every note view paid the cost of:
 *   - useEditorBridge init with unstable object identity
 *   - WebView boot + CSS injection race
 *   - Fire-and-forget injectJS CSS/content paint order
 *
 * This component renders the bounded set of HTML tags emitted by tentap
 * directly to React Native primitives, so viewing a note requires no
 * WebView at all. The editor is still used for EDITING; we mount it only
 * when the user taps into edit mode.
 *
 * Supported tags match buildEditorCSS in note-detail.tsx:
 *   - Block:   p, h1, h2, h3, ul, ol, li, blockquote, hr
 *   - Task:    ul[data-type=taskList] / li[data-type=taskItem][data-checked]
 *   - Inline:  strong, em, s, u, a, code, br, span
 *
 * Scripture callouts (multi-paragraph blockquotes) are detected by paragraph
 * count and the last paragraph is styled as the reference cap.
 *
 * See ~/vault/standards/webview-editors-native-read-mode.md
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { View, Text, StyleSheet, Linking, TextStyle } from 'react-native';
import { CheckIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { logger } from '@/lib/logger';
import {
  parseHtml,
  htmlHasContent,
  isElement,
  type HtmlNode,
  type ElementNode,
} from './note-content-parser';

// Re-export so callers can import from this module.
export { parseHtml, htmlHasContent } from './note-content-parser';

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface RenderContext {
  colors: ReturnType<typeof useTheme>['colors'];
}

function inlineStyleFor(tag: string, ctx: RenderContext): TextStyle {
  switch (tag) {
    case 'strong':
      return { fontFamily: FontFamily.bodyBold, fontWeight: '700' };
    case 'em':
      return { fontFamily: FontFamily.bodyItalic, fontStyle: 'italic' };
    case 's':
      return { textDecorationLine: 'line-through' };
    case 'u':
      return { textDecorationLine: 'underline' };
    case 'a':
      return { color: ctx.colors.accent, textDecorationLine: 'underline' };
    case 'code':
      return { fontFamily: FontFamily.mono };
    default:
      return {};
  }
}

function renderInline(nodes: HtmlNode[], ctx: RenderContext, keyPrefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-i${i}`;
    if (n.type === 'text') return <Text key={key}>{n.value}</Text>;
    if (n.tag === 'br') return <Text key={key}>{'\n'}</Text>;
    if (n.tag === 'a') {
      const href = n.attrs.href ?? '';
      return (
        <Text
          key={key}
          style={inlineStyleFor('a', ctx)}
          onPress={() => {
            if (!href) return;
            Linking.openURL(href).catch((err) =>
              logger.warn('[NoteContentView] link open failed', err),
            );
          }}
        >
          {renderInline(n.children, ctx, key)}
        </Text>
      );
    }
    return (
      <Text key={key} style={inlineStyleFor(n.tag, ctx)}>
        {renderInline(n.children, ctx, key)}
      </Text>
    );
  });
}

function renderListItem(
  li: ElementNode,
  ctx: RenderContext,
  key: string,
  isTaskList: boolean,
  index: number,
  isOrdered: boolean,
): ReactNode {
  if (isTaskList) {
    const isChecked = li.attrs['data-checked'] === 'true';
    return (
      <View key={key} style={styles.taskItem}>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: ctx.colors.accent,
              backgroundColor: isChecked ? ctx.colors.accent : 'transparent',
            },
          ]}
        >
          {isChecked && <CheckIcon size={12} color={ctx.colors.background} weight="bold" />}
        </View>
        <View style={styles.taskItemBody}>
          {renderBlockChildren(li.children, ctx, key, isChecked)}
        </View>
      </View>
    );
  }

  const bulletChar = isOrdered ? `${index + 1}.` : '•';
  return (
    <View key={key} style={styles.listItem}>
      <Text style={[styles.bullet, { color: ctx.colors.text }]}>{bulletChar}</Text>
      <View style={styles.listItemBody}>
        {renderBlockChildren(li.children, ctx, key, false)}
      </View>
    </View>
  );
}

/**
 * Render children of a list item or similar wrapper. Each child becomes
 * its own block, and checked task items receive the line-through style.
 */
function renderBlockChildren(
  children: HtmlNode[],
  ctx: RenderContext,
  keyPrefix: string,
  isCheckedTaskItem: boolean,
): ReactNode[] {
  return children.map((c, i) => {
    const key = `${keyPrefix}-c${i}`;
    if (c.type === 'text') {
      return (
        <Text
          key={key}
          style={[
            styles.paragraph,
            { color: ctx.colors.text },
            isCheckedTaskItem && styles.checkedText,
          ]}
        >
          {c.value}
        </Text>
      );
    }
    if (c.tag === 'p') {
      return (
        <Text
          key={key}
          style={[
            styles.paragraph,
            { color: ctx.colors.text },
            isCheckedTaskItem && styles.checkedText,
          ]}
        >
          {renderInline(c.children, ctx, key)}
        </Text>
      );
    }
    return renderBlock(c, ctx, key);
  });
}

function renderBlockquote(node: ElementNode, ctx: RenderContext, key: string): ReactNode {
  const paragraphs = node.children.filter(isElement).filter((el) => el.tag === 'p');
  // Multi-paragraph blockquote = scripture callout (verse + reference).
  // Single-paragraph blockquote = generic quote (italic body).
  const isScriptureCallout = paragraphs.length >= 2;

  // Fallback: if a blockquote contains text or non-p blocks, render them raw.
  if (paragraphs.length === 0) {
    return (
      <View
        key={key}
        style={[
          styles.blockquote,
          { borderLeftColor: ctx.colors.accent, backgroundColor: ctx.colors.backgroundElevated },
        ]}
      >
        <Text style={[styles.blockquoteVerse, { color: ctx.colors.text }]}>
          {renderInline(node.children, ctx, key)}
        </Text>
      </View>
    );
  }

  return (
    <View
      key={key}
      style={[
        styles.blockquote,
        { borderLeftColor: ctx.colors.accent, backgroundColor: ctx.colors.backgroundElevated },
      ]}
    >
      {paragraphs.map((p, i) => {
        const isRefLine = isScriptureCallout && i === paragraphs.length - 1;
        return (
          <Text
            key={`${key}-p${i}`}
            style={[
              isRefLine ? styles.blockquoteRef : styles.blockquoteVerse,
              { color: ctx.colors.text },
              i > 0 ? { marginTop: 10 } : null,
            ]}
          >
            {renderInline(p.children, ctx, `${key}-p${i}`)}
          </Text>
        );
      })}
    </View>
  );
}

function renderBlock(node: HtmlNode, ctx: RenderContext, key: string): ReactNode {
  if (node.type === 'text') {
    const trimmed = node.value.trim();
    if (trimmed.length === 0) return null;
    return (
      <Text key={key} style={[styles.paragraph, { color: ctx.colors.text }]}>
        {node.value}
      </Text>
    );
  }

  switch (node.tag) {
    case 'p':
      // Empty paragraph renders a 4px gap so vertical rhythm survives round-trip.
      if (node.children.length === 0) {
        return <View key={key} style={styles.emptyParagraph} />;
      }
      return (
        <Text key={key} style={[styles.paragraph, { color: ctx.colors.text }]}>
          {renderInline(node.children, ctx, key)}
        </Text>
      );
    case 'h1':
      return (
        <Text key={key} style={[styles.h1, { color: ctx.colors.text }]}>
          {renderInline(node.children, ctx, key)}
        </Text>
      );
    case 'h2':
      return (
        <Text key={key} style={[styles.h2, { color: ctx.colors.text }]}>
          {renderInline(node.children, ctx, key)}
        </Text>
      );
    case 'h3':
      return (
        <Text key={key} style={[styles.h3, { color: ctx.colors.text }]}>
          {renderInline(node.children, ctx, key)}
        </Text>
      );
    case 'ul':
    case 'ol': {
      const dataType = (node.attrs['data-type'] ?? '').toLowerCase();
      const isTaskList = dataType === 'tasklist';
      const isOrdered = node.tag === 'ol';
      return (
        <View key={key} style={styles.list}>
          {node.children
            .filter(isElement)
            .filter((el) => el.tag === 'li')
            .map((li, i) =>
              renderListItem(li, ctx, `${key}-li${i}`, isTaskList, i, isOrdered),
            )}
        </View>
      );
    }
    case 'blockquote':
      return renderBlockquote(node, ctx, key);
    case 'hr':
      return (
        <View
          key={key}
          style={[styles.hr, { backgroundColor: ctx.colors.border }]}
          accessible={false}
        />
      );
    case 'br':
      return null; // <br> between block elements is a no-op
    default:
      // Unknown block — flatten its children as blocks. Never throws.
      return (
        <View key={key}>
          {node.children.map((c, i) => renderBlock(c, ctx, `${key}-u${i}`))}
        </View>
      );
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface NoteContentViewProps {
  html: string;
  /** Shown when html has no visible content. */
  placeholder?: string;
}

/**
 * Renders HTML note content as native React Native text without mounting
 * a WebView. See file header for the full rationale.
 */
export function NoteContentView({ html, placeholder }: NoteContentViewProps) {
  const { colors } = useTheme();
  const nodes = useMemo(() => parseHtml(html ?? ''), [html]);
  const hasContent = useMemo(() => htmlHasContent(html), [html]);

  if (!hasContent) {
    if (!placeholder) return null;
    return (
      <View style={styles.root}>
        <Text style={[styles.placeholder, { color: colors.textHint }]}>{placeholder}</Text>
      </View>
    );
  }

  const ctx: RenderContext = { colors };

  return (
    <View style={styles.root}>
      {nodes.map((n, i) => renderBlock(n, ctx, `root-${i}`))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — mirror buildEditorCSS() in note-detail.tsx.
//
// Body: 17px Inter, line-height 1.65 (= 28px at 17px), 4px horizontal padding.
// Headings: 22/19/17 at 700/600/600.
// Blockquote: 3px accent left border, 14/18 padding, backgroundElevated,
//             right-side 10px radius, italic body, non-italic ref cap.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 4,
  },
  paragraph: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 4,
  },
  emptyParagraph: {
    height: 18,
  },
  h1: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 4,
  },
  h2: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  h3: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  list: {
    marginVertical: 4,
    paddingLeft: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    gap: 8,
  },
  listItemBody: {
    flex: 1,
  },
  bullet: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
    width: 14,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
    gap: 8,
  },
  taskItemBody: {
    flex: 1,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  checkedText: {
    textDecorationLine: 'line-through',
    opacity: 0.45,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginVertical: 16,
  },
  blockquoteVerse: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 17,
    lineHeight: 26,
    fontStyle: 'italic',
  },
  blockquoteRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 0.2,
    fontWeight: '500',
  },
  hr: {
    height: 1,
    marginVertical: 12,
  },
  placeholder: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
    padding: 4,
  },
});
