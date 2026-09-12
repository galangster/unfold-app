import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

const ISOLATED = [
  'lib/qa-method-readings.ts',
  'lib/qa-method-readings-route.ts',
  'lib/qa-method-reading-return.ts',
  'lib/qa-method-reading-notes.ts',
  'components/qa/QaMethodReadingsScreen.tsx',
  'components/bible/QaMethodReadingReturnBar.tsx',
  'app/qa-method-readings.tsx',
  'app/(tabs)/(bible)/_layout.tsx',
];

const STORE_TOUCH = /useUnfoldStore|scripturePracticeSessions|updateScripturePractice|setScripturePracticeReturn|markDayAsRead|journalEntries|recordMethodUsage/;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

describe('qa method readings isolation', () => {
  it('keeps sample state off the production store and JSON off un-gated seams', () => {
    for (const rel of ISOLATED) {
      const source = fs.readFileSync(path.join(SRC, rel), 'utf8');
      expect(source).not.toMatch(STORE_TOUCH);
    }

    const jsonImporters = walk(SRC).filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /from ['"][^'"]*qa-method-readings\.json['"]/.test(source);
    }).map((file) => path.relative(SRC, file).replace(/\\/g, '/'));

    expect(jsonImporters.filter((file) => !file.includes('/__tests__/'))).toEqual([
      'lib/qa-method-readings.ts',
    ]);

    const productionReturn = fs.readFileSync(path.join(SRC, 'components/bible/DevotionalReturnBar.tsx'), 'utf8');
    expect(productionReturn).not.toContain('qa-method-reading-return');
    expect(productionReturn).not.toContain('qa-method-readings');
  });
});
