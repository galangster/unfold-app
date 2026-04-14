/* ─────────────────────────────────────────────────────────
 * Helper: strip HTML tags for plain-text contexts
 * (NoteCard preview, first-line title fallback)
 *
 * Block-level tags (p, li, h1-6, blockquote, div) AND the void line
 * break <br> are replaced with a space so "<p>First</p><p>line</p>" reads
 * as "First line" in previews, not "Firstline". Inline tags
 * (strong/em/a/etc) are elided with no replacement so marks don't
 * leak extra whitespace into the preview.
 * ───────────────────────────────────────────────────────── */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|li|h[1-6]|blockquote|div)[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─────────────────────────────────────────────────────────
 * Helper: detect HTML vs legacy plain-text/markdown content
 * ───────────────────────────────────────────────────────── */
export function isHtmlContent(content: string): boolean {
  return content.trimStart().startsWith('<');
}
