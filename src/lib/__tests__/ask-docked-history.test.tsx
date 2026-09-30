/**
 * Docked conversation history on Ask (iPhone Duo): a paired window docks the
 * history beside the conversation, and the history toggle collapses it. The
 * conversation keeps its slot, so collapsing never remounts the composer.
 * The first pane can show the day's reading instead, and the history search
 * survives a fold.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockWindow = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };
const mockComposerMounts = jest.fn();
const mockState: { devotionals: unknown[]; currentDevotionalId: string | null; user: null } = {
  devotionals: [],
  currentDevotionalId: null,
  user: null,
};

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
  useUnfoldStore: (selector: (state: unknown) => unknown) => selector(mockState),
  FONT_SIZE_VALUES: { medium: { body: 17, scripture: 21, title: 32 } },
}));
jest.mock('@/lib/home-devotional-state', () => ({
  getCurrentDevotional: (devotionals: { id: string }[], id: string | null) => devotionals.find((d) => d.id === id),
}));
const PASSAGE = 'The Lord is my shepherd; I shall not want.';
let mockPassage: string | undefined = PASSAGE;
jest.mock('@/hooks/useReaderScripture', () => ({
  useReaderScripture: () => mockPassage,
}));
jest.mock('@/lib/useReadingFont', () => ({ useReadingFont: () => ({ body: 'SourceSerif' }) }));
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
jest.mock('@/components/icons', () => ({ CrownIcon: () => null, List: () => null, NotePencil: () => null, SidebarSimpleIcon: () => null }));
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
  const { useState } = require('react');
  const { TextInput, View } = require('react-native');
  return {
    // Starts from the screen's search and reports each edit, as the drawer does.
    CompanionDrawer: ({ docked, isOpen, initialSearchQuery = '', onSearchQueryChange, hideHeading }: {
      docked?: boolean;
      isOpen: boolean;
      initialSearchQuery?: string;
      onSearchQueryChange?: (query: string) => void;
      hideHeading?: boolean;
    }) => {
      const [query, setQuery] = useState(initialSearchQuery);
      return (
        <View
          testID={docked ? 'docked-history' : 'overlay-drawer'}
          accessibilityHint={hideHeading ? 'no heading' : undefined}
          accessibilityState={{ expanded: isOpen }}
        >
          <TextInput
            testID="history-search"
            value={query}
            onChangeText={(next: string) => {
              setQuery(next);
              onSearchQueryChange?.(next);
            }}
          />
        </View>
      );
    },
    useDrawerGesture: () => ({}),
  };
});

// eslint-disable-next-line import/first
import CompanionScreen from '@/app/(tabs)/(ask)/index';

const PAIRED = { width: 860, height: 700, insetTop: 24, insetBottom: 20, insetLeft: 0, insetRight: 0 };
const COMPACT = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };

const mounted: renderer.ReactTestRenderer[] = [];

const TODAY = {
  id: 'psalms',
  currentDay: 2,
  days: [
    { dayNumber: 1, title: 'Still waters', scriptureReference: 'Psalm 23:2', scriptureText: '', bodyText: 'Day one.' },
    {
      dayNumber: 2,
      title: 'The shepherd',
      scriptureReference: 'Psalm 23:1',
      scriptureText: 'The day text.',
      bodyText: 'He knows the way.\n\n---\n\n**Rest** in that today.',
    },
  ],
};

function render(window: typeof PAIRED) {
  Object.assign(mockWindow, window);
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<CompanionScreen />);
  });
  mounted.push(tree);
  return tree;
}

/** Fold or open the device: the same screen re-renders at a new window size. */
function resize(tree: renderer.ReactTestRenderer, window: typeof PAIRED) {
  Object.assign(mockWindow, window);
  act(() => {
    tree.update(<CompanionScreen />);
  });
}

function searchField(tree: renderer.ReactTestRenderer) {
  const [field] = host(tree, 'history-search');
  return field;
}

function paneTab(tree: renderer.ReactTestRenderer, label: string) {
  const [tab] = tree.root.findAll(
    (node) => node.props.accessibilityRole === 'tab'
      && typeof node.props.accessibilityLabel === 'string'
      && node.props.accessibilityLabel.startsWith(`${label} tab`)
      && typeof node.props.onPress === 'function',
  );
  return tab;
}

function texts(tree: renderer.ReactTestRenderer) {
  return tree.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => [node.props.children].flat().join(''));
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

/** The glyph inside the toggle: the sidebar on a paired window, else the list. */
function toggleGlyph(tree: renderer.ReactTestRenderer) {
  const [glyph] = historyToggle(tree).findAll((node) => typeof node.type === 'function' && node.props.size === 22);
  return glyph;
}

function press(tree: renderer.ReactTestRenderer) {
  act(() => {
    historyToggle(tree).props.onPress();
  });
}

describe('Ask docked conversation history', () => {
  beforeEach(() => {
    mockPassage = PASSAGE;
    mockComposerMounts.mockClear();
    mockState.devotionals = [];
    mockState.currentDevotionalId = null;
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

  it('shows a sidebar glyph on a paired window, filled while the history is in view', () => {
    const { SidebarSimpleIcon } = jest.requireMock('@/components/icons');
    const tree = render(PAIRED);
    expect(toggleGlyph(tree).type).toBe(SidebarSimpleIcon);
    expect(toggleGlyph(tree).props.weight).toBe('fill');

    press(tree);
    expect(toggleGlyph(tree).type).toBe(SidebarSimpleIcon);
    expect(toggleGlyph(tree).props.weight).toBe('light');
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
    expect(toggleGlyph(tree).type).toBe(jest.requireMock('@/components/icons').List);

    press(tree);
    expect(host(tree, 'overlay-drawer')[0].props.accessibilityState).toEqual({ expanded: true });
    expect(hostCount(tree, 'docked-history')).toBe(0);
  });

  it('keeps the history search through a fold and an open', () => {
    const tree = render(PAIRED);
    act(() => {
      searchField(tree).props.onChangeText('psalm');
    });

    resize(tree, COMPACT);
    expect(hostCount(tree, 'overlay-drawer')).toBe(1);
    expect(searchField(tree).props.value).toBe('psalm');

    resize(tree, PAIRED);
    expect(hostCount(tree, 'docked-history')).toBe(1);
    expect(searchField(tree).props.value).toBe('psalm');
  });

  it('shows the day\'s reading in the first pane from the switch', () => {
    mockState.devotionals = [TODAY];
    mockState.currentDevotionalId = 'psalms';
    const tree = render(PAIRED);

    expect(paneTab(tree, 'Chats').props.accessibilityState).toEqual({ selected: true });
    expect(paneTab(tree, "Today's reading").props.accessibilityState).toEqual({ selected: false });
    expect(hostCount(tree, 'docked-history')).toBe(1);
    // The switch names the list, so the docked list drops its own heading.
    expect(host(tree, 'docked-history')[0].props.accessibilityHint).toBe('no heading');
    expect(hostCount(tree, 'companion-reading-page')).toBe(0);

    act(() => {
      paneTab(tree, "Today's reading").props.onPress();
    });

    expect(paneTab(tree, "Today's reading").props.accessibilityState).toEqual({ selected: true });
    expect(hostCount(tree, 'docked-history')).toBe(0);
    expect(hostCount(tree, 'companion-reading-page')).toBe(1);
    expect(texts(tree)).toEqual(expect.arrayContaining([
      'Day 2 · The shepherd',
      'Psalm 23:1',
      'He knows the way.',
      'Rest in that today.',
    ]));
    expect(texts(tree)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^\u201CThe Lord is my shepherd; I shall not\s+want\.\u201D$/),
    ]));
    expect(texts(tree)).not.toContain('---');
    expect(hostCount(tree, 'ask-composer')).toBe(1);
    expect(mockComposerMounts).toHaveBeenCalledTimes(1);
  });

  it('keeps the reading choice while the history toggle hides the pane', () => {
    mockState.devotionals = [TODAY];
    mockState.currentDevotionalId = 'psalms';
    const tree = render(PAIRED);
    act(() => {
      paneTab(tree, "Today's reading").props.onPress();
    });

    press(tree);
    expect(hostCount(tree, 'companion-reading-page')).toBe(0);
    expect(hostCount(tree, 'companion-pane-switch')).toBe(0);

    press(tree);
    expect(hostCount(tree, 'companion-reading-page')).toBe(1);
    expect(mockComposerMounts).toHaveBeenCalledTimes(1);
  });

  it('keeps the day read today after the series moves on to tomorrow', () => {
    // Finishing Day 2 moves currentDay to Day 3, which is already written.
    mockState.devotionals = [{
      ...TODAY,
      currentDay: 3,
      days: [
        ...TODAY.days.slice(0, 1),
        { ...TODAY.days[1], isRead: true, readAt: new Date().toISOString() },
        { dayNumber: 3, title: 'Tomorrow', scriptureReference: 'Psalm 23:3', scriptureText: '', bodyText: 'Not yet.' },
      ],
    }];
    mockState.currentDevotionalId = 'psalms';
    const tree = render(PAIRED);
    act(() => {
      paneTab(tree, "Today's reading").props.onPress();
    });

    expect(texts(tree)).toContain('Day 2 · The shepherd');
    expect(texts(tree)).not.toContain('Day 3 · Tomorrow');
  });

  it('says when the passage is not available, as the reader does', () => {
    mockPassage = undefined;
    mockState.devotionals = [TODAY];
    mockState.currentDevotionalId = 'psalms';
    const tree = render(PAIRED);
    act(() => {
      paneTab(tree, "Today's reading").props.onPress();
    });

    expect(texts(tree)).toContain('Scripture text not available for Psalm 23:1.');
  });

  it('keeps the reading choice through a fold', () => {
    mockState.devotionals = [TODAY];
    mockState.currentDevotionalId = 'psalms';
    const tree = render(PAIRED);
    act(() => {
      paneTab(tree, "Today's reading").props.onPress();
    });

    resize(tree, COMPACT);
    expect(hostCount(tree, 'companion-reading-page')).toBe(0);
    resize(tree, PAIRED);
    expect(hostCount(tree, 'companion-reading-page')).toBe(1);
    expect(paneTab(tree, "Today's reading").props.accessibilityState).toEqual({ selected: true });
    expect(mockComposerMounts).toHaveBeenCalledTimes(1);
  });

  it('leaves out the switch without a current day', () => {
    const tree = render(PAIRED);

    expect(hostCount(tree, 'companion-pane-switch')).toBe(0);
    expect(paneTab(tree, 'Chats')).toBeUndefined();
    expect(hostCount(tree, 'docked-history')).toBe(1);
  });

  it('leaves out the switch on a compact window', () => {
    mockState.devotionals = [TODAY];
    mockState.currentDevotionalId = 'psalms';
    const tree = render(COMPACT);

    expect(hostCount(tree, 'companion-pane-switch')).toBe(0);
    expect(hostCount(tree, 'companion-reading-page')).toBe(0);
    expect(hostCount(tree, 'overlay-drawer')).toBe(1);
  });
});
