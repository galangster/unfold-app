/* ─────────────────────────────────────────────────────────
 * Helper: strip HTML tags for plain-text contexts
 * (NoteCard preview, first-line title fallback)
 * ───────────────────────────────────────────────────────── */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|li|h[1-6]|blockquote|div)[^>]*>/gi, ' ')
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
