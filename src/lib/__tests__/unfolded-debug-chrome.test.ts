import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../app/unfolded.tsx'),
  'utf-8',
);

describe('unfolded recap ships without debug chrome', () => {
  it('has no debug border on the share button', () => {
    expect(src).not.toContain("borderColor: 'red'");
  });

  it('has no [UNFOLDED] debug logs (errors may remain)', () => {
    expect(src).not.toMatch(/logger\.log\('\[UNFOLDED\]/);
  });
});
