/**
 * WR-07 regression: reflections search must RENDER filteredEntries.
 * The original bug: filteredEntries was computed but never consumed —
 * searching on the Reflections segment changed nothing on screen.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(__dirname, '../../app/(tabs)/(journal)/index.tsx'),
  'utf8',
);

describe('journal reflections search contract (WR-07)', () => {
  it('renders filteredEntries when searching on the reflections segment', () => {
    expect(source).toContain("const isSearchingReflections = activeSegment === 'reflections' && searchQuery.trim().length > 0;");
    expect(source).toContain('{isSearchingReflections && (');
    expect(source).toContain('filteredEntries.map((entry)');
    expect(source).toContain('No entries match');
  });

  it('hides the browse sections while searching', () => {
    const gates = source.match(/\{!isSearchingReflections && /g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(3);
  });

  it('search results navigate to the journal detail for the entry', () => {
    const results = source.split('{isSearchingReflections && (')[1] ?? '';
    expect(results).toContain("pathname: '/(tabs)/(today)/journal-detail'");
    expect(results).toContain('params: { entryId: entry.id }');
  });
});
