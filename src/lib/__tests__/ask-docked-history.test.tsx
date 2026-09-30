/**
 * Docked conversation history on Ask (iPhone Duo): a paired window docks the
 * history beside the conversation, and the history toggle collapses it. The
 * conversation keeps its slot, so collapsing never remounts the composer.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockWindow = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };
const mockComposerMounts = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-reanimated', () => ({
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
}));
jest.mock('@/hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => jest.requireActual('@/lib/adaptive-layout').resolveAdaptiveLayout(mockWindow),
}));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: true }) }));
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({ usePremiumAccessPolicy: () => 'granted' }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: false, colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) => selector({ devotionals: [], currentDevotionalId: null, user: null }),
}));
jest.mock('@/lib/home-devotional-state', () => ({ getCurrentDevotional: () => undefined }));
jest.mock('@/lib/companion-personality', () => ({ resolveCompanionPersonality: () => 'warm' }));
jest.mock('@/lib/premium-gating', () => ({
  canSendCompanionMessage: () => true,
  incrementCompanionDailyCount: jest.fn(),
  getCompanionDailyUsage: () => ({ remaining: 10 }),
  FREE_COMPANION_DAILY_LIMIT: 10,
}));
jest.mock('@/lib/use-companion-chat', () => ({
  COMPANION_MESSAGE_MAX_CHARS: 2000,
  useCompanionChat: () => ({
    messages: [],
    activeConversationId: 'a',
    isStreaming: false,
    activeRequestCompanionId: null,
    suggestions: [],
    sendMessage: jest.fn(),
    regenerateReply: jest.fn(),
    stopGeneration: jest.fn(),
    startNewConversation: jest.fn(),
  }),
}));
jest.mock('@/components/icons', () => ({ CrownIcon: () => null, List: () => null, NotePencil: () => null }));
jest.mock('@/components/CompanionOrb', () => ({ CompanionOrb: () => null }));
jest.mock('@/components/ProfileEntryButton', () => ({ ProfileEntryButton: () => null }));
jest.mock('@/components/ScriptureTapSheet', () => ({ ScriptureTapSheet: () => null }));
jest.mock('@/components/PremiumFeatureSheet', () => ({ PremiumFeatureSheet: () => null }));
jest.mock('@/components/companion/CompanionEmptyState', () => ({ CompanionEmptyState: () => null }));
jest.mock('@/components/companion/UserMessageBubble', () => ({ UserMessageBubble: () => null }));
jest.mock('@/components/companion/CompanionMessageContent', () => ({ CompanionMessageContent: () => null }));
jest.mock('@/components/companion/CompanionActions', () => ({ CompanionActions: () => null }));
jest.mock('@/components/companion/SuggestionChips', () => ({ SuggestionChips: () => null }));
jest.mock('@/components/companion/CompanionInput', () => {
  const { useEffect } = require('react');
  const { View } = require('react-native');
  return {
    CompanionInput: () => {
      useEffect(() => {
        mockComposerMounts();
      }, []);
      return <View testID="ask-composer" />;
    },
  };
});
jest.mock('@/components/companion/CompanionDrawer', () => {
  const { View } = require('react-native');
  return {
    CompanionDrawer: ({ docked, isOpen }: { docked?: boolean; isOpen: boolean }) => (
      <View testID={docked ? 'docked-history' : 'overlay-drawer'} accessibilityState={{ expanded: isOpen }} />
    ),
    useDrawerGesture: () => ({}),
  };
});

// eslint-disable-next-line import/first
import CompanionScreen from '@/app/(tabs)/(ask)/index';

const PAIRED = { width: 860, height: 700, insetTop: 24, insetBottom: 20, insetLeft: 0, insetRight: 0 };
const COMPACT = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };

const mounted: renderer.ReactTestRenderer[] = [];

function render(window: typeof PAIRED) {
  Object.assign(mockWindow, window);
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CompanionScreen />);
  });
  mounted.push(tree);
  return tree;
}

function host(tree: renderer.ReactTestRenderer, testID: string) {
  return tree.root.findAll((node) => node.props.testID === testID && typeof node.type === 'string');
}

function hostCount(tree: renderer.ReactTestRenderer, testID: string) {
  return host(tree, testID).length;
}

function historyToggle(tree: renderer.ReactTestRenderer) {
  const [toggle] = tree.root.findAll(
    (node) => typeof node.props.accessibilityLabel === 'string'
      && node.props.accessibilityLabel.endsWith('conversation history')
      && typeof node.props.onPress === 'function',
  );
  return toggle;
}

function press(tree: renderer.ReactTestRenderer) {
  act(() => {
    historyToggle(tree).props.onPress();
  });
}

describe('Ask docked conversation history', () => {
  beforeEach(() => {
    mockComposerMounts.mockClear();
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach((tree) => tree.unmount());
    });
  });

  it('docks the history on a paired window and offers to hide it', () => {
    const tree = render(PAIRED);

    expect(hostCount(tree, 'docked-history')).toBe(1);
    expect(hostCount(tree, 'overlay-drawer')).toBe(0);
    expect(historyToggle(tree).props.accessibilityLabel).toBe('Hide conversation history');
  });

  it('collapses and restores the docked history without remounting the conversation', () => {
    const tree = render(PAIRED);
    expect(mockComposerMounts).toHaveBeenCalledTimes(1);

    press(tree);
    expect(hostCount(tree, 'docked-history')).toBe(0);
    expect(hostCount(tree, 'overlay-drawer')).toBe(0);
    expect(hostCount(tree, 'ask-composer')).toBe(1);
    expect(historyToggle(tree).props.accessibilityLabel).toBe('Show conversation history');

    press(tree);
    expect(hostCount(tree, 'docked-history')).toBe(1);
    expect(historyToggle(tree).props.accessibilityLabel).toBe('Hide conversation history');
    expect(mockComposerMounts).toHaveBeenCalledTimes(1);
  });

  it('gives the collapsed conversation the full width, as unpaired', () => {
    const paired = render(PAIRED);
    press(paired);
    const [panes] = host(paired, 'companion-docked-panes');
    const second = panes.children[0] as renderer.ReactTestInstance;

    expect(panes.children).toHaveLength(1);
    expect(second.props.style).toEqual({ flex: 1 });
  });

  it('opens the overlay drawer from the toggle on a compact window', () => {
    const tree = render(COMPACT);

    expect(hostCount(tree, 'docked-history')).toBe(0);
    expect(hostCount(tree, 'overlay-drawer')).toBe(1);
    expect(historyToggle(tree).props.accessibilityLabel).toBe('Open conversation history');

    press(tree);
    expect(host(tree, 'overlay-drawer')[0].props.accessibilityState).toEqual({ expanded: true });
    expect(hostCount(tree, 'docked-history')).toBe(0);
  });
});
