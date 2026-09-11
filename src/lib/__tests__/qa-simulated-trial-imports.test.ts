import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const ALLOWED = new Set([
  'components/settings/QaToolsSection.tsx',
  'components/onboarding/ThreeStepPaywall.tsx',
  'app/dev/trial-series.tsx',
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

describe('L2 P6 qa-simulated-trial importers', () => {
  it('allows only the three named production importers', () => {
    const importers = walk(SRC).filter((file) => {
      const rel = path.relative(SRC, file);
      if (rel === 'lib/qa-simulated-trial.ts') return false;
      const source = fs.readFileSync(file, 'utf8');
      return /from ['"][^'"]*qa-simulated-trial['"]/.test(source)
        || /require\(['"][^'"]*qa-simulated-trial['"]\)/.test(source);
    }).map((file) => path.relative(SRC, file).replace(/\\/g, '/'));

    expect(importers.every((file) => ALLOWED.has(file))).toBe(true);
    expect(importers.filter((file) => !ALLOWED.has(file))).toEqual([]);
  });
});
