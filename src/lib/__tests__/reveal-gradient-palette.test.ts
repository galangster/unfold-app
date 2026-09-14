import { ACCENT_THEMES } from '@/lib/store';
import {
  REVEAL_GRADIENT_MIN_SOFTEN,
  REVEAL_GRADIENT_VARIANTS,
  buildRevealPalette,
  clampRevealSoftening,
  isRevealGradientVariant,
  resolveRevealCanvas,
  revealLuminance,
  shouldRevealClockRun,
} from '@/lib/reveal-gradient-palette';
jest.mock('@/lib/bug-logger', () => ({ logBugEvent: jest.fn(), logBugError: jest.fn() }));

const DARK_BG = '#0A0A0A';
const LIGHT_BG = '#FAF7F2';

describe('reveal-gradient-palette', () => {
  it('exposes the seven reveal families and never Forms', () => {
    expect(REVEAL_GRADIENT_VARIANTS).toEqual([
      'prism',
      'sky',
      'flow',
      'aurora',
      'mesh',
      'glow',
      'bars',
    ]);
    expect(REVEAL_GRADIENT_VARIANTS).not.toContain('forms');
    expect(isRevealGradientVariant('forms')).toBe(false);
    expect(isRevealGradientVariant('prism')).toBe(true);
  });

  it('clamps softening to at least 15 logical pixels', () => {
    expect(clampRevealSoftening(4)).toBe(REVEAL_GRADIENT_MIN_SOFTEN);
    expect(clampRevealSoftening(15)).toBe(15);
    expect(clampRevealSoftening(24)).toBe(24);
    expect(clampRevealSoftening(Number.NaN)).toBe(15);
  });

  it('keeps display softening after the reduced canvas is enlarged', () => {
    const layout = resolveRevealCanvas(390, 844, 8);
    expect(layout.displaySoftening).toBe(15);
    expect(layout.width).toBe(195);
    expect(layout.height).toBe(422);
    const visual = layout.canvasBlur * Math.min(layout.enlargeX, layout.enlargeY);
    expect(visual).toBeCloseTo(15);
  });

  it('retints every slot when the accent changes and keeps the surface', () => {
    const gold = buildRevealPalette('#C8A55C', DARK_BG, true);
    const ocean = buildRevealPalette('#5B9BD5', DARK_BG, true);
    expect(gold.background).toEqual(ocean.background);
    expect(gold.low).not.toEqual(ocean.low);
    expect(gold.mid).not.toEqual(ocean.mid);
    expect(gold.high).not.toEqual(ocean.high);
  });

  it('adapts gold, lavender, forest, ocean, rose, ember, and slate in both modes', () => {
    const ids = ['gold', 'lavender', 'forest', 'ocean', 'rose', 'ember', 'slate'];
    expect(ACCENT_THEMES.map((theme) => theme.id)).toEqual(
      expect.arrayContaining(ids),
    );

    const darkMids = new Set<string>();
    const lightMids = new Set<string>();

    for (const theme of ACCENT_THEMES) {
      const dark = buildRevealPalette(theme.dark, DARK_BG, true);
      const light = buildRevealPalette(theme.light, LIGHT_BG, false);
      expect(dark.background).not.toEqual(dark.mid);
      expect(light.background).not.toEqual(light.mid);
      expect(revealLuminance(dark.high)).toBeLessThan(0.78);
      expect(revealLuminance(light.high)).toBeLessThan(0.72);
      darkMids.add(dark.mid.join(','));
      lightMids.add(light.mid.join(','));
    }

    expect(darkMids.size).toBe(ACCENT_THEMES.length);
    expect(lightMids.size).toBe(ACCENT_THEMES.length);
  });

  it('gates the clock on focus, background, and reduced motion', () => {
    expect(shouldRevealClockRun({ active: true, reducedMotion: false, appActive: true })).toBe(
      true,
    );
    expect(shouldRevealClockRun({ active: false, reducedMotion: false, appActive: true })).toBe(
      false,
    );
    expect(shouldRevealClockRun({ active: true, reducedMotion: false, appActive: false })).toBe(
      false,
    );
    expect(shouldRevealClockRun({ active: true, reducedMotion: true, appActive: true })).toBe(
      false,
    );
  });
});
