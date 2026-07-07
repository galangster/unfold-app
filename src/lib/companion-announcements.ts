/**
 * Builds the VoiceOver/TalkBack announcement text for a completed companion
 * reply (WR-20). Screen-reader users otherwise get no signal that a reply
 * streamed in — the message list doesn't move accessibility focus.
 *
 * Dependency-free on purpose (companion-limits.ts precedent): consumed by the
 * chat hook but unit-testable without dragging expo/fetch into the module
 * graph.
 */
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

  return text.length > 0 ? text : null;
}
