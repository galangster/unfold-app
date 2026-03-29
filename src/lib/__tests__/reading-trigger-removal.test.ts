/**
 * Regression test: verify that reading.tsx no longer calls any client-side
 * generation functions (triggerNextDayGeneration, generateArcExtension, etc.)
 * — all generation is now server-side via submitGenerationJob.
 *
 * This is a source code assertion test — it reads the file and checks for patterns.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('reading.tsx server-side generation migration', () => {
  const readingSource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
    'utf-8'
  );

  it('does NOT import triggerNextDayGeneration', () => {
    expect(readingSource).not.toContain("import { triggerNextDayGeneration");
    expect(readingSource).not.toContain("from '@/lib/progressive-generation'");
  });

  it('does NOT call triggerNextDayGeneration anywhere', () => {
    expect(readingSource).not.toContain('triggerNextDayGeneration(');
  });

  it('does NOT call generateArcExtension anywhere', () => {
    expect(readingSource).not.toContain('generateArcExtension(');
  });

  it('does NOT call evaluateSeriesExtension anywhere', () => {
    expect(readingSource).not.toContain('evaluateSeriesExtension(');
  });

  it('uses submitGenerationJob for progressive mode retry', () => {
    expect(readingSource).toContain('submitGenerationJob');
  });
});
