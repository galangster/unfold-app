import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { FontFamily } from '@/constants/fonts';
import { useReadingFont } from '../useReadingFont';

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));

jest.mock('@/lib/reading-font-availability', () => ({
  DEFAULT_READING_FONT_ID: 'source-serif',
  isReadingFontLoaded: () => true,
  useReadingFontAvailability: () => 1,
}));

jest.mock('@/lib/store', () => ({
  READING_FONTS: [
    {
      id: 'garamond',
      regular: 'EBGaramond_400Regular',
      italic: 'EBGaramond_400Regular_Italic',
      medium: 'EBGaramond_600SemiBold',
      bold: 'EBGaramond_700Bold',
    },
  ],
  useUnfoldStore: (selector: (state: { user: { readingFont: string } }) => unknown) =>
    selector({ user: { readingFont: 'garamond' } }),
}));

function Probe() {
  const readingFont = useReadingFont();
  return React.createElement(Text, { testID: 'reading-font-probe' }, JSON.stringify(readingFont));
}

describe('useReadingFont', () => {
  it('returns the selected upright reading face for body and bodyItalic', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(React.createElement(Probe));
    });

    const readingFont = JSON.parse(
      tree!.root.findByProps({ testID: 'reading-font-probe' }).props.children,
    );

    expect(readingFont.body).toBe('EBGaramond_400Regular');
    expect(readingFont.bodyItalic).toBe('EBGaramond_400Regular');
    expect(readingFont.bodyItalic).not.toMatch(/Italic/i);
    expect(readingFont.displayItalic).toBe(FontFamily.display);

    act(() => tree!.unmount());
  });
});
