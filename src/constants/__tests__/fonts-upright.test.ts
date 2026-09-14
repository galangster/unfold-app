import { FontFamily } from '../fonts';

describe('app-owned font aliases', () => {
  it('keeps display and body italic aliases on upright faces', () => {
    expect(FontFamily.displayItalic).toBe(FontFamily.display);
    expect(FontFamily.displayItalic).toBe('PPEditorialNew-Light');
    expect(FontFamily.bodyItalic).toBe(FontFamily.body);
    expect(FontFamily.bodyItalic).toBe('Inter_400Regular');
    expect(FontFamily.bodyItalic).not.toMatch(/Italic/i);
  });
});
