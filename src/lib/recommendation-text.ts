/**
 * Recommendation reason text for the Today card. The backend cleans the
 * reasons it serves, but a trial finale's stored pick line reaches the card
 * from the device store, so the card cleans it again before rendering.
 * Mirrors unfold-backend src/lib/recommendation-reason.ts.
 */

const HEADING_LINE = /^\s{0,3}#{1,6}(\s|$)/;
const RULE_LINE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-+)\s*$/;
const BLOCKQUOTE_MARKER = /^\s*(>\s?)+/;
const LIST_MARKER = /^\s*([-*+]|\d+[.)])\s+/;
const BOLD_LABEL = /^(\*\*|__)[^*_]+?(:\1|\1:)\s*/;
const PLAIN_LABEL = /^recommendation\s*:\s*/i;
const EMPHASIS = /[*_`]/g;
const WRAPPING_QUOTES = /^["']|["']$/g;
// Markup with no plain-text reading: an HTML tag, an inline or reference
// link, a link definition, a table row.
const LEFTOVER_MARKUP = /<\/?[a-z][^>]*>|\[[^\]]*\]\s*(\([^)]*\)|\[[^\]]*\]|:)|\|.*\|/i;

/** Plain text for the card, or null when markup survives or nothing is left. */
export function cleanRecommendationReason(raw: string): string | null {
  const kept: string[] = [];
  let underText = false;
  for (const line of raw.split(/\r?\n/)) {
    if (underText && SETEXT_UNDERLINE.test(line)) {
      kept.pop();
      underText = false;
      continue;
    }
    if (HEADING_LINE.test(line) || RULE_LINE.test(line)) {
      underText = false;
      continue;
    }
    kept.push(line.replace(BLOCKQUOTE_MARKER, '').replace(LIST_MARKER, ''));
    underText = line.trim().length > 0;
  }

  const text = kept
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(WRAPPING_QUOTES, '')
    .replace(BOLD_LABEL, '')
    .replace(EMPHASIS, '')
    .trim()
    .replace(PLAIN_LABEL, '')
    .replace(WRAPPING_QUOTES, '');
  if (!text || LEFTOVER_MARKUP.test(text)) return null;
  return text;
}
