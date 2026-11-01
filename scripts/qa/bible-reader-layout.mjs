import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = (value) => createHash('sha256').update(value).digest('hex');

export function checkBibleLayout(log, tag, minimumVerses = 1) {
  const rows = new Map();
  for (const line of log.split('\n')) {
    const match = line.match(/\[bible-(layout|frame)\] (\{.*\})$/);
    if (!match) continue;
    const value = JSON.parse(match[2]);
    if (value.tag !== tag) continue;
    const row = rows.get(value.verse) ?? {};
    row[match[1]] = value;
    rows.set(value.verse, row);
  }
  const failures = [];
  let checked = 0;
  for (const [verse, { layout, frame }] of rows) {
    if (!layout || !frame || !layout.lines.length) {
      failures.push({ verse, reason: 'Missing native frame or line report' });
      continue;
    }
    checked++;
    const lineHeight = layout.lines[0].height;
    const expectedLines = Math.round(frame.height / lineHeight);
    // TextKit can merge a missing final line into the previous line's glyph
    // range. Character completeness and accessibility labels still pass.
    if (layout.lines.length !== expectedLines) {
      failures.push({ verse, reason: 'TextKit lost a line', expectedLines, actualLines: layout.lines.length, height: frame.height });
    }
    if (layout.lines.some((line) => line.x + line.width > frame.width + 0.01 || line.y + line.height > frame.height + 0.01)) {
      failures.push({ verse, reason: 'Line exceeds its native frame' });
    }
  }
  if (checked < minimumVerses) failures.push({ reason: 'Incomplete chapter coverage', expected: minimumVerses, actual: checked });
  return { tag, checked, failures };
}

function instrument(reader, snapshot) {
  const original = readFileSync(reader, 'utf8');
  const anchor = '    const lines = e.nativeEvent.lines;';
  const textAnchor = '          onTextLayout={handleTextLayout}';
  if (original.includes('[bible-layout]') || !original.includes(anchor) || !original.includes(textAnchor)) throw new Error('Reader probe anchors differ; inspect the source before instrumenting');
  const instrumented = original.replace(anchor, `${anchor}
    if (__DEV__) console.log('[bible-layout]', JSON.stringify({tag:(globalThis as any).__bibleProbeTag ?? 'native',verse:verseNum,lines:lines?.map((l:any)=>({x:l.x,y:l.y,width:l.width,height:l.height}))}));`)
    .replace(textAnchor, `${textAnchor}
          onLayout={__DEV__ ? (e) => console.log('[bible-frame]', JSON.stringify({tag:(globalThis as any).__bibleProbeTag ?? 'native',verse:verseNum,...e.nativeEvent.layout})) : undefined}`);
  writeFileSync(snapshot, JSON.stringify({ original, instrumentedHash: hash(instrumented) }), { flag: 'wx' });
  writeFileSync(reader, instrumented);
}

function restore(reader, snapshot) {
  const { original, instrumentedHash } = JSON.parse(readFileSync(snapshot, 'utf8'));
  if (hash(readFileSync(reader, 'utf8')) !== instrumentedHash) throw new Error('Reader changed after instrumentation; restore the probe manually without losing those changes');
  writeFileSync(reader, original);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, first, second, third] = process.argv.slice(2);
  if (command === 'instrument') instrument(first, second);
  else if (command === 'restore') restore(first, second);
  else if (command === 'check') {
    const result = checkBibleLayout(readFileSync(first, 'utf8'), second ?? 'native', Number(third ?? 1));
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length) process.exitCode = 1;
  } else throw new Error('Usage: instrument READER SNAPSHOT | restore READER SNAPSHOT | check METRO_LOG TAG MIN_VERSES');
}
