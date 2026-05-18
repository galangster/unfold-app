import { readFileSync } from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('My Library devotional deep-link routing', () => {
  it('passes bookmarkId from My Library bookmarks into the devotional reader', () => {
    const source = readSource('app/(tabs)/(you)/my-content.tsx');

    expect(source).toContain('bookmarkId: bookmark.id');
  });

  it('the devotional reader resolves target bookmarks and passes them into reader content', () => {
    const source = readSource('app/(tabs)/(today)/reading.tsx');

    expect(source).toContain('bookmarkId?: string');
    expect(source).toContain('const targetBookmark = useMemo');
    expect(source).toContain('targetBookmark={targetBookmark}');
  });
});
