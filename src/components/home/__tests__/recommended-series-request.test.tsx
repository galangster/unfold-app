/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const testRenderers: Array<ReturnType<typeof renderer.create>> = [];
function createTestRenderer(element: React.ReactElement) {
  const tree = renderer.create(element);
  testRenderers.push(tree);
  return tree;
}

afterEach(async () => {
  await act(async () => {
    testRenderers.splice(0).forEach((tree) => tree.unmount());
  });
});

const mockStorage = new Map<string, string>();
const mockUpdateUser = jest.fn();
const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockTrackPickStart = jest.fn();
const focusEffects: Array<() => void> = [];
const mockFetch = jest.fn();
const mountedTrees: Array<ReturnType<typeof renderer.create>> = [];

afterEach(() => {
  act(() => {
    mountedTrees.splice(0).forEach((tree) => tree.unmount());
  });
});

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
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
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

jest.mock('@/lib/device-credential');

jest.mock('@/lib/qa-tools', () => ({
  isQaToolsEnabled: jest.fn(() => true),
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
import { authenticatedFetch } from '@/lib/device-credential';
import { isQaToolsEnabled } from '@/lib/qa-tools';

const mockAuthenticatedFetch = authenticatedFetch as jest.Mock;
const mockIsQaToolsEnabled = isQaToolsEnabled as jest.Mock;

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
    mockIsQaToolsEnabled.mockReturnValue(true);
  });

  it('clears a stale request ID before navigating to a recommended study', async () => {
    mockStorage.set(
      INITIAL_GENERATION_REQUEST_ID_KEY,
      '11111111-1111-4111-8111-111111111111',
    );

    let tree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = createTestRenderer(
        <RecommendedSeriesCard variant="empty" onChooseOther={jest.fn()} />,
      );
      mountedTrees.push(tree);
    });

    const start = tree.root.findByProps({
      accessibilityLabel: 'Start This Study: A Quiet Strength',
    });
    act(() => start.props.onPress());

    const removeItem = mmkvStorage.removeItem as jest.Mock;
    expect(readInitialGenerationRequestId()).toBeNull();
    expect(removeItem).toHaveBeenCalledWith(INITIAL_GENERATION_REQUEST_ID_KEY);
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/life-update', params: { next: 'series' } });
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
    mockIsQaToolsEnabled.mockReturnValue(true);
  });

  async function mount(props: Record<string, unknown> = {}) {
    let tree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = createTestRenderer(
        <RecommendedSeriesCard
          variant="empty"
          onChooseOther={jest.fn()}
          gateCreation={() => true}
          {...props}
        />,
      );
      mountedTrees.push(tree);
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
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/life-update', params: { next: 'series' } });
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

  it('offers one link beside Begin the Next Study after a finished series', async () => {
    const onChooseOther = jest.fn();
    const tree = await mount({ variant: 'completion', onChooseOther });
    const { Text } = require('react-native');
    const labels = tree.root.findAllByType(Text).map((node: { props: { children: unknown } }) => node.props.children);

    expect(labels).toContain('Begin the Next Study');
    expect(labels).toContain('Create your own series');
    expect(labels).not.toContain('Choose another direction');
    const link = tree.root.findByProps({ accessibilityLabel: 'Create your own series' });
    act(() => link.props.onPress());
    expect(onChooseOther).toHaveBeenCalledTimes(1);
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

  function renderedTexts(tree: ReturnType<typeof renderer.create>): unknown[] {
    const { Text } = require('react-native');
    return tree.root
      .findAllByType(Text)
      .map((node: { props: { children: unknown } }) => node.props.children);
  }

  async function mountFetched(body: Record<string, unknown>) {
    mockIsQaToolsEnabled.mockReturnValue(false);
    mockFetch.mockResolvedValue({ ok: true, json: async () => body });
    const tree = await mount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return tree;
  }

  const fetchedPick = { theme: 'trust', themeName: 'Learning to Trust', type: 'personal', suggestedLength: 7 };

  it('renders a stored pick line without its markdown heading', async () => {
    const tree = await mount({
      storedPick: { ...storedPick, line: '# Recommendation\n\nBecause this season is asking for patience.' },
    });

    const texts = renderedTexts(tree);
    expect(texts).toContain('Because this season is asking for patience.');
    expect(texts.join(' ')).not.toContain('#');
  });

  it.each([
    ['only markup', '# Recommendation'],
    ['oversized', '['.repeat(64_000)],
  ])('shows the plain fallback when a stored pick line is %s', async (_label, line) => {
    const tree = await mount({ storedPick: { ...storedPick, line } });

    expect(renderedTexts(tree)).toContain('A 7-day series on a quiet strength — right where you are right now.');
  });

  it('renders a fetched reason without its markdown heading', async () => {
    const tree = await mountFetched({
      ...fetchedPick,
      reason: '# Recommendation\n\nThis series meets you where doubt feels more honest.',
    });

    expect(renderedTexts(tree)).toContain('This series meets you where doubt feels more honest.');
  });

  it.each([
    ['null', { reason: null }],
    ['missing', {}],
  ])('shows the plain fallback when a fetched reason is %s', async (_label, reason) => {
    const tree = await mountFetched({ ...fetchedPick, ...reason });

    expect(renderedTexts(tree)).toContain('A 7-day series on learning to trust — right where you are right now.');
  });

  it.each([
    ['a number', 23],
    ['an object', { name: 'Trust' }],
  ])('renders without a theme name when the fetched one is %s', async (_label, themeName) => {
    const tree = await mountFetched({ ...fetchedPick, themeName, type: 'theme', reason: null });

    expect(renderedTexts(tree)).toContain('A 7-day series on this theme — right where you are right now.');
  });

  it.each([
    ['markdown', '**Trust**\nGod', 'A 7-day series on trust god — right where you are right now.'],
    ['html', '<b>Trust</b>', 'A new series — right where you are right now.'],
  ])('keeps the fallback plain when the theme name carries %s', async (_label, themeName, expected) => {
    const tree = await mountFetched({ ...fetchedPick, themeName, reason: null });

    expect(renderedTexts(tree)).toContain(expected);
  });

  it('renders the QA fixture reason unchanged', async () => {
    const tree = await mount();

    expect(renderedTexts(tree)).toContain(
      'Because this season is asking for patience without passivity — a study on waiting, courage, and hearing God clearly.',
    );
  });

  it('does not POST /api/jobs on render', async () => {
    await mount({ storedPick, gateCreation: () => true });

    const posts = mockFetch.mock.calls.filter((call) => {
      const init = call[1] as { method?: string } | undefined;
      return init?.method === 'POST' || String(call[0]).includes('/api/jobs');
    });
    expect(posts).toHaveLength(0);
  });

  it('loads the next-series recommendation through authenticatedFetch', async () => {
    mockIsQaToolsEnabled.mockReturnValue(false);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        theme: 'trust',
        themeName: 'Fetched Strength',
        type: 'theme',
        reason: 'Because this season needs courage.',
        suggestedLength: 7,
      }),
    });

    await mount();
    // Let the effect's request chain settle before asserting on the transport.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      'https://example.test/api/recommendations/next-series',
      expect.objectContaining({ headers: {} }),
    );
  });
});
