import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');
const createFolderSheetSource = read('../../components/notebook/CreateFolderSheet.tsx');
const storeSource = read('../store.ts');

describe('folder color palette (de-slop PR4 #25)', () => {
  it('derives folder swatches from the brand ACCENT_THEMES, not hardcoded candy hexes', () => {
    expect(createFolderSheetSource).toContain("import { ACCENT_THEMES } from '@/lib/store'");
    expect(createFolderSheetSource).toContain(
      'const FOLDER_COLORS = ACCENT_THEMES.map((theme) => theme.dark);',
    );
  });

  it('no longer hardcodes the off-palette candy hex array', () => {
    expect(createFolderSheetSource).not.toContain("'#5B9BD5', // Ocean blue");
    expect(createFolderSheetSource).not.toMatch(/const FOLDER_COLORS = \[/);
  });

  it('the brand palette it reuses covers the full seven-accent set', () => {
    // Read the ACCENT_THEMES block from source (importing the store pulls in
    // native modules under jest, like the repo's other source-contract tests).
    const block = storeSource.slice(
      storeSource.indexOf('export const ACCENT_THEMES'),
      storeSource.indexOf('export const ACCENT_THEMES') + 600,
    );
    for (const id of ['gold', 'ocean', 'rose', 'forest', 'lavender', 'ember', 'slate']) {
      expect(block).toContain(`id: '${id}'`);
    }
  });
});
