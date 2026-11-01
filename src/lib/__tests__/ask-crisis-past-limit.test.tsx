/**
 * A free reader whose daily Companion messages are used up still reaches
 * help: a conversation that names suicide, self-harm or abuse sends past the
 * limit, opens no paywall, and uses no free message. Every other conversation
 * keeps the daily limit.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

type Message = { id: string; role: 'user' | 'companion'; content: string; status: string };

const mockQuota = { remaining: 0 };
const mockIncrement = jest.fn();
const mockSend = jest.fn();
const mockRegenerate = jest.fn();
const mockChat: { messages: Message[] } = { messages: [] };
const mockInput: { onSend?: (text: string) => boolean } = {};
const mockRetry = new Map<string, () => void>();

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
  useAdaptiveLayout: () => jest.requireActual('@/lib/adaptive-layout').resolveAdaptiveLayout({
    width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0,
  }),
}));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: true }) }));
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({ usePremiumAccessPolicy: () => 'denied' }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: false, colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({ devotionals: [], currentDevotionalId: null, user: null }),
  FONT_SIZE_VALUES: { medium: { body: 17, scripture: 21, title: 32 } },
}));
jest.mock('@/lib/home-devotional-state', () => ({ getCurrentDevotional: () => undefined }));
jest.mock('@/hooks/useReaderScripture', () => ({ useReaderScripture: () => undefined }));
jest.mock('@/lib/useReadingFont', () => ({ useReadingFont: () => ({ body: 'SourceSerif' }) }));
jest.mock('@/lib/companion-personality', () => ({ resolveCompanionPersonality: () => 'warm' }));
jest.mock('@/lib/premium-gating', () => ({
  canSendCompanionMessage: () => mockQuota.remaining > 0,
  incrementCompanionDailyCount: () => mockIncrement(),
  getCompanionDailyUsage: () => ({ remaining: mockQuota.remaining }),
  FREE_COMPANION_DAILY_LIMIT: 10,
}));
jest.mock('@/lib/use-companion-chat', () => ({
  COMPANION_MESSAGE_MAX_CHARS: 2000,
  useCompanionChat: () => ({
    messages: mockChat.messages,
    activeConversationId: 'a',
    isStreaming: false,
    activeRequestCompanionId: null,
    suggestions: [],
    sendMessage: mockSend,
    regenerateReply: mockRegenerate,
    stopGeneration: jest.fn(),
    startNewConversation: jest.fn(),
  }),
}));
jest.mock('@/components/icons', () => ({ CrownIcon: () => null, List: () => null, NotePencil: () => null, SidebarSimpleIcon: () => null }));
jest.mock('@/components/CompanionOrb', () => ({ CompanionOrb: () => null }));
jest.mock('@/components/ProfileEntryButton', () => ({ ProfileEntryButton: () => null }));
jest.mock('@/components/ScriptureTapSheet', () => ({ ScriptureTapSheet: () => null }));
jest.mock('@/components/PremiumFeatureSheet', () => {
  const { View } = require('react-native');
  return {
    PremiumFeatureSheet: ({ visible }: { visible: boolean }) => (visible ? <View testID="paywall" /> : null),
  };
});
jest.mock('@/components/companion/CompanionEmptyState', () => ({ CompanionEmptyState: () => null }));
jest.mock('@/components/companion/UserMessageBubble', () => ({ UserMessageBubble: () => null }));
jest.mock('@/components/companion/CompanionMessageContent', () => ({
  CompanionMessageContent: ({ message, onRetry }: { message: Message; onRetry?: () => void }) => {
    if (onRetry) mockRetry.set(message.id, onRetry);
    return null;
  },
}));
jest.mock('@/components/companion/CompanionActions', () => ({ CompanionActions: () => null }));
jest.mock('@/components/companion/SuggestionChips', () => ({ SuggestionChips: () => null }));
jest.mock('@/components/companion/CompanionInput', () => ({
  CompanionInput: ({ onSend }: { onSend: (text: string) => boolean }) => {
    mockInput.onSend = onSend;
    return null;
  },
}));
jest.mock('@/components/companion/CompanionDrawer', () => ({
  CompanionDrawer: () => null,
  useDrawerGesture: () => ({}),
}));

// eslint-disable-next-line import/first
import CompanionScreen from '@/app/(tabs)/(ask)/index';

const CRISIS_TEXT = 'I feel suicidal tonight';
const PLAIN_TEXT = 'What does this verse mean?';

const mounted: renderer.ReactTestRenderer[] = [];

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CompanionScreen />);
  });
  mounted.push(tree);
  return tree;
}

function paywallShown(tree: renderer.ReactTestRenderer) {
  return tree.root.findAll((node) => node.props.testID === 'paywall' && typeof node.type === 'string').length > 0;
}

async function send(text: string) {
  let accepted = false;
  await act(async () => {
    accepted = mockInput.onSend!(text);
  });
  return accepted;
}

describe('Ask crisis conversation past the daily limit', () => {
  beforeEach(() => {
    mockQuota.remaining = 0;
    mockChat.messages = [];
    mockIncrement.mockClear();
    mockSend.mockReset().mockResolvedValue('sent');
    mockRegenerate.mockReset().mockResolvedValue('sent');
    mockRetry.clear();
    delete mockInput.onSend;
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach((tree) => tree.unmount());
    });
  });

  it('sends a message that names a crisis after the limit, with no paywall', async () => {
    const tree = render();
    expect(await send(CRISIS_TEXT)).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(CRISIS_TEXT);
    expect(paywallShown(tree)).toBe(false);
  });

  it('sends a later message in a crisis conversation after the limit', async () => {
    mockChat.messages = [
      { id: 'u1', role: 'user', content: CRISIS_TEXT, status: 'complete' },
      { id: 'c1', role: 'companion', content: 'A reply.', status: 'complete' },
    ];
    const tree = render();
    expect(await send(PLAIN_TEXT)).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(PLAIN_TEXT);
    expect(paywallShown(tree)).toBe(false);
  });

  it('retries a failed reply in a crisis conversation after the limit', async () => {
    mockChat.messages = [
      { id: 'u1', role: 'user', content: CRISIS_TEXT, status: 'complete' },
      { id: 'c1', role: 'companion', content: 'No reply.', status: 'error' },
    ];
    const tree = render();
    await act(async () => {
      mockRetry.get('c1')!();
    });
    expect(mockRegenerate).toHaveBeenCalledWith({ companionId: 'c1' });
    expect(paywallShown(tree)).toBe(false);
  });

  it('uses no free message for a crisis reply', async () => {
    mockQuota.remaining = 3;
    render();
    expect(await send(CRISIS_TEXT)).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(CRISIS_TEXT);
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it('keeps the paywall for a conversation with no crisis', async () => {
    mockChat.messages = [
      { id: 'u1', role: 'user', content: PLAIN_TEXT, status: 'complete' },
      { id: 'c1', role: 'companion', content: 'No reply.', status: 'error' },
    ];
    const tree = render();
    expect(await send(PLAIN_TEXT)).toBe(false);
    await act(async () => {
      mockRetry.get('c1')!();
    });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRegenerate).not.toHaveBeenCalled();
    expect(paywallShown(tree)).toBe(true);
  });

  it('still uses a free message for a reply with no crisis', async () => {
    mockQuota.remaining = 3;
    render();
    expect(await send(PLAIN_TEXT)).toBe(true);
    expect(mockIncrement).toHaveBeenCalledTimes(1);
  });
});
