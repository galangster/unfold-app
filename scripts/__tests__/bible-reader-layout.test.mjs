import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBibleLayout } from '../qa/bible-reader-layout.mjs';

function reports(height, lines) {
  return `[bible-frame] ${JSON.stringify({ tag: 'revelation', verse: 11, width: 376, height })}\n[bible-layout] ${JSON.stringify({ tag: 'revelation', verse: 11, lines: lines.map((width, index) => ({ x: 0, y: index * 36, height: 36, width })) })}`;
}

test('rejects the observed native clipping even though the glyph ranges contain all characters', () => {
  const result = checkBibleLayout(reports(143.9998779296875, [363.5434765625, 362.15, 376]), 'revelation');
  assert.deepEqual(result.failures, [{ verse: 11, reason: 'TextKit lost a line', expectedLines: 4, actualLines: 3, height: 143.9998779296875 }]);
});

test('accepts the same verse after all four native line fragments fit', () => {
  assert.deepEqual(checkBibleLayout(reports(144.333251953125, [363.5434765625, 362.15, 370.28, 360.96]), 'revelation').failures, []);
});

test('refuses a pass from missing reports or incomplete chapter coverage', () => {
  assert.equal(checkBibleLayout('', 'revelation', 21).failures.length, 1);
  assert.ok(checkBibleLayout(reports(144.333251953125, [363.54, 362.15, 370.28, 360.96]), 'revelation', 21).failures.length);
});
