import fs from 'node:fs';
import path from 'node:path';

/**
 * Contract tests for PR4 (UI de-slop) onboarding-lane items #17, #18, #27.
 * These assert on source strings (matching the repo's existing
 * onboarding-selection-styles.test.ts pattern) because the components pull in
 * Skia/Reanimated and are not cheaply renderable under jest.
 */

const repoRoot = path.join(__dirname, '../../../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

describe('PR4 onboarding de-slop', () => {
  describe('#17 — one advance-affordance language', () => {
    const source = readSource('src/app/onboarding.tsx');

    it('renders the top-right advance control as an accent-filled primary pill (not grey chrome)', () => {
      // The single primary-advance vocabulary: an accent-filled pill with
      // light text, gated on shouldShowOnboardingTopContinue.
      const block = source.slice(
        source.indexOf('shouldShowOnboardingTopContinue({ canProceed: canProceed()'),
      );
      const advanceControl = block.slice(0, block.indexOf('<View style={{ width: 40, height: 40 }} />'));

      expect(advanceControl).toContain('backgroundColor: colors.accent');
      expect(advanceControl).toContain('color: colors.background');
      expect(advanceControl).toContain('accessibilityRole="button"');
      // It must still be one control that says Continue / Create.
      expect(advanceControl).toContain("{isLastStep ? 'Create' : 'Continue'}");
    });

    it('keeps the cinematic "tap anywhere" affordance intact (brief §4 #5)', () => {
      expect(source).toContain('Tap anywhere to continue');
    });
  });

  describe('#18 — one selection-state vocabulary', () => {
    const source = readSource('src/app/onboarding.tsx');

    it('uses a single accent tint for selected option surfaces (aligned with chips at 0.18)', () => {
      expect(source).toContain('const selectedAccentSurface = (accent: string, opacity = 0.18)');
    });

    it('turns selected option-card titles to the accent (accent border + tinted fill + accent text)', () => {
      // Every selected option title resolves to colors.accent.
      expect(source).toContain('color: isSelected ? colors.accent : colors.text }}>{opt.label}');
      expect(source).toContain('color: isSelected ? colors.accent : colors.text }}>{type.name}');
      expect(source).toContain('color: isSelected ? colors.accent : colors.text }}>{subject.name}');
      expect(source).toContain('color: isSelected ? colors.accent : colors.text }}>{option.label}');
      expect(source).toContain('color: isSelected ? colors.accent : colors.text }} numberOfLines={1}>{char.name}');
      // No selected option title is left on the neutral text color.
      expect(source).not.toContain('color: colors.text }}>{opt.label}');
    });

    it('keeps chip controls on accent text + accent border when selected', () => {
      const multiSelect = readSource('src/components/onboarding/MultiSelectPills.tsx');
      expect(multiSelect).toContain('color: isSelected ? colors.accent : colors.text');
    });
  });

  describe('#27 — honest trust surfaces', () => {
    it('labels the GrowthGraph curve as explicitly illustrative, not real growth data', () => {
      const graph = readSource('src/components/onboarding/GrowthGraph.tsx');
      expect(graph).toContain('Illustrative');
      // The old factual-sounding label must be gone.
      expect(graph).not.toContain('>\n        How personal your devotionals become\n');
    });

    it('cuts the unanchored fabricated-testimonial social proof component', () => {
      expect(exists('src/components/onboarding/SocialProofCards.tsx')).toBe(false);
      // And nothing imports it.
      const appDir = path.join(repoRoot, 'src');
      const found = fs
        .readdirSync(appDir, { recursive: true })
        .some((entry) => String(entry).endsWith('SocialProofCards.tsx'));
      expect(found).toBe(false);
    });
  });
});
