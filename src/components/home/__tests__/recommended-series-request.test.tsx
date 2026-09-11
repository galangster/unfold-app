/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockStorage = new Map<string, string>();
const mockUpdateUser = jest.fn();
const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockTrackPickStart = jest.fn();
const focusEffects: Array<() => void> = [];
const mockFetch = jest.fn();

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn((key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => mockStorage.set(key, value)),
    removeItem: jest.fn((key: string) => mockStorage.delete(key)),
  },
}));

jest.mock('@/lib/sync-ids', () => ({
  newId: jest.fn(() => '22222222-2222-4222-8222-222222222222'),
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) => selector({
    user: { aboutMe: 'qa-today-profile' },
    updateUser: mockUpdateUser,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  useFocusEffect: (cb: () => void) => {
    focusEffects.push(cb);
  },
}));

jest.mock('@/lib/auto-trial-telemetry', () => ({
  trackAutoTrialPickStartTapped: (...args: unknown[]) => mockTrackPickStart(...args),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const animation: Record<string, unknown> = {};
  animation.duration = () => animation;
  animation.easing = () => animation;
  return {
    __esModule: true,
    default: { View },
    FadeIn: animation,
    Easing: {
      cubic: 'cubic',
      out: () => 'out',
      in: () => 'in',
      inOut: () => 'inOut',
    },
  };
});

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      accent: '#c8a55c',
      backgroundElevated: '#181614',
      text: '#f5f0e8',
      textMuted: '#b9ad9e',
    },
  }),
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ entering: (animation: unknown) => animation }),
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({})),
}));

jest.mock('@/lib/qa-tools', () => ({
  isQaToolsEnabled: () => true,
}));

jest.mock('@/lib/qa-today-marker', () => ({
  getQaTodayProfileMarker: () => 'qa-today-profile',
}));

import { RecommendedSeriesCard } from '../RecommendedSeriesCard';
import {
  INITIAL_GENERATION_REQUEST_ID_KEY,
  readInitialGenerationRequestId,
} from '@/lib/initial-generation-request';
import { mmkvStorage } from '@/lib/mmkv-storage';

const storedPick = {
  theme: 'trust',
  themeName: 'A Quiet Strength',
  type: 'theme',
  suggestedLength: 7 as const,
  line: 'Because this season is asking for patience.',
};

describe('RecommendedSeriesCard initial generation identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
    focusEffects.length = 0;
    global.fetch = mockFetch;
  });

  it('clears a stale request ID before navigating to a recommended study', async () => {
    mockStorage.set(
      INITIAL_GENERATION_REQUEST_ID_KEY,
      '11111111-1111-4111-8111-111111111111',
    );

    let tree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(
        <RecommendedSeriesCard variant="empty" onChooseOther={jest.fn()} />,
      );
    });

    const start = tree.root.findByProps({
      accessibilityLabel: 'Start This Study: A Quiet Strength',
    });
    act(() => start.props.onPress());

    const removeItem = mmkvStorage.removeItem as jest.Mock;
    expect(readInitialGenerationRequestId()).toBeNull();
    expect(removeItem).toHaveBeenCalledWith(INITIAL_GENERATION_REQUEST_ID_KEY);
    expect(mockNavigate).toHaveBeenCalledWith('/generating');
    expect(mockPush).not.toHaveBeenCalled();
    expect(removeItem.mock.invocationCallOrder[0])
      .toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
  });
});

describe('J10 RecommendedSeriesCard start-study gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
    focusEffects.length = 0;
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  async function mount(props: Record<string, unknown> = {}) {
    let tree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(
        <RecommendedSeriesCard
          variant="empty"
          onChooseOther={jest.fn()}
          gateCreation={() => true}
          {...props}
        />,
      );
    });
    return tree;
  }

  function pressStart(tree: ReturnType<typeof renderer.create>) {
    const start = tree.root.findByProps({
      accessibilityLabel: 'Start This Study: A Quiet Strength',
    });
    act(() => start.props.onPress());
    return start;
  }

  it('does not clear, update, or navigate when the gate returns false', async () => {
    mockStorage.set(
      INITIAL_GENERATION_REQUEST_ID_KEY,
      '11111111-1111-4111-8111-111111111111',
    );
    const gateCreation = jest.fn(() => false);
    const tree = await mount({ gateCreation });

    pressStart(tree);

    expect(gateCreation).toHaveBeenCalledTimes(1);
    expect(readInitialGenerationRequestId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('gates first, then clears, updates, and navigates without push', async () => {
    const gateCreation = jest.fn(() => true);
    const tree = await mount({ gateCreation });

    pressStart(tree);

    expect(gateCreation).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/generating');
    expect(mockPush).not.toHaveBeenCalled();
    expect(gateCreation.mock.invocationCallOrder[0])
      .toBeLessThan((mmkvStorage.removeItem as jest.Mock).mock.invocationCallOrder[0]);
    expect((mmkvStorage.removeItem as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan(mockUpdateUser.mock.invocationCallOrder[0]);
    expect(mockUpdateUser.mock.invocationCallOrder[0])
      .toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
  });

  it('runs one gated start across two synchronous presses', async () => {
    const gateCreation = jest.fn(() => true);
    const tree = await mount({ gateCreation });
    const start = tree.root.findByProps({
      accessibilityLabel: 'Start This Study: A Quiet Strength',
    });

    act(() => {
      start.props.onPress();
      start.props.onPress();
    });

    expect(gateCreation).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('allows a second press after a blocked first press', async () => {
    const gateCreation = jest.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const tree = await mount({ gateCreation });
    const start = tree.root.findByProps({
      accessibilityLabel: 'Start This Study: A Quiet Strength',
    });

    act(() => start.props.onPress());
    act(() => start.props.onPress());

    expect(gateCreation).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('navigates again after a focus reset', async () => {
    const gateCreation = jest.fn(() => true);
    const tree = await mount({ gateCreation });
    const start = tree.root.findByProps({
      accessibilityLabel: 'Start This Study: A Quiet Strength',
    });

    act(() => start.props.onPress());
    expect(mockNavigate).toHaveBeenCalledTimes(1);

    act(() => {
      focusEffects.forEach((effect) => effect());
    });
    act(() => start.props.onPress());

    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('skips the recommendation fetch when storedPick is present', async () => {
    const tree = await mount({
      storedPick,
      gateCreation: () => true,
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(tree.root.findByProps({
      accessibilityLabel: 'Start This Study: A Quiet Strength',
    })).toBeTruthy();
  });

  it('does not POST /api/jobs on render', async () => {
    await mount({ storedPick, gateCreation: () => true });

    const posts = mockFetch.mock.calls.filter((call) => {
      const init = call[1] as { method?: string } | undefined;
      return init?.method === 'POST' || String(call[0]).includes('/api/jobs');
    });
    expect(posts).toHaveLength(0);
  });
});
