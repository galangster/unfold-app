/* eslint-disable import/first */
import React from 'react';
import { TextInput } from 'react-native';

const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://backend.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('@/lib/device-credential');
jest.mock('@/lib/personal-data-sync-records', () => ({
  ...jest.requireActual('@/lib/personal-data-sync-records'),
  enqueuePersonalDataSyncChange: jest.fn(),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' } }));
jest.mock('phosphor-react-native', () => ({ ArrowUpIcon: () => null, StopCircleIcon: () => null, MicrophoneIcon: () => null }));
jest.mock('@/components/VoiceInputBar', () => ({ VoiceInputBar: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ isDark: false, colors: { accent: '#D4AF37', inputBackground: '#FFF', border: '#DDD', text: '#111', textHint: '#777', textMuted: '#666', error: '#F00', buttonBackground: '#F4F4F4' } }) }));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { cubic: 'cubic', in: () => 'in', inOut: () => 'inOut', out: () => 'out' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown, _config?: unknown, callback?: () => void) => {
      callback?.();
      return value;
    },
  };
});

import { CompanionInput } from '../CompanionInput';
import { clearCompanionDrafts } from '@/lib/companion-drafts';
import { useCompanionChatStore, type CompanionMessage } from '@/lib/companion-chat-store';

let messageCount = 0;
function userMessage(content: string): CompanionMessage {
  messageCount += 1;
  return { id: `message-${messageCount}`, role: 'user', content, timestamp: messageCount, status: 'sent' };
}

// The Ask screen's wiring: the composer follows the store's active conversation.
function Composer() {
  const conversationId = useCompanionChatStore((state) => state.activeConversationId);
  return (
    <CompanionInput
      conversationId={conversationId}
      onSend={(text) => {
        useCompanionChatStore.getState().addMessage(userMessage(text));
        return true;
      }}
      onStop={jest.fn()}
      isStreaming={false}
    />
  );
}

describe('CompanionInput with the chat store', () => {
  let tree: any;
  const store = () => useCompanionChatStore.getState();
  const shownText = () => tree.root.findByType(TextInput).props.value;
  const type = (text: string) => act(() => tree.root.findByType(TextInput).props.onChangeText(text));
  const run = (action: () => void) => act(() => action());

  beforeEach(() => {
    clearCompanionDrafts();
    useCompanionChatStore.setState({ conversations: [], activeConversationId: null });
    act(() => {
      tree = renderer.create(<Composer />);
    });
  });

  afterEach(() => {
    act(() => tree.unmount());
  });

  it('keeps text typed with no conversation in the conversation a starter card creates', () => {
    type("Pray for Sam's surgery");
    run(() => store().addMessage(userMessage('Help me pray')));
    const created = store().activeConversationId!;
    expect(shownText()).toBe("Pray for Sam's surgery");

    run(() => store().startNewConversation());
    expect(shownText()).toBe('');
    run(() => store().setActiveConversation(created));
    expect(shownText()).toBe("Pray for Sam's surgery");
  });

  it('leaves nothing behind when the composer itself sends the first message', () => {
    type('Hello');
    act(() => tree.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress());
    const created = store().activeConversationId!;
    expect(shownText()).toBe('');

    run(() => store().startNewConversation());
    expect(shownText()).toBe('');
    run(() => store().setActiveConversation(created));
    expect(shownText()).toBe('');
  });

  it('keeps a draft with its conversation when a pull removes its messages, and never shares it', () => {
    run(() => store().addMessage(userMessage('First')));
    const kept = store().activeConversationId!;
    type('Still writing');

    // A pull accepts the message tombstones but rejects the conversation's.
    run(() => useCompanionChatStore.setState((state) => ({
      conversations: state.conversations.map((c) => (c.id === kept ? { ...c, messages: [] } : c)),
    })));
    expect(shownText()).toBe('Still writing');

    run(() => store().startNewConversation());
    expect(shownText()).toBe('');
  });

  it('does not carry text typed in an empty chat into the next new chat', () => {
    run(() => store().addMessage(userMessage('First')));
    run(() => store().startNewConversation());
    type('Half a thought');

    run(() => store().startNewConversation());
    expect(shownText()).toBe('');
  });
});
