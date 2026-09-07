import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../../app/index.tsx'), 'utf8');
const welcomeCta = src.slice(src.indexOf('{/* Welcome button */}'), src.indexOf('{/* Cutscene button */}'));

describe('VA-3 Welcome CTA button role', () => {
  it('keeps Let\'s get started as a button with its current name', () => {
    expect(welcomeCta).toContain('onPress={handleContinue}');
    expect(welcomeCta).toContain('accessibilityRole="button"');
    expect(welcomeCta).toContain("Let's get started.");
    expect(welcomeCta).not.toContain('accessibilityLabel');
  });
});
