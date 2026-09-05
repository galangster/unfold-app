import {
  computeMockupSize,
  computePaywallDragOffset,
  MOCKUP_ASPECT_RATIO,
  MOCKUP_BOTTOM_CLEARANCE,
  MOCKUP_MAX_WIDTH_FRACTION,
  MOCKUP_MIN_HEIGHT,
  MOCKUP_TOP_PADDING,
  PAYWALL_DRAG_DOWNWARD_PEAK,
  PAYWALL_DRAG_SCALE,
  PAYWALL_MAX_DRAG,
} from '../paywall-mockup-size';

const GAPS = MOCKUP_TOP_PADDING + MOCKUP_BOTTOM_CLEARANCE;
// Float slack for width === height * ratio round trips.
const EPSILON = 1e-9;

// SYNTHETIC FIXTURES — nothing in this file was measured on a device. The
// widths are the logical widths of the three named iPhones. The page-area
// heights are illustrative numbers chosen to sit between the 260pt floor and
// the width-derived cap so every row exercises the height-fitting branch.
// The lane ran without simulator access, so no real wrapper height has been
// captured yet; when one is, replace these rows with the measured values and
// drop this note.
const syntheticFixtures = [
  { name: 'iPhone 13 mini width, synthetic page area', width: 375, pageArea: 516 },
  { name: 'iPhone 17 width, synthetic page area', width: 402, pageArea: 569 },
  { name: 'iPhone 17 Pro Max width, synthetic page area', width: 440, pageArea: 651 },
];

// Synthetic as well: an assumed ~80pt of extra headline + disclosure height
// at Dynamic Type 130%.
const DYNAMIC_TYPE_130_GROWTH = 80;

describe('computeMockupSize', () => {
  describe.each([
    ['default text size', 0],
    ['Dynamic Type 130%', DYNAMIC_TYPE_130_GROWTH],
  ])('%s', (_label, growth) => {
    it.each(syntheticFixtures)(
      '$name: the frame bottom clears the CTA block and the frame keeps its aspect',
      ({ width, pageArea }) => {
        const availableHeight = pageArea - growth;
        const size = computeMockupSize({ availableHeight, availableWidth: width });

        expect(size.overflows).toBe(false);
        // Top padding + the clearance above the CTA block.
        expect(size.height).toBeLessThanOrEqual(availableHeight - GAPS);
        expect(size.width).toBeCloseTo(size.height * MOCKUP_ASPECT_RATIO, 6);
        // Never wider than the original width-derived footprint.
        expect(size.width).toBeLessThanOrEqual(width * MOCKUP_MAX_WIDTH_FRACTION + EPSILON);
        expect(size.height).toBeGreaterThanOrEqual(MOCKUP_MIN_HEIGHT);
      },
    );
  });

  it('caps at the width-derived size when there is more height than the frame needs', () => {
    const size = computeMockupSize({ availableHeight: 2000, availableWidth: 400 });

    expect(size.width).toBeCloseTo(400 * MOCKUP_MAX_WIDTH_FRACTION, 6);
    expect(size.height).toBeCloseTo((400 * MOCKUP_MAX_WIDTH_FRACTION) / MOCKUP_ASPECT_RATIO, 6);
    expect(size.overflows).toBe(false);
  });

  it('honours custom padding and clearance', () => {
    const size = computeMockupSize({
      availableHeight: 500,
      availableWidth: 1000,
      topPadding: 40,
      bottomClearance: 60,
    });

    expect(size.height).toBe(400);
    expect(size.overflows).toBe(false);
  });

  it('floors at the minimum height and reports overflow when the page area is too short', () => {
    const size = computeMockupSize({ availableHeight: 200, availableWidth: 375 });

    expect(size.height).toBe(MOCKUP_MIN_HEIGHT);
    expect(size.width).toBeCloseTo(MOCKUP_MIN_HEIGHT * MOCKUP_ASPECT_RATIO, 6);
    expect(size.overflows).toBe(true);
  });

  it('does not report overflow at exactly the minimum height', () => {
    const size = computeMockupSize({ availableHeight: MOCKUP_MIN_HEIGHT + GAPS, availableWidth: 375 });

    expect(size.height).toBe(MOCKUP_MIN_HEIGHT);
    expect(size.overflows).toBe(false);
  });
});

// Review must-fix 1 (2026-09-04): MAX_DRAG = 60 with the rubber-band gave a
// +30pt downward peak while the clearance was 16pt, so a full downward pull
// re-created Jordan's flat cut by up to 14pt under screen1Root's
// overflow: 'hidden'. These tests pin clearance >= peak against the real
// drag function, not against a hand-derived number.
describe('paywall drag rubber-band vs. mockup bottom clearance', () => {
  // Sweep far past any finger travel a phone can produce (±4000pt, 1pt steps).
  const SWEEP = 4000;
  const offsets = Array.from({ length: SWEEP * 2 + 1 }, (_, i) =>
    computePaywallDragOffset(i - SWEEP),
  );
  const maxDown = Math.max(...offsets);
  const maxUp = Math.min(...offsets);

  it('peaks at PAYWALL_MAX_DRAG / 2 in both directions', () => {
    expect(PAYWALL_DRAG_DOWNWARD_PEAK).toBe(PAYWALL_MAX_DRAG / 2);
    expect(maxDown).toBeCloseTo(PAYWALL_DRAG_DOWNWARD_PEAK, 6);
    expect(maxUp).toBeCloseTo(-PAYWALL_DRAG_DOWNWARD_PEAK, 6);
    // The analytic peak sits at raw = PAYWALL_MAX_DRAG.
    expect(computePaywallDragOffset(PAYWALL_MAX_DRAG / PAYWALL_DRAG_SCALE)).toBeCloseTo(
      PAYWALL_DRAG_DOWNWARD_PEAK,
      6,
    );
  });

  it('never reverses direction on a long pull', () => {
    // Downward travel: offsets[SWEEP..] must be non-decreasing.
    const downward = offsets.slice(SWEEP);
    const nonDecreasing = downward.every((v, i) => i === 0 || v >= downward[i - 1] - EPSILON);
    expect(nonDecreasing).toBe(true);
    expect(computePaywallDragOffset(0)).toBe(0);
    // Inside the clamp the curve is the original rubber-band.
    expect(computePaywallDragOffset(100)).toBeCloseTo(40 * (1 - 40 / (PAYWALL_MAX_DRAG * 2)), 6);
  });

  it('keeps the resting clearance at or above the downward drag peak', () => {
    expect(MOCKUP_BOTTOM_CLEARANCE).toBeGreaterThanOrEqual(maxDown);
    expect(MOCKUP_BOTTOM_CLEARANCE).toBeGreaterThanOrEqual(PAYWALL_DRAG_DOWNWARD_PEAK);
  });

  it.each(syntheticFixtures)(
    '$name: the frame bottom stays inside the page through a full downward pull',
    ({ width, pageArea }) => {
      const size = computeMockupSize({ availableHeight: pageArea, availableWidth: width });

      expect(MOCKUP_TOP_PADDING + size.height + maxDown).toBeLessThanOrEqual(pageArea + EPSILON);
    },
  );
});
