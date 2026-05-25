/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Platform, View } from 'react-native';
import { useElevation, type ElevationSet } from '@/constants/elevation';
import { DarkColors, LightColors } from '@/constants/colors';

// react-test-renderer types are not installed in this app; keep this test
// aligned with the pattern used elsewhere (today-card-stack, dismissible-surfaces).
const renderer = require('react-test-renderer');

const mockUseTheme = jest.fn();
jest.mock('@/lib/theme', () => ({
  useTheme: () => mockUseTheme(),
}));

function captureElevation(): ElevationSet {
  const captured = { current: null as ElevationSet | null };
  function Harness() {
    captured.current = useElevation();
    return React.createElement(View);
  }
  renderer.act(() => {
    renderer.create(React.createElement(Harness));
  });
  if (!captured.current) {
    throw new Error('useElevation did not run');
  }
  return captured.current;
}

describe('useElevation', () => {
  describe('dark mode', () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({ colors: DarkColors, isDark: true });
    });

    it('raised.shadow uses accent color with soft offset/radius on iOS', () => {
      Platform.OS = 'ios';
      const elevation = captureElevation();
      expect(elevation.raised.shadow).toEqual({
        shadowColor: DarkColors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      });
    });

    it('raised.shadow falls back to Android elevation', () => {
      Platform.OS = 'android';
      const elevation = captureElevation();
      expect(elevation.raised.shadow).toEqual({ elevation: 4 });
    });

    it('raised.highlight is a 1px top-edge overlay with 6% white', () => {
      const elevation = captureElevation();
      expect(elevation.raised.highlight).toEqual({
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
      });
    });

    it('flat tier has no shadow and no highlight', () => {
      const elevation = captureElevation();
      expect(elevation.flat.shadow).toEqual({});
      expect(elevation.flat.highlight).toEqual({});
    });

    it('floating tier is stronger than raised on iOS', () => {
      Platform.OS = 'ios';
      const elevation = captureElevation();
      expect(elevation.floating.shadow).toEqual({
        shadowColor: DarkColors.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
      });
    });

    it('surface exposes a backgroundColor token', () => {
      const elevation = captureElevation();
      expect(elevation.raised.surface.backgroundColor).toBeDefined();
      expect(typeof elevation.raised.surface.backgroundColor).toBe('string');
    });
  });

  describe('light mode', () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({ colors: LightColors, isDark: false });
    });

    it('raised.shadow uses lighter offset/opacity on iOS', () => {
      Platform.OS = 'ios';
      const elevation = captureElevation();
      expect(elevation.raised.shadow).toEqual({
        shadowColor: LightColors.accent,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      });
    });

    it('raised.highlight is transparent in light mode', () => {
      const elevation = captureElevation();
      expect(elevation.raised.highlight.backgroundColor).toBe('transparent');
    });
  });

  afterAll(() => {
    Platform.OS = 'ios';
  });
});
