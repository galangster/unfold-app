/**
 * The devotional body ignored the system Dynamic Type setting. This tests
 * the pure clamp applied to PixelRatio.getFontScale() before it multiplies
 * the reader's chosen body font size, capped so a very large system setting
 * can't blow up the WebView layout.
 */
import { clampSystemFontScale } from '../../components/reading/DevotionalWebView';

jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: {}, isDark: false }) }));
jest.mock('@/lib/useReadingFont', () => ({ useReadingFont: () => ({ body: 'System' }) }));
jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: { md: { body: 17 } },
  useUnfoldStore: () => null,
}));

describe('clampSystemFontScale', () => {
  it('passes through a normal system font scale unchanged', () => {
    expect(clampSystemFontScale(1)).toBe(1);
    expect(clampSystemFontScale(1.3)).toBe(1.3);
  });

  it('caps a very large system font scale at 1.6', () => {
    expect(clampSystemFontScale(2)).toBe(1.6);
    expect(clampSystemFontScale(3.5)).toBe(1.6);
  });

  it('exactly at the cap stays at the cap', () => {
    expect(clampSystemFontScale(1.6)).toBe(1.6);
  });

  it('falls back to 1 for a non-finite or non-positive scale', () => {
    expect(clampSystemFontScale(0)).toBe(1);
    expect(clampSystemFontScale(-1)).toBe(1);
    expect(clampSystemFontScale(NaN)).toBe(1);
  });
});
