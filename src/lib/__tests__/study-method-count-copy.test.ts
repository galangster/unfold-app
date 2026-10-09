import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_METHOD_IDS } from '@/constants/bible-study-methods';

const srcRoot = join(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

/** Every number written next to "study methods" in a source file. */
function claimedCounts(source: string): string[] {
  return [...source.matchAll(/(\d+\+?) (?:Bible )?(?:study )?methods/g)].map((match) => match[1]);
}

// 1.1.18 release smoke (F10): onboarding said "32 Bible study methods" and
// the paywall said "40+ study methods". The method registry holds 32.
describe('study method count copy', () => {
  it.each([
    ['onboarding feature carousel', 'app/how-it-works.tsx'],
    ['paywall', 'app/paywall.tsx'],
  ])('the %s states the number of methods in the registry', (_surface, file) => {
    const counts = claimedCounts(readSrc(file));

    expect(counts.length).toBeGreaterThan(0);
    for (const count of counts) {
      expect(count).toBe(String(ALL_METHOD_IDS.length));
    }
  });
});
