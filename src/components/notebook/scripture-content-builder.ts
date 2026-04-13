/**
 * scripture-content-builder — Pure helpers for constructing the
 * ProseMirror JSON + HTML shapes for inline scripture callouts.
 *
 * A scripture callout is a multi-paragraph blockquote whose last
 * paragraph starts with an em-dash prefix and a scripture reference
 * (e.g. "— Hebrews 11:1"). Both the insert-path (editor.insertContent
 * in note-detail.tsx) and the render-path (NoteContentView) agree on
 * this shape so round-trips through save/load render identically.
 *
 * Why this lives in user-space (not as a custom TipTap node):
 * @10play/tentap-editor v1.0.1 ships a pre-built WebView bundle whose
 * bridges are registered at build time. Custom BridgeExtension entries
 * that declare `tiptapExtension` from the RN side are silently skipped
 * by the web bundle's `configureTiptapExtensionsOnRunTime` — the web
 * bundle only processes bridges whose names already exist in the
 * bundled `bridgeExtensionConfigMap`. The only way to add a new TipTap
 * node type is to fork the web editor (vendor `src/webEditorUtils/`
 * and rebuild via Vite) and pass it as `customSource` on
 * `useEditorBridge`. That is a 500-1000 LOC project and is tracked as
 * a follow-up. In the meantime, this module OWNS the blockquote shape
 * contract so the insert path and render path cannot silently drift.
 *
 * Pure module: zero React, RN, or @10play/tentap-editor imports.
 *
 * See ~/vault/standards/tentap-custom-nodes-require-fork.md
 */

/** em-dash + single space. The literal prefix written to reference lines. */
export const SCRIPTURE_REFERENCE_PREFIX = '\u2014 ';

/**
 * Normalize verse text for a single-paragraph blockquote line. Collapses
 * embedded newlines and runs of whitespace to a single space. Mirrors
 * the normalization in note-detail.tsx's scripture insert path.
 */
export function normalizeScriptureVerseText(text: string): string {
  return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Render a reference line: em-dash + space + reference. */
export function buildScriptureReferenceLine(reference: string): string {
  return `${SCRIPTURE_REFERENCE_PREFIX}${reference.trim()}`;
}

// ---------------------------------------------------------------------------
// ProseMirror JSON shape — passed to `editor.insertContent(...)` inside the
// WebView. TipTap serializes these nodes back to HTML when the editor saves,
// so the shape below must match what the NoteContentView parser expects.
// ---------------------------------------------------------------------------

export type ProseMirrorJsonNode =
  | { type: 'text'; text: string }
  | { type: 'paragraph'; content?: ProseMirrorJsonNode[] }
  | { type: 'blockquote'; content: ProseMirrorJsonNode[] };

/**
 * ProseMirror JSON nodes for a single verse + reference blockquote plus
 * a trailing empty paragraph. The trailing paragraph is where the cursor
 * lands after insertion so the user can keep typing without their next
 * keystroke being captured by the reference line.
 */
export function buildScriptureBlockquoteNodes(
  reference: string,
  text: string,
): ProseMirrorJsonNode[] {
  const verseText = normalizeScriptureVerseText(text);
  const referenceLine = buildScriptureReferenceLine(reference);
  return [
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: verseText }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: referenceLine }],
        },
      ],
    },
    { type: 'paragraph' },
  ];
}

// ---------------------------------------------------------------------------
// HTML shape — what TipTap serializes the ProseMirror tree to when saving.
// Used by the NoteContentView parser to reconstruct the callout, and by
// round-trip tests to assert the insert-path → render-path contract.
// ---------------------------------------------------------------------------

/**
 * Minimal HTML entity encoder. Escapes only the characters that would be
 * interpreted as HTML. Mirrors the set decoded by note-content-parser's
 * `decodeEntities`, so builder output round-trips cleanly through the
 * parser.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML serialization of a scripture blockquote, matching what TipTap
 * emits for the nodes returned by `buildScriptureBlockquoteNodes`.
 * The trailing empty paragraph is omitted — callers that want the full
 * save-shape should append `<p></p>` themselves.
 */
export function buildScriptureBlockquoteHtml(reference: string, text: string): string {
  const verseText = escapeHtml(normalizeScriptureVerseText(text));
  const referenceLine = escapeHtml(buildScriptureReferenceLine(reference));
  return `<blockquote><p>${verseText}</p><p>${referenceLine}</p></blockquote>`;
}
