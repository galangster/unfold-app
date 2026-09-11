/* eslint-disable @typescript-eslint/no-require-imports, import/first, @typescript-eslint/no-explicit-any */
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { GLASS } from '@/constants/today-surfaces';
import { alpha } from '@/components/ui/utils/alpha';

const renderer = require('react-test-renderer');

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

const themeState = {
  isDark: true,
  colors: {
    backgroundElevated: '#181614',
    text: '#f5f0e8',
  },
};

jest.mock('@/lib/theme', () => ({
  useTheme: () => themeState,
}));

import { GlassSurface } from '../GlassSurface';

function flattenStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}) as Record<string, unknown>;
}

describe('GlassSurface', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    themeState.isDark = true;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('renders the dark-mode blur intensity and tint alpha from GLASS', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(
        <GlassSurface testID="glass">
          <Text>Inside</Text>
        </GlassSurface>,
      );
    });

    const blur = tree.root.findByProps({ testID: 'glass-surface-blur' });
    expect(blur.props.intensity).toBe(GLASS.blurIntensity.dark);
    expect(blur.props.tint).toBe('dark');

    const surface = flattenStyle(tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'glass')[0].props.style);
    expect(surface.backgroundColor).toBe(alpha('#181614', GLASS.tintAlpha.dark));
  });

  it('renders the light-mode blur intensity and tint alpha from GLASS', () => {
    themeState.isDark = false;
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(
        <GlassSurface testID="glass">
          <Text>Inside</Text>
        </GlassSurface>,
      );
    });

    const blur = tree.root.findByProps({ testID: 'glass-surface-blur' });
    expect(blur.props.intensity).toBe(GLASS.blurIntensity.light);
    expect(blur.props.tint).toBe('light');

    const surface = flattenStyle(tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'glass')[0].props.style);
    expect(surface.backgroundColor).toBe(alpha('#181614', GLASS.tintAlpha.light));
  });
});
