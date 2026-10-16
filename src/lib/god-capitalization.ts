/**
 * Capitalizes a lowercase "god" only where it names God.
 *
 * Ported from the backend repair (unfold-backend,
 * src/lib/generation/validator.ts: isLowercaseGodSlip and its helpers) so the
 * app's safety net agrees with the server's. The app used to replace every
 * \bgod\b with "God", which turned "a false god" into "a false God" and
 * reversed what the sentence meant.
 *
 * A lowercase "god" usually names an idol or a god in general: "a pagan god",
 * "the Canaanite storm god", "the god Baal", "the god of the Philistines",
 * "Is comfort your god?". So it is capitalized only where it stands as a name
 * ("trust god", "the god of Israel", "our god"). It stays lowercase:
 * - after a determiner or a possessive ("a", "no", "every", "your", "their"),
 *   or "the" with a word between, with at most two words between, unless a
 *   word between describes God ("a faithful god", "the one true god");
 * - after an idol word ("other", "false", "pagan");
 * - before a name, before "of the" and a people, and in "the god of this age".
 * A compound such as "God-given" or "God-fearing" is always capitalized.
 */

const LOWERCASE_GOD_REGEX = /\bgod\b(?!\s*(?:s\b|less|like|awful|forsaken|damn|speed|father|mother|child|send|given|fearing))/g;

const GOD_DETERMINERS = new Set(['a', 'an', 'another', 'any', 'every', 'no', 'some', 'each', 'this', 'my', 'your', 'his', 'her', 'its', 'their', 'whose']);
const IDOL_WORDS = new Set(['other', 'false', 'foreign', 'strange', 'pagan', 'graven', 'molten', 'carved', 'household', 'man-made']);
/** Words between a determiner and "god" that describe God or name him. */
const DESCRIBES_GOD = new Set([
  'faithful', 'living', 'holy', 'jealous', 'good', 'loving', 'gracious', 'merciful', 'mighty', 'great', 'true',
  'sovereign', 'righteous', 'compassionate', 'patient', 'gentle', 'steadfast', 'almighty', 'eternal', 'everlasting',
  'only', 'one', 'triune', 'kind', 'generous', 'tender', 'glorious', 'majestic', 'perfect',
  'lord', 'father', 'most', 'high',
]);
/** Words that end a noun phrase: "Say no and god will help" names God. */
const PHRASE_BREAKS = new Set([
  'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'if', 'then', 'than', 'as', 'when', 'while', 'because', 'though',
  'of', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'onto', 'upon', 'about', 'through', 'without', 'before',
  'after', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'will', 'would', 'can', 'could', 'shall', 'should',
  'may', 'might', 'must', 'do', 'does', 'did', 'has', 'have', 'had', 'let', 'not', 'that', 'which', 'who', 'whom',
  'what', 'where', 'why', 'how', 'there', 'here', 'also', 'even', 'just',
]);
const GOD_COMPOUND = /^-(?:given|fearing|shaped|breathed|honou?ring|cent(?:er|re)d|sized|ordained|sent|glorifying|inspired)\b/i;
const IDOL_AFTER = /^\s+(?:of\s+this\s+(?:present\s+)?(?:age|world)\b|of\s+the\s+\p{Lu}|(?!(?:Almighty|Most|He|Him|His|Himself|You|Your|Yours|Yourself)\b)\p{Lu}\p{Ll})/u;

/** Up to three words before `index`, nearest last, joined by whitespace only. */
function wordsBefore(text: string, index: number): string[] {
  const words: string[] = [];
  let end = index;
  while (words.length < 3) {
    let gap = end;
    while (gap > 0 && /\s/.test(text[gap - 1])) gap--;
    if (gap === end) break;
    let wordStart = gap;
    while (wordStart > 0 && /[\p{L}'’-]/u.test(text[wordStart - 1])) wordStart--;
    if (wordStart === gap) break;
    words.unshift(text.slice(wordStart, gap));
    end = wordStart;
  }
  return words;
}

/** True when the lowercase "god" at `index` names God and is a slip for "God". */
function isLowercaseGodSlip(text: string, index: number): boolean {
  const after = text.slice(index + 3, index + 83);
  if (GOD_COMPOUND.test(after)) return true;
  if (IDOL_AFTER.test(after)) return false;
  const lower = wordsBefore(text, index).map((word) => word.toLowerCase());
  const nearest = lower.length - 1;
  if (nearest < 0) return true;
  if (IDOL_WORDS.has(lower[nearest]) || GOD_DETERMINERS.has(lower[nearest])) return false;
  // A determiner, or "the", one or two words back, with no break between:
  // "an Ammonite god", "the Canaanite storm god", but "the living God".
  for (let at = nearest - 1; at >= Math.max(0, nearest - 2); at--) {
    const between = lower.slice(at + 1);
    if (between.some((word) => PHRASE_BREAKS.has(word))) break;
    if (GOD_DETERMINERS.has(lower[at]) || lower[at] === 'the') return between.some((word) => DESCRIBES_GOD.has(word));
  }
  return true;
}

/** The text with each lowercase "god" that names God capitalized. */
export function capitalizeGodSlips(text: string): string {
  return text.replace(LOWERCASE_GOD_REGEX, (word: string, index: number) => (isLowercaseGodSlip(text, index) ? 'God' : word));
}
