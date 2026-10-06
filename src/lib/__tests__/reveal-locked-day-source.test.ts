import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const revealSource = readFileSync(join(__dirname, '../../app/reveal.tsx'), 'utf8');

/**
 * The reveal screen reports a locked day before it sends the reader to Today.
 * Rendering the screen means standing up reanimated, gesture-handler and the
 * router, so this asserts the wiring at source level, the way
 * reveal-resume-context-source.test.ts does. It checks order, not text, so a
 * comment edit cannot break it.
 */
describe('reveal screen reports a locked day', () => {
  const lockedBranch = revealSource.indexOf("revealOutcome.kind === 'locked'");
  const report = revealSource.indexOf('reportReadyPushForLockedDay(revealOutcome.dayNumber)');
  const redirect = revealSource.indexOf("router.replace('/(tabs)/(today)')", lockedBranch);

  it('has the locked branch, the report and the redirect to check', () => {
    expect(lockedBranch).toBeGreaterThan(-1);
    expect(report).toBeGreaterThan(-1);
    expect(redirect).toBeGreaterThan(-1);
  });

  it('reports inside the locked branch, before the redirect', () => {
    expect(report).toBeGreaterThan(lockedBranch);
    expect(report).toBeLessThan(redirect);
  });
});
