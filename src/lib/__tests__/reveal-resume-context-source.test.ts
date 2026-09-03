import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const revealSource = readFileSync(join(__dirname, '../../app/reveal.tsx'), 'utf8');

/**
 * The reveal screen's own guard (P3-4) is that everything the store learns
 * comes from `revealTarget` — params resolved against a local devotional —
 * never from the raw route params. `dayTitle` was the one leak: it fell back
 * to the raw param whenever the resolved day had no local title, and the
 * resume context is persisted and rendered on the Today card. The native
 * allowlist bounds that param to 200 chars, but web has no native-intent hook
 * at all. Rendering the screen means standing up reanimated, gesture-handler
 * and the router, so this asserts the wiring at source level, the way
 * reading-swipe-navigation-source.test.ts does.
 */
describe('reveal resume-context source contract', () => {
  const resumeContextBlock = revealSource.match(/setResumeContext\(\{[\s\S]{0,900}?\}\);/)?.[0] ?? '';

  it('has a setResumeContext call to check', () => {
    expect(resumeContextBlock).toContain('route:');
  });

  it('writes only values resolved against the local devotional', () => {
    // The route params, exactly as reveal.tsx destructures them.
    const rawParams = ['devotionalId', 'dayNumber', 'seriesTitle', 'dayTitle', 'totalDays'];
    const assignments = resumeContextBlock
      .split('\n')
      .filter((line) => /^\s*\w+:/.test(line))
      .map((line) => line.trim());

    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) {
      // Keys share their names with the params, so check the VALUE only:
      // drop the resolved fields, and no raw param may remain — neither as
      // the value itself nor as a `??` fallback behind one.
      const value = assignment.slice(assignment.indexOf(':') + 1).replace(/revealTarget\.\w+/g, '');
      for (const param of rawParams) {
        expect({ assignment, leaked: new RegExp(`\\b${param}\\b`).test(value) }).toEqual({
          assignment,
          leaked: false,
        });
      }
    }
  });

  it('never falls back to the raw dayTitle param', () => {
    expect(resumeContextBlock).toContain('dayTitle: revealTarget.dayTitle');
    expect(resumeContextBlock).not.toMatch(/dayTitle:\s*revealTarget\.dayTitle\s*\?\?\s*dayTitle/);
  });
});
