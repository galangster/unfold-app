import { DarkColors, LightColors } from '@/constants/colors';
import { resolveGeneratingPalette } from '../generating-palette';

describe('resolveGeneratingPalette', () => {
  it('returns the exact dark-mode override values', () => {
    const colors = resolveGeneratingPalette(DarkColors, true);

    expect(colors.background).toBe('#0A0A0A');
    expect(colors.cardBackground).toBe('#111214');
    expect(colors.inputBackground).toBe('#111214');
    expect(colors.border).toBe('#24262B');
    expect(colors.text).toBe('#F5F5F7');
    expect(colors.textMuted).toBe('#A0A6B1');
    expect(colors.textSubtle).toBe('#7D8592');
    expect(colors.buttonBackground).toBe(DarkColors.accent);
    expect(colors.buttonBackgroundPressed).toBe(DarkColors.accent);
    expect(colors.contrastText).toBe(DarkColors.background);
  });

  it('keeps light-mode surfaces and text from the theme and uses accent buttons', () => {
    const colors = resolveGeneratingPalette(LightColors, false);

    expect(colors.background).toBe(LightColors.background);
    expect(colors.inputBackground).toBe(LightColors.inputBackground);
    expect(colors.border).toBe(LightColors.border);
    expect(colors.text).toBe(LightColors.text);
    expect(colors.textMuted).toBe(LightColors.textMuted);
    expect(colors.textSubtle).toBe(LightColors.textSubtle);
    expect(colors.buttonBackground).toBe(LightColors.accent);
    expect(colors.buttonBackgroundPressed).toBe(LightColors.accent);
    expect(colors.contrastText).toBe(LightColors.background);
  });

  it('uses readable ink for the saved Gold accent, which is lighter than the base theme gold', () => {
    const colors = resolveGeneratingPalette({ ...LightColors, accent: '#9A7B3C' }, false);

    expect(colors.buttonBackground).toBe('#9A7B3C');
    expect(colors.contrastText).toBe('#000000');
  });

  it('uses light ink if a custom dark-mode accent is too dark for the usual ink', () => {
    const colors = resolveGeneratingPalette({ ...DarkColors, accent: '#395D93' }, true);

    expect(colors.contrastText).toBe('#FFFFFF');
  });
});
