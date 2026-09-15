import * as fs from 'fs';
import * as path from 'path';
import {
  buildRiveThemeValues,
  RIVE_ACCENT_COLOR_PROPERTIES,
  RIVE_ACCENT_NUMBER_PROPERTIES,
  withAlpha,
} from '../rive-theme';

const ACCENT_SLOTS = [
  'artwork_color', 'accent_color', 'leaf_color', 'line_color', 'color', 'Color',
  'glow_color', 'waterfall_glow_color',
] as const;
const BACKGROUND_SLOTS = ['background_color', 'background__color', 'panel_color'] as const;

describe('Rive accent theming', () => {
  it('passes the accent as 0-255 R/G/B channels for the particle systems', () => {
    const values = buildRiveThemeValues({
      accentColor: '#3A6FA0',
      backgroundColor: '#FAF7F2',
      isDark: false,
      width: 393.4,
      height: 852.2,
    });

    expect(values.numberValues.accentR).toBe(0x3A); // 58
    expect(values.numberValues.accentG).toBe(0x6F); // 111
    expect(values.numberValues.accentB).toBe(0xA0); // 160
    expect(values.numberValues.width).toBe(393);
    expect(values.numberValues.height).toBe(852);
  });

  it('drives the artwork + glow slots with the opaque accent', () => {
    const values = buildRiveThemeValues({
      accentColor: '#5B9BD5',
      backgroundColor: '#0A0A0A',
      isDark: true,
      width: 390,
      height: 844,
    });

    for (const slot of ACCENT_SLOTS) {
      expect(values.colorValues[slot]).toBe('#5B9BD5FF');
    }
  });

  it('sets the background filled-shape slots to the opaque app surface, never the accent', () => {
    const values = buildRiveThemeValues({
      accentColor: '#5B9BD5',
      backgroundColor: '#0A0A0A',
      isDark: true,
      width: 390,
      height: 844,
    });

    for (const slot of BACKGROUND_SLOTS) {
      expect(values.colorValues[slot]).toBe('#0A0A0AFF');
    }
  });

  it('builds the feathered text mask from the surface: start @0%, end @100%', () => {
    const values = buildRiveThemeValues({
      accentColor: '#5B9BD5',
      backgroundColor: '#0A0A0A',
      isDark: true,
      width: 390,
      height: 844,
    });

    expect(values.colorValues.mask_gradient_start).toBe('#0A0A0A00');
    expect(values.colorValues.maskGradient_start).toBe('#0A0A0A00');
    expect(values.colorValues.mask_gradient_end).toBe('#0A0A0AFF');
    expect(values.colorValues.maskGradient_end).toBe('#0A0A0AFF');
  });

  it('changes the artwork color + accent channels when the user changes accent', () => {
    const gold = buildRiveThemeValues({
      accentColor: '#C8A55C',
      backgroundColor: '#0A0A0A',
      isDark: true,
      width: 390,
      height: 844,
    });
    const ocean = buildRiveThemeValues({
      accentColor: '#5B9BD5',
      backgroundColor: '#0A0A0A',
      isDark: true,
      width: 390,
      height: 844,
    });

    expect(ocean.colorValues.artwork_color).not.toBe(gold.colorValues.artwork_color);
    expect(ocean.numberValues.accentR).not.toBe(gold.numberValues.accentR);
    // The background mask stays surface-derived (identical across accents).
    expect(ocean.colorValues.background_color).toBe(gold.colorValues.background_color);
    expect(ocean.colorValues.mask_gradient_end).toBe(gold.colorValues.mask_gradient_end);
  });

  it('emits a valid 8-digit hex for every color slot', () => {
    const values = buildRiveThemeValues({
      accentColor: '#A8596A',
      backgroundColor: '#FAF7F2',
      isDark: false,
      width: 390,
      height: 844,
    });

    for (const propertyName of RIVE_ACCENT_COLOR_PROPERTIES) {
      expect(values.colorValues[propertyName]).toMatch(/^#[0-9A-F]{8}$/);
    }
    for (const propertyName of RIVE_ACCENT_NUMBER_PROPERTIES) {
      expect(values.numberValues[propertyName]).toEqual(expect.any(Number));
    }
  });

  it('normalizes 3-digit hex and invalid fallback accents', () => {
    expect(withAlpha('#abc', 0.5)).toBe('#AABBCC80');

    const values = buildRiveThemeValues({
      accentColor: 'not-a-color',
      backgroundColor: 'also-bad',
      isDark: true,
      width: 390,
      height: 844,
    });

    expect(values.numberValues.accentR).toBe(0xC8); // 200, gold fallback
    expect(values.numberValues.accentG).toBe(0xA5); // 165
    expect(values.numberValues.accentB).toBe(0x5C); // 92
  });

  it('all bundled Today Rive binaries are RIVE files exposing an accent control', () => {
    const riveDir = path.join(__dirname, '../../../assets/rive');
    const riveFiles = fs.readdirSync(riveDir).filter((file) => file.endsWith('.riv')).sort();

    expect(riveFiles).toEqual([
      'today-campfire.riv',
      'today-canopy-lights.riv',
      'today-doors.riv',
      'today-light-rays.riv',
      'today-rain-particles.riv',
      'today-tree.riv',
      'today-waterfall.riv',
      'today-wind-leaves.riv',
      'today-wind-particles.riv',
    ]);

    for (const file of riveFiles) {
      const binary = fs.readFileSync(path.join(riveDir, file));
      expect(binary.subarray(0, 4).toString('utf-8')).toBe('RIVE');
      const ascii = binary.toString('latin1');
      // Each scene exposes an accent control the app can drive: the newer
      // `accentColor` color input (data-bound to a ViewModel color slot) or the
      // legacy per-channel `accentR/G/B`. Corrected particle scenes may keep
      // both or drop the old channels (e.g. wind-leaves exposes only accentColor).
      expect(ascii.includes('accentColor') || ascii.includes('accentR')).toBe(true);
    }
  });
});
