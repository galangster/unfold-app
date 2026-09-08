/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockStorage = new Map<string, string>();
const mockUpdateUser = jest.fn();
const mockPush = jest.fn();

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
  useRouter: () => ({ push: mockPush }),
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

describe('RecommendedSeriesCard initial generation identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
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
    expect(mockPush).toHaveBeenCalledWith('/generating');
    expect(removeItem.mock.invocationCallOrder[0])
      .toBeLessThan(mockPush.mock.invocationCallOrder[0]);
  });
});
