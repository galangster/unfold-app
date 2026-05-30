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

  it('routes reader preference library rows directly into the correct highlights filters', () => {
    const devotionalReader = readSource('app/(tabs)/(today)/reading.tsx');
    const bibleReader = readSource('app/(tabs)/(bible)/reader.tsx');

    expect(devotionalReader).toContain("params: { tab: 'highlights', source: 'devotional', from: 'reader-settings' }");
    expect(bibleReader).toContain("params: { tab: 'highlights', source: 'bible', from: 'bible' }");
  });

  it('the library screen applies tab, type, and source params on focus', () => {
    const source = readSource('app/(tabs)/(you)/my-content.tsx');

    expect(source).toContain('useLocalSearchParams<{ tab?: string; source?: string; type?: string; from?: string }>()');
    expect(source).toContain('setActiveTab(params.tab as Tab);');
    expect(source).toContain('setHighlightSourceFilter(params.source as HighlightSourceFilter);');
    expect(source).toContain('setHighlightTypeFilter(params.type as HighlightTypeFilter);');
  });

  it('the devotional reader resolves target bookmarks and passes them into reader content', () => {
    const source = readSource('app/(tabs)/(today)/reading.tsx');

    expect(source).toContain('bookmarkId?: string');
    expect(source).toContain('const targetBookmark = useMemo');
    expect(source).toContain('targetBookmark={targetBookmark}');
  });
});
