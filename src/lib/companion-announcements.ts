/**
 * Builds the VoiceOver/TalkBack announcement text for a completed companion
 * reply (WR-20). Screen-reader users otherwise get no signal that a reply
 * streamed in — the message list doesn't move accessibility focus.
 *
 * Dependency-free on purpose (companion-limits.ts precedent): consumed by the
 * chat hook but unit-testable without dragging expo/fetch into the module
 * graph.
 */
/** VoiceOver reads announcements in full and they can't be paused — cap long
 * replies so a multi-paragraph answer doesn't hold the screen reader hostage.
 * The full text remains readable in the message list itself. */
export const ANNOUNCEMENT_MAX_CHARS = 280;

export function companionReplyAnnouncement(content: string): string | null {
  const text = content
    .replace(/^#{1,6}\s+/gm, '')       // headers
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/^[-*]\s+/gm, '')         // bullet lists
    .replace(/^\d+\.\s+/gm, '')        // numbered lists
    .replace(/^[-*_]{3,}\s*$/gm, '')   // horizontal rules
    .replace(/^>\s*/gm, '')            // blockquote markers
    .replace(/\[([^\]]+)\]/g, '$1')    // [Romans 5:8] → Romans 5:8
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length === 0) return null;
  if (text.length <= ANNOUNCEMENT_MAX_CHARS) return text;

  // Truncate on a word boundary so the announcement doesn't end mid-word.
  const clipped = text.slice(0, ANNOUNCEMENT_MAX_CHARS);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}
