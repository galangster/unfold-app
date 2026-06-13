import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '../../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

// PR4 Tier-2/3 — Bible search empty state (#24) + single-accent book chips (#25)

describe('Bible search empty state (#24)', () => {
  const source = readSource('src/app/(tabs)/(bible)/search.tsx');

  it('replaces the bare grey hint/no-results text with a designed empty-state component', () => {
    expect(source).toContain('function SearchEmptyState');
    // The old undesigned fallbacks must be gone.
    expect(source).not.toContain('hintText');
    expect(source).not.toContain('No results found for');
    expect(source).not.toContain('Search for a word, phrase, or topic');
  });

  it('matches the Companion/Notebook quality bar: serif headline + warm body copy', () => {
    expect(source).toContain('fontFamily: FontFamily.display');
    expect(source).toContain('color: colors.textMuted'); // warm body subtext, not grey default
    expect(source).toContain("Search the Scriptures");
    expect(source).toContain('Nothing turned up');
  });

  it('uses a soft accent icon treatment, never a hardcoded gold hex', () => {
    expect(source).toContain('alpha(colors.accent, 0.15)');
    expect(source).toContain('BookOpenTextIcon');
    expect(source).toContain('color={colors.accent}');
    // accent discipline — no hardcoded warm-gold hexes leaked into this surface
    expect(source).not.toMatch(/#[Cc]8[Aa]55[Cc]/);
    expect(source).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it('offers a clear next action (suggested searches) in both prompt and no-results modes', () => {
    expect(source).toContain('SUGGESTED_SEARCHES');
    expect(source).toContain('onSuggest');
    expect(source).toContain('mode="prompt"');
    expect(source).toContain('mode="noResults"');
    expect(source).toContain('accessibilityLabel={`Search for ${term}`}');
  });
});

describe('Bible book chips — single accent, no rainbow (#25)', () => {
  const source = readSource('src/app/(tabs)/(bible)/index.tsx');

  it('removes the per-book rainbow color coding', () => {
    expect(source).not.toContain('getBookColor');
    expect(source).not.toContain('CATEGORY_COLORS');
    expect(source).not.toContain('bookColor');
  });

  it('codes book names neutral with a single selected accent state', () => {
    expect(source).toContain('color: isSelected ? colors.accent : colors.text');
    expect(source).toContain('selectedBook?.id === book.id');
    expect(source).toContain('accessibilityState={{ selected: isSelected }}');
  });

  it('keeps category labels neutral, never a hardcoded or per-category color', () => {
    expect(source).toContain('color: colors.textSubtle');
    expect(source).not.toMatch(/categoryLabel.*getBookColor/);
  });

  it('derives the selected chip fill from the accent token, not a fixed hex', () => {
    expect(source).toContain('alpha(colors.accent, 0.16)');
    expect(source).toContain('borderColor: isSelected ? colors.accent : \'transparent\'');
  });
});
