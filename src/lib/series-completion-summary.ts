const MAX_COMPLETION_SUMMARY_CHARS = 220;
const MAX_COMPLETION_SUMMARY_SENTENCES = 2;

function normalizeSummaryText(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim();
}

function splitIntoSentences(summary: string): string[] {
  return summary
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

function trimAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const clipped = text.slice(0, maxChars).trimEnd();
  const lastSpace = clipped.lastIndexOf(' ');
  const safeClip = lastSpace > Math.floor(maxChars * 0.65)
    ? clipped.slice(0, lastSpace)
    : clipped;

  return `${safeClip.replace(/[,. ;:!?]+$/, '')}…`;
}

/**
 * Series reflections can be beautifully written but too long for the
 * full-screen completion overlay. Keep the moment devotional and readable:
 * at most two short sentences, preserving the opening movement and the
 * closing invitation when the backend provides a long paragraph.
 */
export function formatSeriesCompletionSummary(summary?: string | null): string | null {
  if (!summary) return null;

  const normalized = normalizeSummaryText(summary);
  if (!normalized) return null;
  if (normalized.length <= MAX_COMPLETION_SUMMARY_CHARS) return normalized;

  const sentences = splitIntoSentences(normalized);
  if (sentences.length === 0) {
    return trimAtWordBoundary(normalized, MAX_COMPLETION_SUMMARY_CHARS);
  }

  const first = sentences[0] ?? '';
  const last = sentences[sentences.length - 1] ?? '';
  const firstAndLast = [first, last]
    .filter(Boolean)
    .filter((sentence, index, arr) => index === 0 || sentence !== arr[0])
    .join(' ')
    .trim();

  if (firstAndLast && firstAndLast.length <= MAX_COMPLETION_SUMMARY_CHARS) {
    return firstAndLast;
  }

  const leadingExcerpt = sentences.slice(0, MAX_COMPLETION_SUMMARY_SENTENCES).join(' ').trim();
  return trimAtWordBoundary(leadingExcerpt || normalized, MAX_COMPLETION_SUMMARY_CHARS);
}
