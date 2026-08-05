import { readFileSync } from 'fs';
import * as path from 'path';

/**
 * Contract tests for PR4 (UI de-slop) chrome lane — items #20, #14b, #28.
 *
 * These assert on source strings (matching the repo's existing
 * library-deeplink-routing.test.ts / you-settings-dynamic-type-contract.test.ts
 * pattern) because the tab bar and My Library screens pull in
 * Reanimated / gesture-handler / BlurView and are not cheaply renderable
 * under jest.
 */

const sourceRoot = path.resolve(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

describe('PR4 chrome de-slop', () => {
  describe('#20 — tab bar no longer leaks the Complete Day pill glow', () => {
    const tabBar = readSource('app/(tabs)/_layout.tsx');

    it('paints an opaque theme-toned scrim under the chrome', () => {
      // A solid plane (derived from the user's theme background, never a fixed
      // hex) sits between the blur and the tab content to seal the glow.
      expect(tabBar).toContain('const TAB_BAR_SCRIM_OPACITY_DARK = 0.82;');
      expect(tabBar).toContain('const TAB_BAR_SCRIM_OPACITY_LIGHT = 0.86;');
      expect(tabBar).toContain(
        'backgroundColor: alpha(\n              colors.background,',
      );
      expect(tabBar).toContain(
        'isDark ? TAB_BAR_SCRIM_OPACITY_DARK : TAB_BAR_SCRIM_OPACITY_LIGHT,',
      );
    });

    it('uses a heavier blur on iOS', () => {
      // Bumped from 90 → 100 so the frosted layer itself diffuses the glow.
      expect(tabBar).toContain('intensity={100}');
      expect(tabBar).not.toContain('intensity={90}');
    });

    it('keeps a hairline top border so the glow has a hard edge to stop at', () => {
      expect(tabBar).toContain('height: StyleSheet.hairlineWidth,');
      // Routed through the text-tint token (alpha(colors.text, 0.10)) instead
      // of hardcoded white/black rgba — same 0.10 opacity in both themes,
      // since colors.text already resolves to warm off-white/off-black.
      expect(tabBar).toContain('backgroundColor: alpha(colors.text, 0.10),');
    });

    it('derives the scrim from the accent-aware theme token, not a hardcoded gold hex', () => {
      // Personalization must follow through — the scrim is colors.background,
      // not a warm-gold literal that would ignore Ocean/Rose/etc.
      const scrimBlock = tabBar.slice(
        tabBar.indexOf('Opaque scrim under the chrome'),
        tabBar.indexOf('Hairline top border'),
      );
      expect(scrimBlock).toContain('alpha(');
      expect(scrimBlock).toContain('colors.background');
      expect(scrimBlock).not.toMatch(/#[0-9A-Fa-f]{6}/);
    });
  });

  describe('#14b — tab labels never split mid-word under Dynamic Type', () => {
    const tabBar = readSource('app/(tabs)/_layout.tsx');

    it('caps the label scale and truncates at a word boundary', () => {
      expect(tabBar).toContain('const TAB_LABEL_MAX_SCALE = 1.2;');
      // The single tab-label <Text> must be single-line + capped so "Companion"
      // truncates rather than hard-clipping to "Compani".
      expect(tabBar).toContain('numberOfLines={1}');
      expect(tabBar).toContain('maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}');
    });
  });
});

describe('PR4 My Library de-slop (#28)', () => {
  const library = readSource('app/(tabs)/(you)/my-content.tsx');

  describe('duplicated taxonomy removed', () => {
    it('renames the mixed notes+highlights tab to "Saved" so it no longer collides with the in-tab "Highlights" chip', () => {
      // The TAB (which holds notes + highlights, count = saved.count.all) is
      // now labeled "Saved", not "Highlights".
      expect(library).toContain("{ id: 'highlights', label: 'Saved', count: saved.count.all }");
      expect(library).not.toContain("{ id: 'highlights', label: 'Highlights', count: saved.count.all }");
      // "Highlights" survives exactly once, as the type filter CHIP
      // (count = saved.count.highlights).
      expect(library).toContain("{ id: 'highlights', label: 'Highlights', count: saved.count.highlights }");
      // Exactly one display-label of "Highlights" remains anywhere in the surface.
      expect((library.match(/label: 'Highlights'/g) ?? []).length).toBe(1);
    });

    it('keeps the tab id (and therefore deep-link routing) unchanged', () => {
      // ?tab=highlights still resolves; only the display label moved.
      expect(library).toContain("const VALID_TABS: Tab[] = ['journal', 'highlights', 'bookmarks'];");
    });
  });

  describe('empty-state CTA anatomy unified to the quality bar', () => {
    it('routes every empty state through the shared EmptyState component (no bespoke inline empty view)', () => {
      // The Journal tab previously hand-rolled its own empty view with an
      // outline-button CTA; it now uses the shared component.
      expect(library).toContain('<EmptyState');
      expect(library).not.toContain('Start Your First Entry CTA');
    });

    it('renders the primary CTA as a filled-accent pill with light text (matches the Notebook ghost-note bar)', () => {
      const emptyStateImpl = library.slice(library.indexOf('function EmptyState('));
      // Filled accent surface, light text on it, accent-colored shadow.
      expect(emptyStateImpl).toContain('backgroundColor: colors.accent,');
      expect(emptyStateImpl).toContain('color: colors.background,');
      expect(emptyStateImpl).toContain('shadowColor: colors.accent,');
      expect(emptyStateImpl).toContain('accessibilityRole="button"');
      // The old outline-button anatomy (transparent fill + accent border) is gone.
      expect(library).not.toContain("backgroundColor: 'transparent',\n                    opacity: 1,");
    });

    it('gives the Journal empty state a working CTA via the shared anatomy', () => {
      expect(library).toContain("label: 'Start your first entry',");
      expect(library).toContain("pathname: '/(tabs)/(today)/journal',");
    });

    it('matches the quality-bar icon treatment (accent, light weight, dimmed)', () => {
      const emptyStateImpl = library.slice(library.indexOf('function EmptyState('));
      expect(emptyStateImpl).toContain('<Icon size={28} color={colors.accent} weight="light" style={{ opacity: 0.5 }} />');
    });

    it('keeps empty-state headlines in the display-serif quiet-period voice', () => {
      expect(library).toContain('title="No journal entries yet."');
      expect(library).toContain('title="No highlights yet."');
      expect(library).toContain('title="No bookmarks yet."');
    });
  });
});
