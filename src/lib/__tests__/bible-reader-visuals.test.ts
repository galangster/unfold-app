import {
  BIBLE_TEXT_OVERLAY_METRICS,
  getBibleTextOverlayStyle,
  nextBibleTabBarStateAfterActions,
} from '@/lib/bible-reader-visuals';

describe('Bible reader visual polish helpers', () => {
  it('keeps scripture highlight rectangles thick enough to read without filling the full line box', () => {
    expect(BIBLE_TEXT_OVERLAY_METRICS).toMatchObject({
      horizontalInset: 4,
      minHeight: 20,
      selectedHeightRatio: 0.82,
      radius: 6,
      savedHorizontalInset: 3,
      savedHeightRatio: 0.88,
      savedRadius: 2,
    });

    const savedStyle = getBibleTextOverlayStyle({ x: 12, y: 20, width: 180, height: 28 });
    expect(savedStyle).toMatchObject({
      left: 9,
      width: 186,
      borderRadius: 2,
    });
    expect(savedStyle.top).toBeCloseTo(21.68);
    expect(savedStyle.height).toBeCloseTo(24.64);
  });

  it('uses taller centered selected-verse overlays in dark and light mode', () => {
    expect(getBibleTextOverlayStyle({ x: 0, y: 0, width: 100, height: 24 }, 'selectedDark')).toMatchObject({
      backgroundColor: 'rgba(255, 246, 224, 0.72)',
      left: -4,
      top: 2,
      width: 108,
      height: 20,
    });
    expect(getBibleTextOverlayStyle({ x: 0, y: 0, width: 100, height: 24 }, 'selectedLight')).toMatchObject({
      backgroundColor: 'rgba(78, 68, 54, 0.30)',
      left: -4,
      top: 2,
      width: 108,
      height: 20,
    });
  });

  it('restores the regular tab bar instantly after context actions when it was visible before selection', () => {
    expect(nextBibleTabBarStateAfterActions({
      showActions: false,
      wasScrollHiddenBeforeActions: false,
    })).toEqual({ hidden: false, mode: 'instant' });
  });

  it('keeps a scroll-hidden tab bar in instant mode after context actions close to avoid a bottom flash', () => {
    expect(nextBibleTabBarStateAfterActions({
      showActions: false,
      wasScrollHiddenBeforeActions: true,
    })).toEqual({ hidden: true, mode: 'instant' });
  });
});
