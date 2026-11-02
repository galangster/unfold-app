/* eslint-disable @typescript-eslint/no-require-imports, import/first, @typescript-eslint/no-explicit-any */
import React from 'react';
import { Text } from 'react-native';
import { Spacing } from '@/constants/spacing';
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

  it('keeps its children mounted when the art turns on or off', () => {
    const mounts = jest.fn();
    function Writer() {
      React.useEffect(() => {
        mounts();
      }, []);
      return <Text>Draft</Text>;
    }

    let tree: any;
    renderer.act(() => {
      tree = renderer.create(<HeroGround active><Writer /></HeroGround>);
    });
    renderer.act(() => tree.update(<HeroGround active={false}><Writer /></HeroGround>));
    renderer.act(() => tree.update(<HeroGround active><Writer /></HeroGround>));

    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('can stay inside an edge that already carries the page gutter', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(<HeroGround active bleedLeft={0}><Text>Greeting</Text></HeroGround>);
    });

    const [layer] = tree.root.findAllByProps({ testID: 'hero-ground-layer' });
    expect(layer.props.style.left).toBeCloseTo(0);
  });

  it('reaches past the page gutter so art cannot show beside the copy', () => {
    let tree: any;
    renderer.act(() => {
      tree = renderer.create(
        <HeroGround active>
          <Text>Hero copy</Text>
        </HeroGround>,
      );
    });

    const [layer] = tree.root.findAllByProps({ testID: 'hero-ground-layer' });
    expect(layer.props.style.left).toBe(-Spacing['6']);
  });
});
