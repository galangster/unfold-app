/**
 * Streaming paragraph splitter (WR-18).
 *
 * While a companion reply streams, everything before the LAST blank-line
 * boundary is a set of completed paragraphs: the rich block renderer's
 * paragraph pre-processing is line/paragraph-local, so parsing that prefix now
 * yields exactly the blocks the final render will produce. Rendering the
 * prefix through the real block renderer confines the end-of-stream reflow to
 * the trailing partial paragraph.
 *
 * Dependency-free (companion-limits.ts precedent).
 */
export function splitStreamingParagraphs(content: string): {
  stable: string;
  tail: string;
} {
  const boundary = content.lastIndexOf('\n\n');
  if (boundary === -1) {
    return { stable: '', tail: content };
  }

  // Consume the entire newline run in both directions: the stable prefix must
  // not end with blank lines and the tail must not start with them (either
  // would render as an empty paragraph).
  let stableEnd = boundary;
  while (stableEnd > 0 && content[stableEnd - 1] === '\n') {
    stableEnd -= 1;
  }
  let tailStart = boundary;
  while (tailStart < content.length && content[tailStart] === '\n') {
    tailStart += 1;
  }

  return {
    stable: content.slice(0, stableEnd),
    tail: content.slice(tailStart),
  };
}
