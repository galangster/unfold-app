import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('writing font preference source contract', () => {
  it('scales the full journal writing inputs with the reader font-size preference', () => {
    const source = readSource('src/app/(tabs)/(today)/journal.tsx');

    expect(source).toContain("from '@/lib/reflection-typography'");
    expect(source).toContain('const user = useUnfoldStore((s) => s.user);');
    expect(source).toContain("const fontSize = user?.fontSize ?? 'medium';");
    expect(source).toContain('const typography = getReflectionTypography(fontSize);');
    expect(source.match(/fontSize:\s*typography\.responseFontSize/g)).toHaveLength(4);
    expect(source.match(/lineHeight:\s*typography\.responseLineHeight/g)).toHaveLength(4);
  });

  it.each([
    'src/app/(tabs)/(journal)/note-detail.tsx',
    'src/components/notebook/NoteEditor.tsx',
  ])('builds notebook TipTap body CSS from the reader font-size preference in %s', (relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain("from '@/lib/reflection-typography'");
    expect(source).toContain('reflectionBodyPx(fontSize)');
    expect(source).toContain('font-size: ${bodyFontSize}px;');
    expect(source).toContain('const user = useUnfoldStore((s) => s.user);');
    expect(source).toContain("const fontSize = user?.fontSize ?? 'medium';");
  });
});
