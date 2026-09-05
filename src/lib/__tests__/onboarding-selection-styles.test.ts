import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '../../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

describe('onboarding selection styling', () => {
  it('keeps onboarding selected choices bright instead of neutral pressed/dim surfaces', () => {
    const source = readSource('src/app/onboarding.tsx');

    expect(source).toContain('selectedAccentSurface(colors.accent)');
    expect(source).toContain('borderColor: isSelected ? colors.accent : colors.border');
    expect(source).not.toContain('colors.buttonBackgroundPressed');
    expect(source).not.toContain('colors.borderFocused');
    expect(source).not.toContain('activeOpacity={0.7}');
  });

  // Same rule as WR-21: the cap caption is the only sighted explanation for
  // the locked key-people chips, so it must not sit at hint-level contrast
  // (2.0:1 dark, 2.5:1 light) or at 12pt.
  it('prints the key-people cap caption at readable muted contrast', () => {
    const source = readSource('src/app/onboarding.tsx');
    const captionStart = source.indexOf('{capMessage && (');
    const captionEnd = source.indexOf('{capMessage}', captionStart);
    expect(captionStart).toBeGreaterThan(-1);
    expect(captionEnd).toBeGreaterThan(captionStart);
    const caption = source.slice(captionStart, captionEnd);

    expect(caption).toContain('color: colors.textMuted');
    expect(caption).not.toContain('colors.textHint');
    expect(caption).toContain('fontSize: FontSize.sm');
    expect(caption).not.toContain('FontSize.xs');
  });

  it('keeps onboarding chips on full-bright accent styling when selected', () => {
    const multiSelectSource = readSource('src/components/onboarding/MultiSelectPills.tsx');

    expect(multiSelectSource).toContain('backgroundColor: isSelected ? alpha(colors.accent, 0.18)');
    expect(multiSelectSource).toContain('borderColor: isSelected ? colors.accent : colors.border');
  });

  it('keeps paywall plan selection from dimming and exposes only a QA-gated onboarding bypass', () => {
    const paywallSource = readSource('src/app/paywall.tsx');
    const threeStepPaywallSource = readSource('src/components/onboarding/ThreeStepPaywall.tsx');

    expect(paywallSource).toContain('backgroundColor: selectedPlan === \'yearly\' ? alpha(colors.accent, 0.16)');
    expect(paywallSource).toContain('backgroundColor: selectedPlan === \'monthly\' ? alpha(colors.accent, 0.16)');
    expect(threeStepPaywallSource).toContain('backgroundColor: selectedPlan === \'yearly\'');
    expect(threeStepPaywallSource).toContain('? alpha(colors.accent, 0.16)');
    expect(threeStepPaywallSource).toContain('isQaToolsEnabled() && currentPage === totalPages - 1');
    expect(threeStepPaywallSource).toContain('Continue for QA');
    expect(threeStepPaywallSource).toContain('onSkip();');
  });
});
