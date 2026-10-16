/**
 * Capitalizes a lowercase "god" only where it can only be God.
 *
 * Ported from the backend repair (unfold-backend fef122a,
 * src/lib/generation/validator.ts: isLowercaseGodSlip) so the app's safety
 * net agrees with the server's. The app used to capitalize every \bgod\b,
 * which turned "a false god" into "a false God".
 *
 * A lowercase "god" from the model is almost always an idol or a god in
 * general: "a pagan god", "Which god are you serving?", "a kind of god",
 * "savior and god". The model capitalizes God when it means God, and a wrong
 * capital turns an idol into God, while a missed slip reads as a typo. So the
 * repair leaves the model's casing alone except where "god" can only be God:
 * - at the start of a sentence, where any word takes a capital;
 * - right after "Lord" or "LORD" as written ("the Lord god", "the LORD god
 *   of hosts"), or after a possessive that follows it ("the Lord your god",
 *   "O LORD, my god");
 * - in "the god of" Israel, Abraham, Isaac, Jacob, all comfort, all grace,
 *   love and peace, or heaven and earth;
 * - in a compound such as "God-given" or "God-fearing".
 * "god's" follows the same rules.
 */

const LOWERCASE_GOD_REGEX = /\bgod\b(?!\s*(?:s|less|awful|forsaken|damn|speed|father|mother|child|send|given|fearing)\b)/g;

const GOD_COMPOUND = /^-(?:given|fearing|shaped|breathed|honou?ring|cent(?:ered|red)|sized|ordained|sent|glorifying|inspired)\b/i;
const GOD_OF_NAME =
  /^\s+of\s+(?:Israel|Abraham|Isaac|Jacob|all\s+(?:comfort|grace)|love\s+and\s+peace|heaven\s+and\s+earth)\b/i;
/** "Lord" as written, with an optional possessive after it, right before "god". */
const AFTER_LORD = /\b(?:Lord|LORD)(?:,?\s+(?:my|your|his|her|its|our|their|thy|thine))?,?\s+$/;
/** Quote marks and brackets, which never end a sentence. */
const QUOTE_OR_BRACKET = /["'“”‘’()[\]]/;

/** True when `index` opens a sentence: nothing before it but spaces, quote marks, and brackets, back to a sentence end. */
function startsSentence(text: string, index: number): boolean {
  let at = index;
  while (at > 0 && (/\s/.test(text[at - 1]) || QUOTE_OR_BRACKET.test(text[at - 1]))) at--;
  return at === 0 || /[.!?…]/.test(text[at - 1]);
}

/** True when the lowercase "god" at `index` can only be God and is a slip for "God". */
function isLowercaseGodSlip(text: string, index: number): boolean {
  const after = text.slice(index + 3, index + 83);
  if (GOD_COMPOUND.test(after)) return true;
  if (startsSentence(text, index)) return true;
  const before = text.slice(Math.max(0, index - 24), index);
  if (AFTER_LORD.test(before)) return true;
  return /\bthe\s+$/i.test(before) && GOD_OF_NAME.test(after);
}

/** The text with each lowercase "god" that can only be God capitalized. */
export function capitalizeGodSlips(text: string): string {
  return text.replace(LOWERCASE_GOD_REGEX, (word: string, index: number) => (isLowercaseGodSlip(text, index) ? 'God' : word));
}
