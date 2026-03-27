/**
 * Verify that the progressive generation prompt includes the expanded
 * quote selection directive — guiding the AI to draw from diverse voices
 * beyond just Christian theologians.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('quote selection directive', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../progressive-generation.ts'),
    'utf-8'
  );

  it('includes the QUOTE SELECTION section in the prompt builder', () => {
    expect(source).toContain('=== QUOTE SELECTION ===');
  });

  it('instructs to draw from diverse voices beyond theologians', () => {
    expect(source).toContain('poets, scientists, activists, philosophers');
  });

  it('includes tone filter guardrail', () => {
    expect(source).toContain('tone complements the devotional');
  });

  it('includes variety enforcement', () => {
    expect(source).toContain('Vary sources across days');
  });
});
