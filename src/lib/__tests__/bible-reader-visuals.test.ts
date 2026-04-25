import {
  BIBLE_TEXT_OVERLAY_METRICS,
  getBibleTextOverlayStyle,
  nextBibleTabBarStateAfterActions,
} from '@/lib/bible-reader-visuals';

describe('Bible reader visual polish helpers', () => {
  it('keeps scripture highlight rectangles thin instead of filling the full line box', () => {
    expect(BIBLE_TEXT_OVERLAY_METRICS).toEqual({
      horizontalInset: 1,
      height: 8,
      bottomInset: 8,
      radius: 3,
    });

    expect(getBibleTextOverlayStyle({ x: 12, y: 20, width: 180, height: 28 })).toMatchObject({
      left: 11,
      top: 32,
      width: 182,
      height: 8,
      borderRadius: 3,
    });
  });

  it('uses a softer selected-verse overlay in dark mode', () => {
    expect(getBibleTextOverlayStyle({ x: 0, y: 0, width: 100, height: 24 }, 'selectedDark')).toMatchObject({
      backgroundColor: 'rgba(225, 220, 210, 0.34)',
      height: 8,
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
