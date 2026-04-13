/**
 * note-content-parser — Pure HTML parser for NoteContentView.
 *
 * Parses the bounded HTML tag set emitted by @10play/tentap-editor
 * into a tree of TextNode | ElementNode values. This module has zero
 * React, RN, or theme dependencies so it can be tested in isolation.
 *
 * This is NOT a general-purpose HTML parser. It assumes well-formed
 * HTML produced by tentap or legacyMarkdownToHtml — balanced tags,
 * attributes quoted, no comments or doctype. On unexpected input we
 * degrade gracefully (unbalanced closes are ignored, unknown tags
 * pass through) rather than throwing.
 */

export type TextNode = { type: 'text'; value: string };

export type ElementNode = {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
};

export type HtmlNode = TextNode | ElementNode;

const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input']);

/** Minimal HTML entity decoder. Tiptap's emitted HTML uses a small, known set. */
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': '\u00A0',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
  '&hellip;': '\u2026',
};

export function decodeEntities(s: string): string {
  return s.replace(
    /&(?:amp|lt|gt|quot|apos|#39|nbsp|mdash|ndash|hellip);/g,
    (m) => ENTITY_MAP[m] ?? m,
  );
}

export function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!raw) return attrs;
  const attrRegex = /([a-z][a-z0-9-]*)(?:="([^"]*)")?/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(raw)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] !== undefined ? decodeEntities(m[2]) : '';
  }
  return attrs;
}

/**
 * Parse an HTML string into a tree of nodes.
 *
 * Unbalanced close tags are ignored (stack not popped below root).
 * Unknown tags pass through as elements with their children preserved,
 * so unexpected markup degrades rather than disappearing.
 */
export function parseHtml(html: string): HtmlNode[] {
  if (!html) return [];
  const root: HtmlNode[] = [];
  const stack: HtmlNode[][] = [root];
  const tokenRegex = /<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z][a-z0-9-]*(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    // Text node
    if (match[5] !== undefined) {
      const text = decodeEntities(match[5]);
      if (text.length === 0) continue;
      stack[stack.length - 1].push({ type: 'text', value: text });
      continue;
    }

    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const attrs = parseAttrs(match[3]);
    const selfClosing = match[4] === '/';

    if (closing) {
      // Pop current context; degrade gracefully on unbalanced close.
      if (stack.length > 1) stack.pop();
      continue;
    }

    const element: ElementNode = { type: 'element', tag, attrs, children: [] };
    stack[stack.length - 1].push(element);

    if (!selfClosing && !VOID_ELEMENTS.has(tag)) {
      stack.push(element.children);
    }
  }

  return root;
}

/** True if a node is an element (not text). */
export function isElement(node: HtmlNode): node is ElementNode {
  return node.type === 'element';
}

/**
 * Flatten all text descendants of a node into a single string. Walks
 * inline marks (strong/em/s/u/a) so a paragraph like
 *   <p>— <em>Hebrews</em> 11:1</p>
 * flattens to "— Hebrews 11:1".
 */
export function flattenTextContent(node: HtmlNode): string {
  if (node.type === 'text') return node.value;
  let out = '';
  for (const child of node.children) {
    out += flattenTextContent(child);
  }
  return out;
}

/** True if an HTML string has meaningful visible content. */
export function htmlHasContent(html: string | undefined | null): boolean {
  if (!html) return false;
  const trimmed = html.trim();
  if (trimmed.length === 0) return false;
  // TipTap's empty document
  if (trimmed === '<p></p>') return false;
  // Paragraphs of whitespace only
  const stripped = trimmed.replace(/<[^>]+>/g, '').trim();
  return stripped.length > 0;
}

// ---------------------------------------------------------------------------
// Scripture reference detection
//
// A scripture callout's last paragraph is a reference line like
// "— Hebrews 11:1" or "— 1 Corinthians 13:4-7". Detecting the shape
// lets the renderer style the last paragraph as a reference cap with
// high confidence, rather than guessing based on paragraph count.
//
// See ./scripture-content-builder.ts for the insert-path builder that
// writes this shape into the editor.
// ---------------------------------------------------------------------------

/**
 * Matches a scripture reference line: em-dash + whitespace + any chars,
 * then "N:N" (optionally "-N") near the end. Tolerates trailing whitespace.
 *
 * Matches:
 *   "— Hebrews 11:1"
 *   "— 1 Corinthians 13:4"
 *   "— Psalm 23:1-6"
 *   "— Song of Solomon 2:1"
 *
 * Does not match:
 *   "Hebrews 11:1"            (no em-dash prefix)
 *   "— a quote with no verse" (no chapter:verse)
 *   "— just text 1 2 3"       (no colon)
 */
export const SCRIPTURE_REFERENCE_REGEX = /^\u2014\s.+\d+:\d+(-\d+)?\s*$/;

/** True if a plain-text line reads as a scripture reference. */
export function isScriptureReferenceLine(text: string): boolean {
  return SCRIPTURE_REFERENCE_REGEX.test(text.trim());
}
