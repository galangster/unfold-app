/**
 * Sizes the Screen 1 phone mockup on the onboarding paywall
 * (ThreeStepPaywall) from the space that is actually available between the
 * headline and the CTA block, and owns the drag rubber-band whose downward
 * peak decides how much clearance that frame needs.
 *
 * The bezel used to be sized from the window width only (62% wide at a
 * 9:19.5 aspect), which made it ~1.34x the screen width tall — taller than
 * the page area on every supported iPhone — so the frame always overflowed
 * and was clipped in a straight horizontal line exactly where the CTA block
 * begins (Jordan's "cut at the bottom" report, 2026-09-04). Fitting the
 * height keeps the rounded frame bottom visible, `MOCKUP_BOTTOM_CLEARANCE`
 * above the CTA block. The width-derived size stays as an upper bound so the
 * mockup never grows past its original footprint.
 */

import { Spacing } from '@/constants/spacing';

/** The bezel never grows past this fraction of the available width. */
export const MOCKUP_MAX_WIDTH_FRACTION = 0.62;
/** width / height of the phone frame. */
export const MOCKUP_ASPECT_RATIO = 9 / 19.5;
/**
 * Below this height the walkthrough is illegible; instead of shrinking
 * further the frame keeps this height, overflows, and is faded out.
 */
export const MOCKUP_MIN_HEIGHT = 260;

// ---------------------------------------------------------------------------
// Drag gesture (paywall Screens 1 and 2). The page follows the finger with a
// rubber-band:
//
//   raw    = clamp(translationY * PAYWALL_DRAG_SCALE, ±PAYWALL_MAX_DRAG)
//   offset = raw * (1 - |raw| / (2 * PAYWALL_MAX_DRAG))
//
// d(offset)/d(raw) = 1 - |raw| / PAYWALL_MAX_DRAG, so the offset peaks at
// |raw| = PAYWALL_MAX_DRAG with magnitude PAYWALL_MAX_DRAG / 2. Without the
// clamp the parabola comes back through zero at |raw| = 2 * PAYWALL_MAX_DRAG
// and then grows in the *opposite* direction without bound, so a long swipe
// would shove the frame past the page edge. The clamp holds the offset at the
// peak instead; travel inside ±PAYWALL_MAX_DRAG / PAYWALL_DRAG_SCALE (150pt)
// is unchanged.
//
// The peak is what ties this block to the sizing above: screen1Root keeps
// overflow: 'hidden', so a full downward pull moves the frame bottom
// PAYWALL_DRAG_DOWNWARD_PEAK lower and the page clips whatever crosses its
// bottom edge. MOCKUP_BOTTOM_CLEARANCE must cover that peak, and
// paywall-mockup-size.test.ts pins the relation.
// ---------------------------------------------------------------------------

/** Rubber-band scale. Was the inline `MAX_DRAG = 60` in both paywall screens. */
export const PAYWALL_MAX_DRAG = 60;
/** Finger travel is damped to this fraction before the rubber-band. */
export const PAYWALL_DRAG_SCALE = 0.4;
/** Largest offset the drag can produce, in either direction. */
export const PAYWALL_DRAG_DOWNWARD_PEAK = PAYWALL_MAX_DRAG / 2;

/** Vertical offset of the dragged page for a pan gesture's translationY. */
export function computePaywallDragOffset(translationY: number): number {
  'worklet';
  const raw = Math.min(
    Math.max(translationY * PAYWALL_DRAG_SCALE, -PAYWALL_MAX_DRAG),
    PAYWALL_MAX_DRAG,
  );
  return raw * (1 - Math.abs(raw) / (PAYWALL_MAX_DRAG * 2));
}

/** Gap above the frame (the wrapper's own paddingTop). */
export const MOCKUP_TOP_PADDING = Spacing['4'];
/**
 * Gap kept between the frame bottom and the CTA block at rest. Never less
 * than the drag peak, so a full downward pull still keeps the rounded frame
 * bottom inside the page.
 */
export const MOCKUP_BOTTOM_CLEARANCE = Math.max(Spacing['4'], PAYWALL_DRAG_DOWNWARD_PEAK);

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
