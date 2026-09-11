/* eslint-disable @typescript-eslint/no-require-imports, import/first, @typescript-eslint/no-explicit-any */
import React from 'react';
import { Text } from 'react-native';
import { HERO_GROUND } from '@/constants/today-surfaces';

const renderer = require('react-test-renderer');

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: { background: '#0a0a0a' },
  }),
}));

import { HeroGround } from '../HeroGround';

describe('HeroGround', () => {
  it('does not render hero-ground when inactive', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(
        <HeroGround active={false}>
          <Text>Hero copy</Text>
        </HeroGround>,
      );
    });

    expect(tree.root.findAll((node: { props?: { testID?: string } }) => node.props?.testID === 'hero-ground')).toHaveLength(0);
  });

  it('renders hero-ground with the token locations when active', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(
        <HeroGround active>
          <Text>Hero copy</Text>
        </HeroGround>,
      );
    });

    const ground = tree.root.findByProps({ testID: 'hero-ground' });
    expect(ground.props.locations).toEqual([0, HERO_GROUND.midStop, HERO_GROUND.endStop]);
  });
});
