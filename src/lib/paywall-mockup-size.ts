/**
 * Sizes the Screen 1 phone mockup on the onboarding paywall
 * (ThreeStepPaywall) from the space that is actually available between the
 * headline and the CTA block.
 *
 * The bezel used to be sized from the window width only (62% wide at a
 * 9:19.5 aspect), which made it ~1.34x the screen width tall — taller than
 * the page area on every supported iPhone — so the frame always overflowed
 * and was clipped in a straight horizontal line exactly where the CTA block
 * begins (Jordan's "cut at the bottom" report, 2026-09-04). Fitting the
 * height keeps the rounded frame bottom visible, `bottomClearance` above the
 * CTA block. The width-derived size stays as an upper bound so the mockup
 * never grows past its original footprint.
 */

/** The bezel never grows past this fraction of the available width. */
export const MOCKUP_MAX_WIDTH_FRACTION = 0.62;
/** width / height of the phone frame. */
export const MOCKUP_ASPECT_RATIO = 9 / 19.5;
/**
 * Below this height the walkthrough is illegible; instead of shrinking
 * further the frame keeps this height, overflows, and is faded out.
 */
export const MOCKUP_MIN_HEIGHT = 260;
/** Default gap above the frame (the wrapper's own paddingTop). */
export const MOCKUP_TOP_PADDING = 16;
/** Default gap kept between the frame bottom and the CTA block. */
export const MOCKUP_BOTTOM_CLEARANCE = 16;

export interface MockupSizeInput {
  /** Height of the wrapper the frame lives in (including its top padding). */
  availableHeight: number;
  /** Width of the wrapper the frame lives in. */
  availableWidth: number;
  topPadding?: number;
  bottomClearance?: number;
  minHeight?: number;
}

export interface MockupSize {
  width: number;
  height: number;
  /**
   * True when the frame is taller than the space and its bottom will be
   * clipped by the page — the caller should fade it into the background.
   */
  overflows: boolean;
}

export function computeMockupSize({
  availableHeight,
  availableWidth,
  topPadding = MOCKUP_TOP_PADDING,
  bottomClearance = MOCKUP_BOTTOM_CLEARANCE,
  minHeight = MOCKUP_MIN_HEIGHT,
}: MockupSizeInput): MockupSize {
  const widthDerivedHeight = (availableWidth * MOCKUP_MAX_WIDTH_FRACTION) / MOCKUP_ASPECT_RATIO;
  const fitHeight = availableHeight - topPadding - bottomClearance;
  const height = Math.max(Math.min(widthDerivedHeight, fitHeight), minHeight);
  return {
    width: height * MOCKUP_ASPECT_RATIO,
    height,
    overflows: height > fitHeight,
  };
}
