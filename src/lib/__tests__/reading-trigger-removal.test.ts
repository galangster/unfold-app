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

  it('guards legacy direct continuation away from canonical/progressive devotionals', () => {
    expect(readingSource).toContain('shouldUseLegacyDirectContinuation(currentDevotional)');
    expect(readingSource).toContain('legacy-continuation-skipped-canonical');
  });

  it('routes missing canonical/progressive days through job recovery instead of direct generation', () => {
    expect(readingSource).toContain('isCanonicalProgressiveDevotional(currentDevotional)');
    expect(readingSource).toContain('recovered-missing-day-from-completed-job');
    expect(readingSource).toContain('queued-missing-day-canonical-job');
  });

  it('routes visible reader content through the canonical render selector', () => {
    expect(readingSource).toContain('selectRenderableDevotionalDay(currentDevotional, viewingDay)');
    expect(readingSource).not.toContain('const currentDayData = currentDevotional?.days.find((d) => d.dayNumber === viewingDay)');
  });

  it('routes reader navigation and tomorrow preview through canonical day helpers', () => {
    expect(readingSource).toContain('getHighestContiguousRenderableDayNumber(currentDevotional)');
    expect(readingSource).toContain('selectNextRenderableDevotionalDay(currentDevotional, viewingDay)');
    expect(readingSource).not.toContain('const availableDays = currentDevotional?.days.length ?? 0');
    expect(readingSource).not.toContain('currentDevotional.days.find((d) => d.dayNumber === viewingDay + 1)');
  });

  it('advances local currentDay when the reader completes the current day', () => {
    expect(readingSource).toContain('const advanceDay = useUnfoldStore((s) => s.advanceDay);');
    expect(readingSource).toContain('currentDevotional?.currentDay === viewingDay');
    expect(readingSource).toContain('advanceDay(currentDevotionalId);');
  });

  it('does not use mutable user devotionalLength to extend a server-owned series completion boundary', () => {
    expect(readingSource).not.toContain('Math.max(totalDays, user?.devotionalLength ?? totalDays)');
    expect(readingSource).not.toContain('Math.max(currentDevotional.totalDays, user.devotionalLength)');
    expect(readingSource).not.toContain('Math.max(devoTotalDays, user.devotionalLength)');
  });

  it('replaces local-only days with recovered canonical job results', () => {
    expect(readingSource).toContain("updateDevotionalDays(currentDevotional.id, [recovered.devotionalDay], currentDevotional.title)");
    expect(readingSource).toContain("updateDevotionalDays(currentDevotional.id, [recoveredFromExisting.devotionalDay], currentDevotional.title)");
    expect(readingSource).not.toContain('addGeneratedDay(currentDevotional.id, recovered.devotionalDay)');
  });

  it('hydrates a missing server-created series before showing the no-series fallback', () => {
    expect(readingSource).toContain('missingDevotionalHydrationAttemptRef');
    expect(readingSource).toContain('pullDevotionalContent(devotionalId)');
    expect(readingSource).toContain('hydrated-missing-devotional-from-sync-pull');
    expect(readingSource).toContain('Loading series…');
  });
});
