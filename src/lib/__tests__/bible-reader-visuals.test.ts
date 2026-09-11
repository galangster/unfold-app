import {
  BIBLE_TEXT_OVERLAY_METRICS,
  getBibleHighlightStrokeStyle,
  getBibleTextOverlayStyle,
  nextBibleTabBarStateAfterActions,
} from '@/lib/bible-reader-visuals';

describe('Bible reader visual polish helpers', () => {
  it('keeps selection rectangles thick enough to read without filling the full line box', () => {
    expect(BIBLE_TEXT_OVERLAY_METRICS).toMatchObject({
      horizontalInset: 4,
      minHeight: 20,
      radius: 6,
      topInset: 2,
      bottomExtension: 1,
    });
  });

  it('stacks wrapped-line overlays with a tiny gap and no overlap', () => {
    const first = getBibleTextOverlayStyle({ x: 0, y: 20, width: 100, height: 28 }, 'selectedLight');
    const second = getBibleTextOverlayStyle({ x: 0, y: 48, width: 100, height: 28 }, 'selectedLight');

    expect(Number(first.top) + Number(first.height)).toBe(49);
    expect(second.top).toBe(50);
  });

  it('uses taller centered selected-verse overlays in dark and light mode', () => {
    expect(getBibleTextOverlayStyle({ x: 0, y: 0, width: 100, height: 24 }, 'selectedDark')).toMatchObject({
      backgroundColor: 'rgba(255, 246, 224, 0.72)',
      left: -4,
      top: 2,
      width: 108,
      height: 23,
    });
    expect(getBibleTextOverlayStyle({ x: 0, y: 0, width: 100, height: 24 }, 'selectedLight')).toMatchObject({
      backgroundColor: 'rgba(78, 68, 54, 0.30)',
      left: -4,
      top: 2,
      width: 108,
      height: 23,
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

describe('getBibleHighlightStrokeStyle', () => {
  it('anchors the stroke to the letters inside a tall line box', () => {
    // 18px Lora on a 30px line: em box starts 6px down; ascender top 0.2em in.
    const style = getBibleHighlightStrokeStyle({ x: 12, y: 40, width: 180, height: 30 }, 18, { top: 0.2, height: 1.13 });
    expect(style).toEqual({
      position: 'absolute',
      left: 9,
      top: 50,
      width: 186,
      height: 20,
      borderRadius: 2,
    });
  });
});
