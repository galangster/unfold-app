import {
  BIBLE_TEXT_OVERLAY_METRICS,
  getBibleTextOverlayStyle,
  nextBibleTabBarStateAfterActions,
} from '@/lib/bible-reader-visuals';

describe('Bible reader visual polish helpers', () => {
  it('keeps scripture highlight rectangles thick enough to read without filling the full line box', () => {
    expect(BIBLE_TEXT_OVERLAY_METRICS).toMatchObject({
      horizontalInset: 3,
      height: 18,
      bottomInset: 4,
      radius: 6,
      savedHeightRatio: 0.82,
      savedRadius: 2,
    });

    const savedStyle = getBibleTextOverlayStyle({ x: 12, y: 20, width: 180, height: 28 });
    expect(savedStyle).toMatchObject({
      left: 10,
      width: 184,
      borderRadius: 2,
    });
    expect(savedStyle.top).toBeCloseTo(22.24);
    expect(savedStyle.height).toBeCloseTo(22.96);
  });

  it('uses brighter selected-verse overlays in dark and light mode', () => {
    expect(getBibleTextOverlayStyle({ x: 0, y: 0, width: 100, height: 24 }, 'selectedDark')).toMatchObject({
      backgroundColor: 'rgba(255, 246, 224, 0.72)',
      height: 18,
    });
    expect(getBibleTextOverlayStyle({ x: 0, y: 0, width: 100, height: 24 }, 'selectedLight')).toMatchObject({
      backgroundColor: 'rgba(78, 68, 54, 0.30)',
      height: 18,
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
