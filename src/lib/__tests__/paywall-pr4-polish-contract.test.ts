import * as fs from 'fs';
import * as path from 'path';

// PR4 (Tier-2/3) paywall-polish contract — brief §3 items #13, #14, #19, #27.
// These are source-string invariants on the two paywall surfaces so a future
// edit cannot silently re-introduce a hard-clip, a mid-sentence clamp, a
// divergent SAVE badge, or dishonest five-star fill on a 4.8 rating.

const sourceRoot = path.join(__dirname, '../..');
const paywall = fs.readFileSync(path.join(sourceRoot, 'app/paywall.tsx'), 'utf-8');
const threeStep = fs.readFileSync(
  path.join(sourceRoot, 'components/onboarding/ThreeStepPaywall.tsx'),
  'utf-8',
);

describe('#13 paywall route — fade mask at scroll boundaries', () => {
  it('wraps the scroll content in a MaskedView so rows fade instead of hard-clipping', () => {
    expect(paywall).toContain("import MaskedView from '@react-native-masked-view/masked-view';");
    expect(paywall).toContain('<MaskedView');
    expect(paywall).toContain('</MaskedView>');
    // The MaskedView must actually wrap the ScrollView (mask opens before the
    // scroll region and closes after it).
    const maskOpen = paywall.indexOf('<MaskedView');
    const scrollOpen = paywall.indexOf('<ScrollView');
    const scrollClose = paywall.indexOf('</ScrollView>');
    const maskClose = paywall.indexOf('</MaskedView>');
    expect(maskOpen).toBeGreaterThan(-1);
    expect(maskOpen).toBeLessThan(scrollOpen);
    expect(scrollClose).toBeLessThan(maskClose);
  });

  it('fades over a band at BOTH the top and bottom boundary (transparent → opaque → opaque → transparent)', () => {
    expect(paywall).toContain('const PAYWALL_FADE_BAND =');
    expect(paywall).toContain('locations={[0, PAYWALL_FADE_BAND, 1 - PAYWALL_FADE_BAND, 1]}');
    // The mask gradient must go transparent at each edge to soften the clip.
    const maskBlock = paywall.slice(paywall.indexOf('<MaskedView'), paywall.indexOf('<ScrollView'));
    expect(maskBlock).toContain("'transparent'");
    expect(maskBlock).toContain("'black'");
  });

  it('uses an opacity-only (theme-agnostic) mask so it reads the same on dark and light routes', () => {
    // No hardcoded background hex in the mask — it must rely on alpha only.
    const maskBlock = paywall.slice(paywall.indexOf('<MaskedView'), paywall.indexOf('<ScrollView'));
    expect(maskBlock).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe('#14 benefit + disclosure copy must never clamp mid-sentence on a payment screen', () => {
  it('paywall route caps Dynamic Type instead of clamping benefit copy', () => {
    // Benefit title + desc are write-to-fit (no numberOfLines clamp), capped
    // only by a multiplier so large Dynamic Type stays bounded without
    // truncation. The JSX clamp attribute must be absent (comments may mention
    // the word "numberOfLines" — assert the actual attribute is gone).
    expect(paywall).not.toContain('numberOfLines={');
    expect(paywall).toContain('maxFontSizeMultiplier={1.3}');
    expect(paywall).toContain('maxFontSizeMultiplier={1.4}');
  });

  it('ThreeStep renewal disclosure no longer single-line clamps the 3.1.2 billing sentence', () => {
    // Previously numberOfLines={1} on the disclosure cut the renewal terms under
    // large Dynamic Type. It must wrap; the multiplier cap keeps it bounded.
    expect(threeStep).not.toContain('numberOfLines={1}');
    // Anchor on the JSX render comment (not the earlier disclosureText calc).
    const renderMarker = 'Renewal disclosure -- reflects';
    const disclosureBlock = threeStep.slice(
      threeStep.indexOf(renderMarker),
      threeStep.indexOf(renderMarker) + 900,
    );
    expect(disclosureBlock).toContain('maxFontSizeMultiplier={1.4}');
    expect(disclosureBlock).toContain('{disclosureText}');
  });
});

describe('#19 SAVE badge dim behavior is identical across both paywall surfaces', () => {
  it('both surfaces dim the SAVE badge to the same shared opacity when yearly is unselected', () => {
    expect(paywall).toContain('const SAVE_BADGE_DIMMED_OPACITY = 0.45;');
    expect(threeStep).toContain('const SAVE_BADGE_DIMMED_OPACITY = 0.45;');
    const rule = "opacity: selectedPlan === 'yearly' ? 1 : SAVE_BADGE_DIMMED_OPACITY,";
    expect(paywall).toContain(rule);
    expect(threeStep).toContain(rule);
  });

  it('keeps the badge hidden from the a11y tree on both surfaces (savings already in the card label)', () => {
    const paywallBadge = paywall.slice(
      paywall.indexOf('Save {savingsPercent}%') - 700,
      paywall.indexOf('Save {savingsPercent}%'),
    );
    expect(paywallBadge).toContain('accessibilityElementsHidden');
    const threeBadge = threeStep.slice(
      threeStep.indexOf('Save {savings}%') - 700,
      threeStep.indexOf('Save {savings}%'),
    );
    expect(threeBadge).toContain('accessibilityElementsHidden');
  });
});

describe('#27 social proof is honest (no invented store rating on an unreleased app)', () => {
  // App Review rejection 2026-08-28 (Guideline 2.3.1 exposure): the app has no
  // App Store rating, so no aggregate rating, star fill, or "Trusted by
  // thousands" claim may appear on any paywall surface. Testimonials are framed
  // as early-reader quotes, without star rows.
  it('renders no hardcoded aggregate rating or fabricated trust claims', () => {
    expect(threeStep).not.toContain('APP_STORE_RATING');
    expect(threeStep).not.toContain('Trusted by thousands');
    expect(paywall).not.toContain('Trusted by thousands');
    // The star-rating construct (not the icon itself) is what fabricates a
    // rating; FiveStars was its only carrier on this surface.
    expect(threeStep).not.toContain('FiveStars');
    expect(threeStep).not.toContain('rating=');
  });

  it('frames the testimonial carousel as early-reader quotes', () => {
    expect(threeStep).toContain('What early readers are saying');
  });
});

describe('3.1.2(c) billed amount is the most conspicuous price (App Review rejection 2026-08-28)', () => {
  // The rejected build marketed the yearly plan by its calculated per-month
  // price ($5.83/mo) while the billed amount ($69.99/yr) sat only in fine
  // print. The billed amount must render as the primary price everywhere;
  // per-month equivalents are subordinate (smaller, muted) or absent.
  it('ThreeStep yearly card leads with the billed yearly price', () => {
    // The per-month equivalent may only appear in the subordinate xs style:
    // inspect the <Text> element that actually renders it.
    const equivalentAt = threeStep.indexOf('{yearlyMonthlyEquivalent} equivalent');
    expect(equivalentAt).toBeGreaterThan(-1);
    const textOpenAt = threeStep.lastIndexOf('<Text', equivalentAt);
    expect(textOpenAt).toBeGreaterThan(-1);
    const equivalentText = threeStep.slice(textOpenAt, equivalentAt);
    expect(equivalentText).toContain('FontSize.xs');
    expect(equivalentText).not.toContain('FontSize.lg');
    // And the billed yearly price renders at the primary size on this card.
    const billedAt = threeStep.indexOf('{yearlyPrice}\n');
    expect(billedAt).toBeGreaterThan(-1);
    const billedText = threeStep.slice(threeStep.lastIndexOf('<Text', billedAt), billedAt);
    expect(billedText).toContain('FontSize.lg');
  });

  it('ThreeStep CTA never renders a dollar figure like "Try for $0.00"', () => {
    expect(threeStep).not.toContain('Try for $0.00');
    expect(threeStep).toContain("return 'Start My Free Trial';");
  });

  it('paywall route yearly row and CTA lead with the billed yearly price', () => {
    expect(paywall).toContain('{yearlyPrice}/yr');
    expect(paywall).toContain('`Unlock Premium \\u2014 ${yearlyPrice}/yr`');
    expect(paywall).not.toContain('${perMonthFromYearly}/mo`');
    // The per-month equivalent in the yearly row renders subordinate (12pt),
    // never at the primary row size.
    const equivalentAt = paywall.indexOf('{perMonthFromYearly}/mo');
    expect(equivalentAt).toBeGreaterThan(-1);
    const equivalentText = paywall.slice(paywall.lastIndexOf('<Text', equivalentAt), equivalentAt);
    expect(equivalentText).toContain('fontSize: 12');
    expect(equivalentText).not.toContain('fontSize: 15');
  });
});
