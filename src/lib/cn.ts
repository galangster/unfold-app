import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Prevents orphan words (single words on the last line) by replacing
 * the last space with a non-breaking space.
 * Also handles the last 2-3 words if the final word is short.
 */
export function preventOrphan(text: string): string {
  if (!text || typeof text !== 'string') return text;

  const trimmed = text.trim();
  const words = trimmed.split(' ');

  if (words.length <= 2) return trimmed;

  // Check if the last word is short (4 chars or less)
  const lastWord = words[words.length - 1];
  const secondLastWord = words[words.length - 2];

  // If last word is very short, join last 3 words with non-breaking spaces
  if (lastWord.length <= 4 && secondLastWord.length <= 4 && words.length > 3) {
    const beforeLast = words.slice(0, -3).join(' ');
    const lastThree = words.slice(-3).join('\u00A0');
    return `${beforeLast} ${lastThree}`;
  }

  // Otherwise, just join the last two words with non-breaking space
  const beforeLast = words.slice(0, -2).join(' ');
  const lastTwo = words.slice(-2).join('\u00A0');
  return `${beforeLast} ${lastTwo}`;
}

/**
 * Strips one layer of leading/trailing quote punctuation (straight + curly,
 * single + double) so decorative quote wrapping never doubles marks.
 * Double quotes are stripped even when unbalanced (a verse can open dialogue
 * that closes in a later verse); single quotes are stripped only when BOTH
 * ends carry one, so trailing possessive apostrophes ("Jesus’") survive.
 * A leading scripture verse marker (superscript or ASCII digits, e.g. "¹⁰ " or
 * "10 ") is preserved — the quote marks that follow it are stripped while the
 * marker itself stays put.
 * Display-time only — never apply when writing to the store: highlight text
 * is re-located in documents by exact text match.
 */
export function stripOuterQuotes(text: string): string {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();

  // Preserve a leading verse marker (superscript or ASCII digits + space),
  // strip the quotes off the remainder, then re-attach the marker. The
  // superscript digits are spread across two Unicode blocks (¹²³ live at
  // U+00B9/B2/B3, the rest at U+2070-2079), so the class is enumerated.
  const verseMarkerMatch = trimmed.match(/^((?:[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+)\s+)([\s\S]*)$/);
  if (verseMarkerMatch) {
    const marker = verseMarkerMatch[1];
    const body = stripOuterQuotes(verseMarkerMatch[2]);
    return `${marker}${body}`;
  }

  let t = trimmed;
  t = t.replace(/^[“”"]+/, '').replace(/[“”"]+$/, '').trim();
  if (t.length >= 2 && /^[‘’']/.test(t) && /[‘’']$/.test(t)) {
    t = t.slice(1, -1).trim();
  }
  return t;
}
