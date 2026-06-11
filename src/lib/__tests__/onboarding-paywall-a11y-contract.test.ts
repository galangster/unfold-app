import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(sourceRoot, relativePath), 'utf-8');

describe('onboarding paywall accessibility contract', () => {
  const src = readSource('components/onboarding/ThreeStepPaywall.tsx');

  it('exposes the Monthly plan card as a radio with a price-bearing label', () => {
    expect(src).toContain('accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}');
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'monthly', checked: selectedPlan === 'monthly' }}");
  });

  it('exposes the Yearly plan card as a radio with price and savings in the label', () => {
    expect(src).toContain(
      "accessibilityLabel={`Yearly plan, ${yearlyPrice} per year${savings > 0 ? `, save ${savings} percent` : ''}`}",
    );
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'yearly', checked: selectedPlan === 'yearly' }}");
  });

  it('uses radio roles on both plan cards (paywall.tsx parity)', () => {
    const matches = src.match(/accessibilityRole="radio"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('hides the decorative SAVE badge from the accessibility tree (savings are in the card label)', () => {
    const badgeStart = src.indexOf('styles.saveBadge');
    const hidden = src.indexOf('accessibilityElementsHidden', badgeStart - 200);
    expect(hidden).toBeGreaterThan(-1);
  });

  it('renders the SAVE badge text with background ink on accent, not white (WCAG 8.48:1 vs 2.34:1)', () => {
    expect(src).not.toContain("{ color: colors.contrastText ?? '#FFFFFF' }");
    const badgeTextColor = src.indexOf('{ color: colors.background }', src.indexOf('saveBadgeText'));
    expect(badgeTextColor).toBeGreaterThan(-1);
  });
});
