/**
 * A pane change unmounts the one InlineReflectionJournal and mounts a new one
 * in the other pane. These tests check what the new journal shows: the open
 * question and any answer whose latest save failed.
 */
import React from 'react';
import { AppState, Keyboard, TextInput } from 'react-native';

const renderer = require('react-test-renderer');
const { act } = renderer;

import { InlineReflectionJournal } from '../InlineReflectionJournal';

const QUESTIONS = ['What stood out?', 'Where will you carry it?'];
const RETRY_LABEL = 'Save failed. Tap to retry.';

const mockEntries: Array<{
  id: string;
  devotionalId: string;
  dayNumber: number;
  content: string;
  questionResponses?: Array<{ question: string; response: string }>;
}> = [];

const mockAddJournalEntry = jest.fn(({ devotionalId, dayNumber, content }) => {
  const id = `entry-${devotionalId}-${dayNumber}`;
  if (!mockEntries.some((entry) => entry.id === id)) {
    mockEntries.push({ id, devotionalId, dayNumber, content, questionResponses: [] });
  }
  return id;
});

const mockUpdateQuestionResponse = jest.fn((entryId: string, question: string, response: string) => {
  const entry = mockEntries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  const responses = entry.questionResponses ?? [];
  const existing = responses.find((candidate) => candidate.question === question);
  if (existing) {
    existing.response = response;
  } else {
    responses.push({ question, response });
  }
  entry.questionResponses = responses;
});

const mockFlushUnfoldStorePersistAsync = jest.fn(() => Promise.resolve(true));

jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: { medium: { body: 18, bodyLineHeight: 28 } },
  flushUnfoldStorePersist: () => true,
  flushUnfoldStorePersistAsync: () => mockFlushUnfoldStorePersistAsync(),
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({
      getJournalEntry: (devotionalId: string, dayNumber: number) =>
        mockEntries.find((entry) => entry.devotionalId === devotionalId && entry.dayNumber === dayNumber),
      addJournalEntry: mockAddJournalEntry,
      updateQuestionResponse: mockUpdateQuestionResponse,
    }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? '#888888' : undefined) }),
  }),
}));
jest.mock('@/lib/useReadingFont', () => ({ useReadingFont: () => 'System' }));
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({ usePremiumAccessPolicy: () => 'granted' }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light' }, impactAsync: jest.fn() }));
jest.mock('@/components/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/motion/DrawnCheck', () => ({ DrawnCheck: () => null }));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.delay = () => chain;
  chain.easing = () => chain;
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    FadeIn: chain,
    FadeInDown: chain,
    Easing: { cubic: 'cubic', out: () => 'out', in: () => 'in', inOut: () => 'inOut' },
    useReducedMotion: () => true,
  };
});

type Tree = {
  root: {
    findAllByType: (type: unknown) => Array<{ props: Record<string, unknown> }>;
    findAllByProps: (props: Record<string, unknown>) => Array<{ props: Record<string, unknown> }>;
  };
  unmount: () => void;
};

function mount(dayNumber: number, props: Partial<React.ComponentProps<typeof InlineReflectionJournal>> = {}): Tree {
  let tree: Tree;
  act(() => {
    tree = renderer.create(
      <InlineReflectionJournal
        questions={QUESTIONS}
        devotionalId="devotional"
        dayNumber={dayNumber}
        onOpenFullJournal={jest.fn()}
        {...props}
      />
    );
  });
  return tree!;
}

function openInputs(tree: Tree) {
  return tree.root.findAllByType(TextInput);
}

function retryControls(tree: Tree) {
  return tree.root.findAllByProps({ accessibilityLabel: RETRY_LABEL })
    .filter((node) => typeof node.props.onPress === 'function');
}

async function typeAndSettle(tree: Tree, text: string) {
  act(() => {
    (openInputs(tree)[0].props.onChangeText as (value: string) => void)(text);
  });
  await act(async () => {
    jest.advanceTimersByTime(800);
    await Promise.resolve();
  });
}

describe('InlineReflectionJournal across a remount', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFlushUnfoldStorePersistAsync.mockImplementation(() => Promise.resolve(true));
    mockEntries.splice(0, mockEntries.length);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as never);
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('opens the first question by default', () => {
    const tree = mount(1);
    expect(openInputs(tree).map((input) => input.props.accessibilityLabel)).toEqual([`Your response to: ${QUESTIONS[0]}`]);
    act(() => tree.unmount());
  });

  it('opens the question it is given and reports each change', () => {
    const onChange = jest.fn();
    const tree = mount(1, { initialExpandedIndex: 1, onExpandedIndexChange: onChange });
    expect(openInputs(tree).map((input) => input.props.accessibilityLabel)).toEqual([`Your response to: ${QUESTIONS[1]}`]);
    expect(onChange).toHaveBeenLastCalledWith(1);

    const [card] = tree.root.findAllByProps({ accessibilityLabel: `Reflection question 2: ${QUESTIONS[1]}` })
      .filter((node) => typeof node.props.onPress === 'function');
    act(() => {
      (card.props.onPress as () => void)();
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
    act(() => tree.unmount());
  });

  it('opens no question when it is given none', () => {
    const tree = mount(1, { initialExpandedIndex: null });
    expect(openInputs(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });
});
