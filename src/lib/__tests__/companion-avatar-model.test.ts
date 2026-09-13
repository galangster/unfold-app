import {
  COMPANION_EXPRESSIONS,
  COMPANION_EYES,
  COMPANION_IDENTITY_IN_DELAY_MS,
  COMPANION_IDENTITY_IN_MS,
  COMPANION_IDENTITY_OUT_MS,
  COMPANION_MORPH_MS,
  COMPANION_SPHERE_SCALE,
  COMPANION_SPLIT_X,
  HALO,
  HEAD,
  PEARL,
  VIEWBOX,
  companionLayout,
} from '@/lib/companion-avatar-model';

describe('companion avatar model', () => {
  it('keeps the approved warm-pearl colors and gold halo', () => {
    expect(PEARL).toEqual({
      lit: '#FFF9F0',
      mid: '#E6D7C2',
      dark: '#9C866D',
      eye: '#493D32',
      eyeDeep: '#211B17',
      halo: '#D0AA5F',
    });
    expect(HALO.transform).toContain('translate');
    expect(HALO.cx).toBe(HEAD.cx);
  });

  it('exposes one pair of visible eyes for every expression', () => {
    expect(COMPANION_EXPRESSIONS).toEqual(['gentle', 'thoughtful', 'encouraging', 'welcome']);

    for (const expression of COMPANION_EXPRESSIONS) {
      const eyes = COMPANION_EYES[expression];
      expect(eyes.left.visible).toBe(true);
      expect(eyes.right.visible).toBe(true);
      expect(eyes.left.d.startsWith('M')).toBe(true);
      expect(eyes.right.d.startsWith('M')).toBe(true);
      expect(eyes.left.matrix).not.toBe(eyes.right.matrix);
    }
  });

  it('gives each expression a distinct eye pose', () => {
    const signatures = COMPANION_EXPRESSIONS.map((expression) => {
      const eyes = COMPANION_EYES[expression];
      return `${eyes.left.d}|${eyes.left.matrix}|${eyes.right.d}|${eyes.right.matrix}`;
    });
    expect(new Set(signatures).size).toBe(COMPANION_EXPRESSIONS.length);
  });

  it('holds the 520ms morph and staggered identity return', () => {
    expect(COMPANION_MORPH_MS).toBe(520);
    expect(COMPANION_IDENTITY_OUT_MS).toBe(140);
    expect(COMPANION_IDENTITY_IN_MS).toBe(210);
    expect(COMPANION_IDENTITY_IN_DELAY_MS).toBeGreaterThanOrEqual(
      COMPANION_MORPH_MS,
    );
    expect(COMPANION_SPHERE_SCALE).toBe(0.27);
    expect(COMPANION_SPLIT_X).toBe(17.5);
  });

  it('keeps a square layout whose split fits inside the view box', () => {
    const layout = companionLayout(78);
    expect(layout.size).toBe(78);
    expect(layout.viewScale).toBe(1);
    expect(layout.stageWidth).toBe(VIEWBOX.w);
    expect(layout.splitPx).toBe(COMPANION_SPLIT_X);
    expect(layout.sphereDiameter).toBe(HEAD.r * 2);

    const leftEdge = layout.headCenterX - layout.splitPx - (HEAD.r * COMPANION_SPHERE_SCALE);
    const rightEdge = layout.headCenterX + layout.splitPx + (HEAD.r * COMPANION_SPHERE_SCALE);
    expect(leftEdge).toBeGreaterThan(0);
    expect(rightEdge).toBeLessThan(layout.stageWidth);
  });
});
