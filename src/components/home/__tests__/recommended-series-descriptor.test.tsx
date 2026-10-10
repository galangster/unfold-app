/**
 * The next-study card body. Each mount fetches a new recommendation, and the
 * server writes a new reason each time: a first-person rationale on one
 * fetch, the plain descriptor on the next when the written sentence is cut
 * off. A relaunch remounts the card, so the body changed. The card always
 * shows the short descriptor, built from the length and the theme.
 */
/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockFetch = jest.fn();

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const values = new Map<string, string>();
    return {
      getString: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: string) => values.set(key, value)),
      delete: jest.fn((key: string) => values.delete(key)),
    };
  }),
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({})),
}));

jest.mock('@/lib/device-credential', () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('@/lib/bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('@/lib/mmkv-storage', () => {
  const values = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => values.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => values.set(key, value)),
      removeItem: jest.fn((key: string) => values.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

jest.mock('@/lib/qa-tools', () => ({ isQaToolsEnabled: () => false }));
jest.mock('@/lib/auto-trial-telemetry', () => ({ trackAutoTrialPickStartTapped: jest.fn() }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, []);
  },
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
    Easing: { cubic: 'cubic', bezier: () => 'bezier', out: () => 'out', in: () => 'in', inOut: () => 'inOut' },
  };
});

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: { accent: '#c8a55c', backgroundElevated: '#181614', text: '#f5f0e8', textMuted: '#b9ad9e' },
  }),
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ entering: (animation: unknown) => animation }),
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

import { RecommendedSeriesCard } from '../RecommendedSeriesCard';
import { flushUnfoldStorePersist, useUnfoldStore, type NextPick } from '@/lib/store';

const RECOMMENDATION = { theme: 'trust', themeName: 'Learning to Trust', type: 'theme', suggestedLength: 7 as const };
const DESCRIPTOR = 'A 7-day series on learning to trust — right where you are right now.';
// Synthetic stand-in for a first-person rationale.
const FIRST_PERSON_RATIONALE = 'Since I know nothing about where you are right now, I picked a study on trust that I think can meet you.';

async function renderCard(props: { storedPick?: NextPick | null } = {}): Promise<string[]> {
  const { Text } = require('react-native');
  let tree!: ReturnType<typeof renderer.create>;
  await act(async () => {
    tree = renderer.create(<RecommendedSeriesCard variant="completion" onChooseOther={() => {}} {...props} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const texts = tree.root.findAllByType(Text).map((node: { props: { children: unknown } }) => (
    ([] as unknown[]).concat(node.props.children).join('')
  ));
  act(() => tree.unmount());
  return texts;
}

function serveReason(reason: string) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...RECOMMENDATION, reason, source: 'scored' }) });
}

async function relaunch() {
  flushUnfoldStorePersist();
  await useUnfoldStore.persist.rehydrate();
}

describe('the next-study card body', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useUnfoldStore.getState().reset();
    flushUnfoldStorePersist();
  });

  it('shows the short descriptor before and after a relaunch, never the first-person rationale', async () => {
    serveReason(FIRST_PERSON_RATIONALE);
    const before = await renderCard();

    await relaunch();
    serveReason(DESCRIPTOR);
    const after = await renderCard();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(before).toContain(DESCRIPTOR);
    expect(before).not.toContain(FIRST_PERSON_RATIONALE);
    expect(after).toEqual(before);
  });

  it('shows the same descriptor for a stored trial pick', async () => {
    const before = await renderCard({ storedPick: { ...RECOMMENDATION, line: FIRST_PERSON_RATIONALE } });
    await relaunch();
    const after = await renderCard({ storedPick: { ...RECOMMENDATION, line: FIRST_PERSON_RATIONALE } });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(before).toContain(DESCRIPTOR);
    expect(before).not.toContain(FIRST_PERSON_RATIONALE);
    expect(after).toEqual(before);
  });
});
