/* eslint-disable import/first */
import React from 'react';
import { Keyboard } from 'react-native';

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
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('@/components/icons', () => ({
  DotsThreeIcon: () => null,
  MagnifyingGlassIcon: () => null,
  PlusCircle: () => null,
  XIcon: () => null,
}));
jest.mock('@/components/ui/Sheet', () => ({ Sheet: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      accent: '#D4AF37',
      background: '#FFF',
      backgroundElevated: '#FAFAFA',
      inputBackground: '#FFF',
      border: '#DDD',
      text: '#111',
      textMuted: '#666',
      error: '#F00',
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => ({ Gesture: {} }));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    interpolate: () => 0,
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => ({ value }),
    withSpring: (value: unknown) => value,
  };
});

import { CompanionDrawer } from '../CompanionDrawer';
import { useCompanionChatStore, type Conversation } from '@/lib/companion-chat-store';

function conversation(id: string, title: string): Conversation {
  const now = Date.now();
  return {
    id,
    title,
    createdAt: now,
    lastMessageAt: now,
    topicTags: [],
    archived: false,
    messages: [{ id: `${id}-m`, role: 'user', content: title, timestamp: now, status: 'sent' }],
  };
}

type DrawerProps = React.ComponentProps<typeof CompanionDrawer>;

const mounted: any[] = [];

function renderDrawer(props: Partial<DrawerProps> = {}) {
  const handlers = {
    onOpen: jest.fn(),
    onClose: jest.fn(),
    onNewChat: jest.fn(),
    onWillSwitchConversation: jest.fn(),
  };
  let tree: any;
  act(() => {
    tree = renderer.create(
      <CompanionDrawer translateX={{ value: -320 } as never} isOpen={false} {...handlers} {...props} />,
    );
  });
  mounted.push(tree);
  return { tree, handlers };
}

function byTestId(tree: any, testID: string) {
  return tree.root.findAll((node: any) => node.props.testID === testID && typeof node.type === 'string');
}

function hasControl(tree: any, label: string) {
  return tree.root.findAll((node: any) => node.props.accessibilityLabel === label && node.props.onPress).length > 0;
}

function hasText(tree: any, text: string) {
  return tree.root.findAll((node: any) => node.props.children === text).length > 0;
}

describe('CompanionDrawer docked mode', () => {
  beforeEach(() => {
    act(() => {
      useCompanionChatStore.setState({
        conversations: [conversation('a', 'Morning psalm'), conversation('b', 'Anxious week')],
        activeConversationId: 'a',
      });
    });
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach((tree) => tree.unmount());
    });
    jest.restoreAllMocks();
  });

  it('renders the history list without the scrim, close control, or modal flag', () => {
    const { tree } = renderDrawer({ docked: true });

    expect(byTestId(tree, 'companion-history-docked')).toHaveLength(1);
    expect(byTestId(tree, 'companion-drawer-scrim')).toHaveLength(0);
    expect(hasText(tree, 'Morning psalm')).toBe(true);
    expect(hasText(tree, 'Anxious week')).toBe(true);
    expect(hasControl(tree, 'Close history')).toBe(false);
    expect(hasControl(tree, 'Start new conversation')).toBe(true);
    expect(tree.root.findAll((node: any) => node.props.accessibilityViewIsModal === true)).toHaveLength(0);
    expect(tree.root.findAll((node: any) => node.props.accessibilityElementsHidden === true)).toHaveLength(0);
  });

  it('keeps the compact overlay drawer with its scrim and modal flag', () => {
    const { tree } = renderDrawer({ isOpen: true });

    expect(byTestId(tree, 'companion-history-docked')).toHaveLength(0);
    expect(byTestId(tree, 'companion-drawer-scrim')).toHaveLength(1);
    expect(hasControl(tree, 'Close history')).toBe(true);
    expect(tree.root.findAll((node: any) => node.props.accessibilityViewIsModal === true).length).toBeGreaterThan(0);
  });

  it('does not listen for the keyboard while docked', () => {
    const addListener = jest.spyOn(Keyboard, 'addListener');
    renderDrawer({ docked: true });
    expect(addListener).not.toHaveBeenCalled();
  });

  it('switches conversations from the docked list as the drawer does', () => {
    const { tree, handlers } = renderDrawer({ docked: true });
    const [row] = tree.root.findAll(
      (node: any) => typeof node.props.accessibilityLabel === 'string'
        && node.props.accessibilityLabel.startsWith('Anxious week,')
        && node.props.onPress,
    );

    act(() => {
      row.props.onPress();
    });

    expect(handlers.onWillSwitchConversation).toHaveBeenCalledTimes(1);
    expect(useCompanionChatStore.getState().activeConversationId).toBe('b');
  });
});
