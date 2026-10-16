/**
 * Capitalizes a lowercase "god" only where it can only be a name of God.
 *
 * Ported from the backend repair (unfold-backend ab7d932,
 * src/lib/generation/validator.ts: isLowercaseGodSlip and its helpers) so the
 * app's safety net agrees with the server's. The app used to capitalize every
 * \bgod\b, which turned "a false god" into "a false God".
 *
 * A lowercase "god" usually names an idol or a god in general: "a pagan
 * god", "Which god are you serving?", "Is comfort your god?", "the god of
 * approval". "God" there reverses the meaning, and the model capitalizes God
 * when it means God. So the repair capitalizes "god" only where it can only be
 * a name, and leaves every other lowercase "god" as written:
 * - at the start of a sentence ("god is near");
 * - right after a preposition, a conjunction, an auxiliary, or a verb of
 *   prayer and trust ("trust god", "with god", "Does god care?", "Say no and
 *   god will help"), and after "that" inside a sentence ("Know that god");
 * - after "our" and "Lord" ("the Lord god"), and after a possessive that
 *   follows "Lord" ("the Lord your god");
 * - in "the god of" Israel, Abraham, Isaac, Jacob, heaven, peace, hope, love,
 *   or all comfort or grace;
 * - in a compound such as "God-given" or "God-fearing".
 * "god's" follows the same rules.
 */

const LOWERCASE_GOD_REGEX = /\bgod\b(?!\s*(?:s\b|less|like|awful|forsaken|damn|speed|father|mother|child|send|given|fearing))/g;

const GOD_NAME_PRECEDERS = new Set([
  // Prepositions.
  'to', 'with', 'from', 'for', 'in', 'on', 'by', 'before', 'toward', 'towards', 'unto', 'upon', 'about', 'through',
  'without', 'under', 'beside', 'near', 'after', 'against', 'at', 'into', 'within', 'of', 'like', 'than',
  // Conjunctions.
  'and', 'or', 'but', 'nor', 'because', 'if', 'when', 'while', 'as', 'though', 'although', 'until', 'since', 'where',
  'how', 'why', 'so', 'yet', 'whether', 'once',
  // Auxiliaries.
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  // Verbs of prayer and trust.
  'trust', 'trusts', 'trusted', 'trusting', 'thank', 'thanks', 'thanked', 'praise', 'praises', 'praised', 'praising',
  'seek', 'seeks', 'sought', 'seeking', 'follow', 'follows', 'followed', 'following', 'know', 'knows', 'knew',
  'knowing', 'love', 'loves', 'loved', 'loving', 'ask', 'asks', 'asked', 'asking', 'let', 'lets', 'meet', 'meets', 'met',
  'worship', 'worships', 'worshiped', 'worshipped', 'fear', 'fears', 'feared', 'obey', 'obeys', 'obeyed', 'honor',
  'honors', 'honored', 'honour', 'glorify', 'glorifies', 'glorified', 'serve', 'serves', 'served', 'serving', 'need',
  'needs', 'needed', 'tell', 'tells', 'told', 'give', 'gives', 'gave', 'hand', 'hands', 'handed', 'invite', 'invites',
  'invited', 'hear', 'hears', 'heard', 'find', 'finds', 'found', 'please', 'pleases', 'pleased', 'bless', 'blesses',
  'blessed', 'call', 'calls', 'called',
  // A name of God before "god": "the Lord god".
  'our', 'lord',
]);
const GOD_POSSESSIVES = new Set(['my', 'your', 'his', 'her', 'its', 'their', 'whose']);
const GOD_COMPOUND = /^-(?:given|fearing|shaped|breathed|honou?ring|cent(?:ered|red)|sized|ordained|sent|glorifying|inspired)\b/i;
const GOD_OF_NAME = /^\s+of\s+(?:Israel|Abraham|Isaac|Jacob|heaven|peace|hope|love|all\s+(?:comfort|grace))\b/i;

/** Up to two words before `index`, nearest last, joined by whitespace only. */
function wordsBefore(text: string, index: number): string[] {
  const words: string[] = [];
  let end = index;
  while (words.length < 2) {
    let gap = end;
    while (gap > 0 && /\s/.test(text[gap - 1])) gap--;
    if (gap === end) break;
    let wordStart = gap;
    while (wordStart > 0 && /[\p{L}'’-]/u.test(text[wordStart - 1])) wordStart--;
    if (wordStart === gap) break;
    words.unshift(text.slice(wordStart, gap).toLowerCase());
    end = wordStart;
  }
  return words;
}

/** True when `index` opens a sentence: nothing before it but spaces, quote marks, and brackets, back to a sentence end. */
function startsSentence(text: string, index: number): boolean {
  let at = index;
  while (at > 0 && /[\s"'“‘(\[]/.test(text[at - 1])) at--;
  return at === 0 || /[.!?…]/.test(text[at - 1]);
}

/** True when the lowercase "god" at `index` names God and is a slip for "God". */
function isLowercaseGodSlip(text: string, index: number): boolean {
  const after = text.slice(index + 3, index + 83);
  if (GOD_COMPOUND.test(after)) return true;
  const [previous, before] = wordsBefore(text, index).reverse();
  if (previous === undefined) return startsSentence(text, index);
  if (GOD_NAME_PRECEDERS.has(previous)) return true;
  if (previous === 'that') return before !== undefined;
  if (previous === 'the') return GOD_OF_NAME.test(after);
  return GOD_POSSESSIVES.has(previous) && before === 'lord';
}

/** The text with each lowercase "god" that names God capitalized. */
export function capitalizeGodSlips(text: string): string {
  return text.replace(LOWERCASE_GOD_REGEX, (word: string, index: number) => (isLowercaseGodSlip(text, index) ? 'God' : word));
}
