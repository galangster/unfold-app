/**
 * How the reader compares a bookmark's words with the devotional text. The
 * page finds them with READER_WORDS_PAGE_JS, its copy of this rule, which
 * locateTextInArticle runs over the article's text nodes. A test runs both
 * copies on the same inputs.
 *
 * - `*` drops out: a markdown emphasis mark, which the page shows as emphasis.
 * - Each run of white space is one space, and the ends are trimmed.
 * - Case is ignored: each UTF-16 unit folds to lower case on its own, so the
 *   page can map every folded character back to its place in a text node.
 */

/** One character as the reader compares it: '' when it drops out, ' ' for
 *  white space, else the character in lower case. */
export function readerChar(c: string): string {
  if (c === '*') return '';
  return /\s/.test(c) ? ' ' : c.toLowerCase();
}

export function readerWords(value: string | null | undefined): string {
  const text = value ?? '';
  let words = '';
  for (let i = 0; i < text.length; i++) {
    const c = readerChar(text.charAt(i));
    if (c === ' ' && (words === '' || words.endsWith(' '))) continue;
    words += c;
  }
  return words.endsWith(' ') ? words.slice(0, -1) : words;
}

/** Whether `text` holds the words, compared the way the reader compares them. */
export function textContainsWords(text: string | null | undefined, words: string | null | undefined): boolean {
  const needle = readerWords(words);
  return needle.length > 0 && readerWords(text).includes(needle);
}

/** The page's copy of readerChar and readerWords: the same steps in the
 *  JavaScript the WebView runs. */
export const READER_WORDS_PAGE_JS = `
      function readerChar(c) {
        if (c === '*') return '';
        return /\\s/.test(c) ? ' ' : c.toLowerCase();
      }

      function readerWords(value) {
        var text = value == null ? '' : String(value);
        var words = '';
        for (var i = 0; i < text.length; i++) {
          var c = readerChar(text.charAt(i));
          if (c === ' ' && (words === '' || words.charAt(words.length - 1) === ' ')) continue;
          words += c;
        }
        return words.charAt(words.length - 1) === ' ' ? words.slice(0, -1) : words;
      }
`;
