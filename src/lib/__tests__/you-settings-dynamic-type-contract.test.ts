import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(sourceRoot, 'app/(tabs)/(you)/index.tsx'), 'utf-8');

describe('You-tab settings rows Dynamic Type contract (RT-DYN-1/RT-DYN-2)', () => {
  it('defines the settings-row scale caps', () => {
    expect(src).toContain('const SETTINGS_LABEL_MAX_SCALE = 1.4;');
    expect(src).toContain('const SETTINGS_CHIP_MAX_SCALE = 1.2;');
  });

  it('caps both row labels and both chip groups', () => {
    expect((src.match(/maxFontSizeMultiplier=\{SETTINGS_LABEL_MAX_SCALE\}/g) ?? []).length).toBe(2);
    expect((src.match(/maxFontSizeMultiplier=\{SETTINGS_CHIP_MAX_SCALE\}/g) ?? []).length).toBe(2);
  });
});
