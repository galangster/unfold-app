/**
 * Recommendation reason text for the Today card. The backend cleans the
 * reasons it serves, but a trial finale's stored pick line reaches the card
 * from the device store, so the card cleans it again before rendering.
 * Mirrors unfold-backend src/lib/recommendation-reason.ts.
 */

// A reason is one sentence, and both writers keep it under 200 characters.
// The bound keeps the regex work below cheap on hostile stored text.
const MAX_INPUT_LENGTH = 1000;
// Each pass only removes text. Text that is still changing after this many
// passes is treated as unusable, so a returned reason is always stable.
const MAX_PASSES = 5;

const RULE_LINE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-+)\s*$/;
const CONTAINER_MARKERS = /^\s*(>\s?|([-*+]|\d+[.)])\s+)+/;
const HEADING_OR_FENCE_LINE = /^\s{0,3}(#{1,6}(\s|$)|```|~~~)/;
const LABEL = /^(recommendation\s*:\s*)+/i;
// A table row starts with a pipe, or is the separator row under a header.
// The separator is matched with whitespace removed, which keeps it linear.
const TABLE_ROW_START = /^\s*\|/;
const TABLE_SEPARATOR = /^\|?:?-+:?(\|:?-+:?)+\|?$/;
const LINK_DEFINITION_LINE = /^\s*\[[^\]]+\]:\s*\S/;
// Markup with no plain-text reading: an HTML tag or comment, an inline or
// reference link, strikethrough.
const LEFTOVER_MARKUP = /<[a-z!/]|\[[^[\]]*\]\s*[([]|~~/i;

/**
 * Removes one outer pair of quotes. Apostrophes inside single quotes do not
 * count. A double pair comes off only when the quotes inside it pair up and
 * the first one opens a quotation, so "Be still" and "know" keeps its quotes.
 */
function unquote(text: string): string {
  if (text.length < 2) return text;
  const inner = text.slice(1, -1);
  const first = text[0];
  const last = text[text.length - 1];
  if (first === "'" && last === "'") return inner;
  if (first === '“' && last === '”' && !/[“”]/.test(inner)) return inner;
  if (first !== '"' || last !== '"') return text;
  const firstInner = inner.indexOf('"');
  const balanced = inner.split('"').length % 2 === 1;
  const opensFirst = firstInner <= 0 || /\s/.test(inner[firstInner - 1]);
  return balanced && opensFirst ? inner : text;
}

/**
 * Removes paired emphasis and code delimiters. The wrapped text starts and
 * ends with a non-space character and never contains its own delimiter (bold
 * text may hold a single `*` or `_`), so a lone or repeated `*` or `_` stays
 * and each scan stops at the next delimiter.
 */
function stripPairedEmphasis(text: string): string {
  return text
    .replace(/\*\*([^\s*](?:(?:[^*]|\*(?!\*))*[^\s*])?)\*\*/g, '$1')
    .replace(/__([^\s_](?:(?:[^_]|_(?!_))*[^\s_])?)__/g, '$1')
    .replace(/(^|[^\w*])\*([^\s*](?:[^*]*[^\s*])?)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w_])_([^\s_](?:[^_]*[^\s_])?)_(?![\w_])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

function isTableLine(line: string): boolean {
  return TABLE_ROW_START.test(line) || TABLE_SEPARATOR.test(line.replace(/\s+/g, ''));
}

function cleanOnce(raw: string): string | null {
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
    if (isTableLine(line) || LINK_DEFINITION_LINE.test(line)) return null;
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
    if (next === null) return null;
    if (next === text) return text && !LEFTOVER_MARKUP.test(text) ? text : null;
    text = next;
  }
  return null;
}
