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
      paywall.indexOf('SAVE {savingsPercent}%') - 700,
      paywall.indexOf('SAVE {savingsPercent}%'),
    );
    expect(paywallBadge).toContain('accessibilityElementsHidden');
    const threeBadge = threeStep.slice(
      threeStep.indexOf('SAVE {savings}%') - 700,
      threeStep.indexOf('SAVE {savings}%'),
    );
    expect(threeBadge).toContain('accessibilityElementsHidden');
  });
});

describe('#27 social-proof rating is honest (4.8 must not paint five full stars)', () => {
  it('drives the rating number and star fill from one constant', () => {
    expect(threeStep).toContain('const APP_STORE_RATING = 4.8;');
    expect(threeStep).toContain('{APP_STORE_RATING.toFixed(1)}');
    expect(threeStep).toContain('rating={APP_STORE_RATING}');
  });

  it('FiveStars renders a proportional partial fill when given a rating', () => {
    // Outline track + width-clipped filled overlay = honest partial fill.
    const fiveStars = threeStep.slice(
      threeStep.indexOf('function FiveStars'),
      threeStep.indexOf('function StackDots'),
    );
    expect(fiveStars).toContain('weight="regular"'); // empty track
    expect(fiveStars).toContain('weight="fill"'); // filled overlay
    expect(fiveStars).toContain('const fillWidth = (clamped / 5) * fullWidth;');
    expect(fiveStars).toContain('styles.starsFillOverlay'); // clipped overlay
    // a11y: the partial-fill row announces the real rating, not 5 stars.
    expect(fiveStars).toContain('Rated ${clamped} out of 5 stars');
  });

  it('clips the filled-star overlay (overflow hidden) so it never paints past the rating', () => {
    const overlayStyle = threeStep.slice(
      threeStep.indexOf('starsFillOverlay:'),
      threeStep.indexOf('starsFillOverlay:') + 200,
    );
    expect(overlayStyle).toContain("overflow: 'hidden'");
  });

  it('reproduces the partial-fill proportion for 4.8 (96% of the bar, not 100%)', () => {
    // Mirror the component math: fullWidth = 5*size + 4*gap; fill = rating/5.
    const STAR_SIZE = 14;
    const STAR_GAP = 2;
    const fullWidth = 5 * STAR_SIZE + 4 * STAR_GAP;
    const fillWidth = (4.8 / 5) * fullWidth;
    expect(fillWidth).toBeCloseTo(fullWidth * 0.96, 5);
    expect(fillWidth).toBeLessThan(fullWidth); // never overstates as 5/5
  });
});
