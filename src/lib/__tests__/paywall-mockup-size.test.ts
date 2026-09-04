import {
  computeMockupSize,
  MOCKUP_ASPECT_RATIO,
  MOCKUP_MAX_WIDTH_FRACTION,
  MOCKUP_MIN_HEIGHT,
} from '../paywall-mockup-size';

// Page area = window height minus the onboarding header and the free-trial
// CTA block ("No Payment Due Now" + button + disclosure + legal links). The
// wrapper the mockup lives in is that page area minus the Screen 1 headline.
const devices = [
  { name: 'iPhone 13 mini', width: 375, pageArea: 516 },
  { name: 'iPhone 17', width: 402, pageArea: 569 },
  { name: 'iPhone 17 Pro Max', width: 440, pageArea: 651 },
];

// Dynamic Type 130%: the headline and the disclosure grow and take roughly
// 80pt more out of the page area.
const DYNAMIC_TYPE_130_GROWTH = 80;

describe('computeMockupSize', () => {
  describe.each([
    ['default text size', 0],
    ['Dynamic Type 130%', DYNAMIC_TYPE_130_GROWTH],
  ])('%s', (_label, growth) => {
    it.each(devices)(
      '$name: the frame bottom clears the CTA block and the frame keeps its aspect',
      ({ width, pageArea }) => {
        const availableHeight = pageArea - growth;
        const size = computeMockupSize({ availableHeight, availableWidth: width });

        expect(size.overflows).toBe(false);
        // 16pt top padding + 16pt clearance above the CTA block.
        expect(size.height).toBeLessThanOrEqual(availableHeight - 32);
        expect(size.width).toBeCloseTo(size.height * MOCKUP_ASPECT_RATIO, 6);
        // Never wider than the original width-derived footprint.
        expect(size.width).toBeLessThanOrEqual(width * MOCKUP_MAX_WIDTH_FRACTION);
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
    const size = computeMockupSize({ availableHeight: MOCKUP_MIN_HEIGHT + 32, availableWidth: 375 });

    expect(size.height).toBe(MOCKUP_MIN_HEIGHT);
    expect(size.overflows).toBe(false);
  });
});
