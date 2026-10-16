import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readerSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(bible)/reader.tsx'),
  'utf8',
);

// iOS can paint larger Dynamic Type glyphs before a native Text host
// invalidates its measured bounds. In the Bible reader that dropped the last
// line of a verse ("...the way of the wicked will" with "perish." missing) when
// the system text size changed while the app stayed open. Jest cannot lay out
// native text, so these checks only guard the keys that make a new host
// re-measure.
describe('Bible reader live Dynamic Type contract', () => {
  it('keys each verse text host and its section heading on the system fontScale', () => {
    expect(readerSource).toMatch(/<Text\s+key=\{fontScale\}\s+onTextLayout=\{handleTextLayout\}/);
    expect(readerSource).toMatch(/<Text key=\{fontScale\} style=\{\[\s*styles\.sectionHeading/);
  });

  it('hands every row the live fontScale as a primitive prop so the row memo still holds', () => {
    expect(readerSource).toContain('fontScale={adaptiveLayout.fontScale}');
    expect(readerSource).toMatch(/\n {2}fontScale: number;/);
    expect(readerSource).toMatch(/\n {2}fontFamily,\n {2}fontScale,\n/);
  });

  it('keys the end-of-chapter ornament and the next-chapter prompts too', () => {
    for (const name of ['end-marker', 'end-of-bible', 'next-chapter']) {
      expect(readerSource).toContain(`key={\`${name}-\${adaptiveLayout.fontScale}\`}`);
    }
  });
});
