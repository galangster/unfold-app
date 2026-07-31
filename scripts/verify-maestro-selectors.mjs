#!/usr/bin/env node
/**
 * Verify that every `id:` selector used by a Maestro flow corresponds to a
 * testID that actually exists in src/.
 *
 * Why this exists: the .maestro flows rotted into fiction — they referenced
 * `back-button`, `book-navigator`, `companion-button`, `chat-input` and
 * `send-button`, none of which were ever in the codebase. Combined with
 * `optional: true` on nearly every step, the suite passed unconditionally
 * while testing nothing. A simulator is needed to RUN the flows, but this
 * check catches dead selectors on any machine, so CI can hold the line.
 *
 * Exits non-zero if a flow points at a selector that no longer exists.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const FLOWS = join(ROOT, '.maestro');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** testIDs defined in source: exact strings, plus prefixes of template literals. */
function collectTestIds() {
  const exact = new Set();
  const prefixes = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    // testID="foo" / testID='foo'
    for (const m of text.matchAll(/testID=["']([^"']+)["']/g)) exact.add(m[1]);
    // testID={`foo-${...}`} → treat "foo-" as a valid prefix
    for (const m of text.matchAll(/testID=\{`([^`]*)`\}/g)) {
      const literal = m[1];
      if (literal.includes('${')) prefixes.push(literal.slice(0, literal.indexOf('${')));
      else exact.add(literal);
    }
    // testID={'foo'} / testID={"foo"}
    for (const m of text.matchAll(/testID=\{\s*["']([^"']+)["']\s*\}/g)) exact.add(m[1]);
    // props.testID ?? 'foo'  — default testIDs on shared primitives
    for (const m of text.matchAll(/testID\s*(?:\?\?|\|\|)\s*["']([^"']+)["']/g)) exact.add(m[1]);
  }
  return { exact, prefixes };
}

/** `id:` selectors referenced by flows, with the file and line for reporting. */
function collectFlowSelectors() {
  const refs = [];
  let optionalCount = 0;
  let flowFiles = [];
  try {
    flowFiles = readdirSync(FLOWS).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    return { refs, optionalCount, flowFiles };
  }
  for (const name of flowFiles) {
    const file = join(FLOWS, name);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*optional:\s*true\s*$/.test(line)) optionalCount += 1;
      // `id: "foo"`, `id: foo`, and inline `tapOn: { id: "foo" }`
      const m = line.match(/\bid:\s*["']?([A-Za-z0-9_.:-]+)["']?/);
      if (m) refs.push({ id: m[1], file: relative(ROOT, file), line: i + 1 });
    });
  }
  return { refs, optionalCount, flowFiles };
}

const { exact, prefixes } = collectTestIds();
const { refs, optionalCount, flowFiles } = collectFlowSelectors();

if (flowFiles.length === 0) {
  console.log('[maestro] no flows found in .maestro/ — nothing to verify');
  process.exit(0);
}

const missing = refs.filter(
  (r) => !exact.has(r.id) && !prefixes.some((p) => p && r.id.startsWith(p)),
);

console.log(
  `[maestro] ${flowFiles.length} flow(s), ${refs.length} id selector(s), ` +
    `${exact.size} testIDs in src (+${prefixes.length} templated), ` +
    `${optionalCount} optional step(s)`,
);

if (missing.length > 0) {
  console.error('\n[maestro] FAIL — selectors with no matching testID in src/:\n');
  for (const m of missing) console.error(`  ${m.file}:${m.line}  id: "${m.id}"`);
  console.error(
    '\nAdd the testID to the component, or fix the flow. A selector that does not\n' +
      'exist makes the step a silent no-op and the flow worthless.\n',
  );
  process.exit(1);
}

console.log('[maestro] OK — every flow selector resolves to a testID in src/');
