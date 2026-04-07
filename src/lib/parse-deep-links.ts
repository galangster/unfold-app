/**
 * Parse [[deep_link:{...}]] patterns from companion responses.
 * Returns ordered segments for rendering and extracted links for persistence.
 */

export interface DeepLinkData {
  devotionalId: string;
  dayNumber: number;
  type: "reading" | "journal" | "prayer";
  preview: {
    title: string;
    scripture?: string;
    date: string;
  };
}

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "deep_link"; data: DeepLinkData };

export interface ParseResult {
  cleanContent: string;
  deepLinks: DeepLinkData[];
  segments: MessageSegment[];
}

const DEEP_LINK_PATTERN = /\[\[deep_link:(.*?)\]\]/g;

function validateDeepLink(raw: unknown): DeepLinkData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.devotionalId !== "string" || !obj.devotionalId) return null;
  if (typeof obj.dayNumber !== "number" || obj.dayNumber < 1) return null;
  if (!["reading", "journal", "prayer"].includes(obj.type as string)) return null;

  const preview = obj.preview as Record<string, unknown> | undefined;
  if (!preview || typeof preview.title !== "string") return null;

  return {
    devotionalId: obj.devotionalId,
    dayNumber: obj.dayNumber,
    type: obj.type as "reading" | "journal" | "prayer",
    preview: {
      title: preview.title,
      scripture: typeof preview.scripture === "string" ? preview.scripture : undefined,
      date: typeof preview.date === "string" ? preview.date : "unknown",
    },
  };
}

export function parseDeepLinks(content: string): ParseResult {
  const deepLinks: DeepLinkData[] = [];
  const segments: MessageSegment[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  DEEP_LINK_PATTERN.lastIndex = 0;

  while ((match = DEEP_LINK_PATTERN.exec(content)) !== null) {
    // Add text before this match
    const textBefore = content.slice(lastIndex, match.index).trim();
    if (textBefore) {
      segments.push({ type: "text", content: textBefore });
    }

    // Try to parse the deep link JSON
    try {
      const parsed = JSON.parse(match[1]);
      const validated = validateDeepLink(parsed);
      if (validated) {
        deepLinks.push(validated);
        segments.push({ type: "deep_link", data: validated });
      }
    } catch {
      // Invalid JSON — skip this match, keep as text
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  const remaining = content.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ type: "text", content: remaining });
  }

  // Clean content = text without deep link patterns
  const cleanContent = content.replace(DEEP_LINK_PATTERN, "").replace(/\n{3,}/g, "\n\n").trim();

  return { cleanContent, deepLinks, segments };
}
