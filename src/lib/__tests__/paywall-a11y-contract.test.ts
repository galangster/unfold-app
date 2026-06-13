import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(sourceRoot, 'app/paywall.tsx'), 'utf-8');

describe('paywall close button (RT-PAYWALL-1)', () => {
  it('renders the close affordance with an RN Pressable (RNGH touchables strand absolute styles off-screen)', () => {
    expect(src).toMatch(/import \{[^}]*Pressable[^}]*\} from 'react-native'/);
    expect(src).toContain('accessibilityLabel="Close"');
  });

  it('removed the never-rendered absolute RNGH close button', () => {
    expect(src).not.toContain('accessibilityLabel="Close paywall"');
    expect(src).not.toContain("position: 'absolute',\n          top: insets.top + 8,");
  });

  it('close button routes through handleClose (completion-nav matrix) and blocks mid-purchase', () => {
    const pressableStart = src.indexOf('<Pressable');
    expect(pressableStart).toBeGreaterThan(-1);
    const pressableBlock = src.slice(pressableStart, src.indexOf('</Pressable>'));
    expect(pressableBlock).toContain('onPress={handleClose}');
    expect(pressableBlock).toContain('disabled={isPurchasing}');
  });
});

describe('paywall billing disclosure (RT-PAYWALL-2/RT-PAYWALL-8)', () => {
  it('discloses the real charge via the shared renewal-disclosure helper, RC-derived with honest fallback', () => {
    expect(src).toContain('getPaywallRenewalDisclosure({');
    expect(src).toContain("yearlyPackage?.product.priceString ?? '$59.99'");
  });

  it('passes RC-verified per-selected-plan trial eligibility to the disclosure', () => {
    expect(src).toContain('hasFreeTrial: isTrialEligible');
  });

  it('derives the per-month price from the shared trunc-to-cent formatter', () => {
    expect(src).toContain('getPerMonthEquivalent(yearlyRaw, yearlyPrice)');
  });
});

describe('paywall plan selector semantics (RT-PAYWALL-3/4/6)', () => {
  it('exposes both plan chips as radios with checked state', () => {
    expect((src.match(/accessibilityRole="radio"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'yearly', checked: selectedPlan === 'yearly' }}");
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'monthly', checked: selectedPlan === 'monthly' }}");
    expect(src).not.toContain('accessibilityRole="tab"');
  });

  it('yearly chip label carries the real annual price', () => {
    expect(src).toContain('`Yearly plan, ${yearlyPrice} per year, equal to ${perMonthFromYearly} per month');
  });

  it('comparison boolean cells expose Free/Premium inclusion labels', () => {
    expect(src).toContain("row.free ? 'Included in Free' : 'Not included in Free'");
    expect(src).toContain("'Included in Premium'");
  });

  it('SAVE badge uses background ink on solid accent and is hidden from the a11y tree', () => {
    const badge = src.slice(src.indexOf('Save {savingsPercent}%') - 600, src.indexOf('Save {savingsPercent}%'));
    expect(badge).toContain('backgroundColor: colors.accent,');
    expect(badge).toContain('accessibilityElementsHidden');
    expect(badge).toContain('color: colors.background');
    expect(src).not.toContain('`${colors.accent}30`');
  });
});
