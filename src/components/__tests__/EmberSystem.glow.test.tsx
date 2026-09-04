/**
 * Render-level guard for the EmberSystem `glow` opt-out.
 *
 * `resolveEmberParams` zeroes `glowOpacity` on `glow: false`, but the
 * reduce-motion still poster used to route `variant="celebration"` around the
 * resolver to `getCelebrationStillGlow()`, so the opt-out silently failed on
 * that one path. These tests mount the component on both render paths
 * (animated field and still poster) and both variants, and count the glow
 * gradients that actually reach the tree. The claim "the opt-out is
 * variant-independent" is proven here, not only at the resolver.
 */

import React from 'react';
import { AppState } from 'react-native';
import { getCelebrationStillGlow, resolveEmberParams } from '@/lib/ember-system';

const renderer = require('react-test-renderer');
const { act } = renderer;

let mockReducedMotion = false;

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const easingFn = () => 0;
  const Easing = {
    linear: easingFn,
    ease: easingFn,
    quad: easingFn,
    cubic: easingFn,
    sin: easingFn,
    bezier: () => easingFn,
    in: () => easingFn,
    out: () => easingFn,
    inOut: () => easingFn,
  };
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    Easing,
    interpolate: (value: number) => value,
    cancelAnimation: () => undefined,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (fn: () => unknown) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    withTiming: (toValue: unknown) => toValue,
    withRepeat: (animation: unknown) => animation,
    withDelay: (_delay: number, animation: unknown) => animation,
  };
});

// The glow is the only LinearGradient EmberSystem mounts. Tag it so the tree
// can be counted without depending on style internals.
jest.mock('expo-linear-gradient', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { ...props, testID: 'ember-glow-gradient' }),
  };
});

jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: React.ReactNode }) => ReactLib.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Circle: Stub, Defs: Stub, RadialGradient: Stub, Stop: Stub };
});

jest.mock('@/hooks/useLowPowerMode', () => ({ useLowPowerMode: () => false }));
jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: mockReducedMotion }),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: { accent: '#C8A55C', textMuted: '#B9AD9E', textSubtle: '#8C8176' },
  }),
}));

import { EmberSystem } from '../EmberSystem';

type EmberProps = React.ComponentProps<typeof EmberSystem>;

async function render(props: EmberProps) {
  let tree: any;
  await act(async () => {
    tree = renderer.create(<EmberSystem {...props} />);
  });
  return tree;
}

// The mocked LinearGradient renders a host View carrying the testID; the
// string type filter keeps one match per gradient.
function glowGradients(tree: any): any[] {
  return tree.root.findAll((n: any) => n.type === 'View' && n.props?.testID === 'ember-glow-gradient');
}

function firstStopAlpha(node: any): number {
  const first = String(node.props.colors[0]);
  return Number(first.slice(first.lastIndexOf(' ') + 1, -1));
}

// The onboarding mirrorBack preset (count 10 / intensity 0.7).
const MIRROR_BACK: EmberProps = { variant: 'ambient', direction: 'both', count: 10, intensity: 0.7 };

beforeAll(() => {
  // useIsAppActive gates the whole layer on AppState; the jest preset mock
  // does not promise a value, so pin it.
  Object.assign(AppState, { currentState: 'active' });
});

describe('EmberSystem glow opt-out on the reduce-motion still poster', () => {
  beforeEach(() => {
    mockReducedMotion = true;
  });

  it('celebration still keeps its borrowed next-tier glow by default (canon)', async () => {
    const tree = await render({ variant: 'celebration' });
    const glows = glowGradients(tree);
    expect(glows).toHaveLength(1);
    const canon = getCelebrationStillGlow();
    expect(firstStopAlpha(glows[0])).toBeCloseTo(canon.glowOpacity);
    expect(glows[0].props.style).toEqual(expect.arrayContaining([{ height: canon.glowHeight }]));
  });

  it('celebration still mounts no glow when glow={false}', async () => {
    const tree = await render({ variant: 'celebration', glow: false });
    expect(glowGradients(tree)).toHaveLength(0);
  });

  it('ambient still keeps the resolved glow by default', async () => {
    const tree = await render(MIRROR_BACK);
    const glows = glowGradients(tree);
    expect(glows).toHaveLength(1);
    const resolved = resolveEmberParams({ variant: 'ambient', isDark: true, count: 10, intensity: 0.7 });
    expect(firstStopAlpha(glows[0])).toBeCloseTo(resolved.glowOpacity);
  });

  it('ambient still (mirrorBack preset) mounts no glow when glow={false}', async () => {
    const tree = await render({ ...MIRROR_BACK, glow: false });
    expect(glowGradients(tree)).toHaveLength(0);
  });
});

describe('EmberSystem glow opt-out on the animated field', () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it.each<EmberProps>([{ variant: 'celebration' }, MIRROR_BACK])(
    'mounts one glow by default for %o',
    async (props) => {
      const tree = await render(props);
      expect(glowGradients(tree)).toHaveLength(1);
    },
  );

  it.each<EmberProps>([{ variant: 'celebration' }, MIRROR_BACK])(
    'mounts no glow with glow={false} for %o',
    async (props) => {
      const tree = await render({ ...props, glow: false });
      expect(glowGradients(tree)).toHaveLength(0);
    },
  );
});
