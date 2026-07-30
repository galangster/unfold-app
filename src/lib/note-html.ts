/**
 * Plain-text helpers for Notebook note HTML content.
 *
 * Notes are stored as TipTap/native-editor HTML (or legacy plain
 * text/markdown). These helpers derive plain text for previews, share
 * sheets, and accessibility values. Extracted from the retired
 * NoteEditor component so list surfaces don't import a full editor.
 */

/** Strip HTML tags + entities for plain-text contexts
 *  (NoteCard preview, first-line title fallback). */
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

/** Detect HTML vs legacy plain-text/markdown content. */
export function isHtmlContent(content: string): boolean {
  return content.trimStart().startsWith('<');
}
