/**
 * Recommendation reason text for the Today card. The backend cleans the
 * reasons it serves, but a trial finale's stored pick line reaches the card
 * from the device store, so the card cleans it again before rendering.
 * Mirrors unfold-backend src/lib/recommendation-reason.ts.
 */

// A reason is one sentence, and both writers keep it under 200 characters.
// The bound keeps the regex work below cheap on hostile stored text.
const MAX_INPUT_LENGTH = 1000;
// Each pass only removes text, so a few passes reach a stable result.
const MAX_PASSES = 5;

const RULE_LINE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-+)\s*$/;
const CONTAINER_MARKERS = /^\s*(>\s?|([-*+]|\d+[.)])\s+)+/;
const HEADING_OR_FENCE_LINE = /^\s{0,3}(#{1,6}(\s|$)|```|~~~)/;
const LABEL = /^(recommendation\s*:\s*)+/i;
// Markup with no plain-text reading: an HTML tag or comment, a link or link
// definition, a table row, strikethrough.
const LEFTOVER_MARKUP = /<[a-z!/]|\[[^[\]]*\]\s*[([:]|\|[^|]*\||~~/i;

/** Removes one matched pair of outer quotes. */
function unquote(text: string): string {
  const pair = /^"([^"]*)"$|^'([^']*)'$|^“([^“”]*)”$/.exec(text);
  return pair ? (pair[1] ?? pair[2] ?? pair[3]) : text;
}

/** Removes paired emphasis and code delimiters; a lone `*` or `_` stays. */
function stripPairedEmphasis(text: string): string {
  return text
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1')
    .replace(/__(\S(?:.*?\S)?)__/g, '$1')
    .replace(/(^|[^\w*])\*(\S(?:.*?\S)?)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w_])_(\S(?:.*?\S)?)_(?![\w_])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

function cleanOnce(raw: string): string {
  const kept: string[] = [];
  let underText = false;
  for (const rawLine of raw.split(/\r?\n/)) {
    if (underText && SETEXT_UNDERLINE.test(rawLine)) {
      kept.pop();
      underText = false;
      continue;
    }
    const line = stripPairedEmphasis(rawLine.replace(CONTAINER_MARKERS, ''));
    if (RULE_LINE.test(rawLine) || RULE_LINE.test(line) || HEADING_OR_FENCE_LINE.test(line)) {
      underText = false;
      continue;
    }
    kept.push(line);
    underText = line.trim().length > 0;
  }
  const text = unquote(kept.join(' ').replace(/\s+/g, ' ').trim());
  return unquote(text.replace(LABEL, ''));
}

/** Plain text for the card, or null when markup survives or nothing is left. */
export function cleanRecommendationReason(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_INPUT_LENGTH) return null;
  let text = raw;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = cleanOnce(text);
    if (next === text) break;
    text = next;
  }
  if (!text || LEFTOVER_MARKUP.test(text)) return null;
  return text;
}
