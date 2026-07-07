import React from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, TextInput } from 'react-native';
import { FontFamily } from '@/constants/fonts';

// react-test-renderer types are not installed in this app; keep this test aligned
// with the existing test pattern under src/components/__tests__.
const renderer = require('react-test-renderer');
const { act } = renderer;

import { InlineReflectionJournal } from '../InlineReflectionJournal';

const mockEntries: Array<{
  id: string;
  devotionalId: string;
  dayNumber: number;
  content: string;
  questionResponses?: Array<{ question: string; response: string }>;
}> = [];

const mockAddJournalEntry = jest.fn(({ devotionalId, dayNumber, content }) => {
  mockEntries.push({
    id: `entry-${devotionalId}-${dayNumber}`,
    devotionalId,
    dayNumber,
    content,
    questionResponses: [],
  });
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

const mockGetJournalEntry = jest.fn((devotionalId: string, dayNumber: number) =>
  mockEntries.find((entry) => entry.devotionalId === devotionalId && entry.dayNumber === dayNumber)
);

jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: {
    medium: { body: 18, bodyLineHeight: 28 },
  },
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({
      getJournalEntry: mockGetJournalEntry,
      addJournalEntry: mockAddJournalEntry,
      updateQuestionResponse: mockUpdateQuestionResponse,
    }),
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string) => color,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#D4AF37',
      background: '#000000',
      text: '#FFFFFF',
      textMuted: '#999999',
      textSubtle: '#777777',
      inputBackground: '#111111',
      border: '#333333',
    },
  }),
}));

jest.mock('@/lib/useReadingFont', () => ({
  useReadingFont: () => 'System',
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(),
}));

jest.mock('phosphor-react-native', () => ({
  ArrowRightIcon: 'ArrowRightIcon',
  NotePencilIcon: 'NotePencilIcon',
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
    },
    FadeIn: { duration: () => ({ easing: () => ({ delay: () => ({}) }) }) },
    FadeInDown: { duration: () => ({ delay: () => ({ easing: () => ({}) }) }) },
    Easing: {
      cubic: 'cubic',
      out: () => 'out',
      in: () => 'in',
      inOut: () => 'inOut',
    },
    useReducedMotion: () => true,
  };
});

describe('InlineReflectionJournal', () => {
  let appStateListener: ((state: AppStateStatus) => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'change') {
        appStateListener = listener;
      }
      return { remove: jest.fn() };
    });
    mockEntries.splice(0, mockEntries.length);
    mockEntries.push({
      id: 'entry-devotional-1',
      devotionalId: 'devotional',
      dayNumber: 1,
      content: '',
      questionResponses: [{ question: 'What stood out?', response: 'Day 1 answer' }],
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('clears inline responses when rerendered from an answered day to an unanswered day', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    expect(tree!.root.findByType(TextInput).props.value).toBe('Day 1 answer');

    act(() => {
      tree!.update(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    expect(tree!.root.findByType(TextInput).props.value).toBe('');
  });

  it('renders reflection questions in Inter instead of the selected reading font', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    const questionText = tree!.root
      .findAllByType(Text)
      .find((node: any) => String(node.props.children).replace(/\u00A0/g, ' ') === 'What stood out?');

    expect(questionText).toBeTruthy();
    expect(StyleSheet.flatten(questionText.props.style).fontFamily).toBe(FontFamily.body);
  });

  it('saves a response to the currently rendered day after a day change', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.update(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('Day 2 answer');
      jest.advanceTimersByTime(800);
    });

    expect(mockUpdateQuestionResponse).toHaveBeenLastCalledWith(
      'entry-devotional-2',
      'What stood out?',
      'Day 2 answer'
    );
    expect(mockEntries.find((entry) => entry.dayNumber === 1)?.questionResponses).toEqual([
      { question: 'What stood out?', response: 'Day 1 answer' },
    ]);
    expect(mockEntries.find((entry) => entry.dayNumber === 2)?.questionResponses).toEqual([
      { question: 'What stood out?', response: 'Day 2 answer' },
    ]);
  });

  it('keeps unsaved text after the first save creates the journal entry', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('hello');
    });

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(mockUpdateQuestionResponse).toHaveBeenLastCalledWith(
      'entry-devotional-2',
      'What stood out?',
      'hello'
    );

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('hello world');
    });

    expect(tree!.root.findByType(TextInput).props.value).toBe('hello world');

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(mockUpdateQuestionResponse).toHaveBeenLastCalledWith(
      'entry-devotional-2',
      'What stood out?',
      'hello world'
    );

    act(() => tree!.unmount());
  });

  it('flushes a pending response to the outgoing day before loading the next day', () => {
    let tree: any;
    const questions = ['What stood out?'];

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={questions}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('Day 1 pending edit');
    });

    expect(mockUpdateQuestionResponse).not.toHaveBeenCalled();

    act(() => {
      tree!.update(
        <InlineReflectionJournal
          questions={questions}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    expect(mockUpdateQuestionResponse).toHaveBeenCalledWith(
      'entry-devotional-1',
      'What stood out?',
      'Day 1 pending edit'
    );
    expect(mockEntries.find((entry) => entry.dayNumber === 1)?.questionResponses).toEqual([
      { question: 'What stood out?', response: 'Day 1 pending edit' },
    ]);

    act(() => tree!.unmount());
  });

  it('saves during a continuous typing burst instead of waiting for an idle gap', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    const input = tree!.root.findByType(TextInput);

    act(() => {
      input.props.onChangeText('burst 0');
    });

    for (let i = 1; i <= 6; i++) {
      act(() => {
        jest.advanceTimersByTime(300);
      });
      act(() => {
        input.props.onChangeText(`burst ${i}`);
      });
    }

    expect(mockUpdateQuestionResponse).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(mockUpdateQuestionResponse).toHaveBeenCalledWith(
      'entry-devotional-1',
      'What stood out?',
      'burst 6'
    );

    act(() => tree!.unmount());
  });

  it('flushes a pending response synchronously when the app becomes inactive', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('Pending background answer');
    });

    expect(mockUpdateQuestionResponse).not.toHaveBeenCalled();
    expect(appStateListener).toBeTruthy();

    act(() => {
      appStateListener?.('inactive');
    });

    expect(mockUpdateQuestionResponse).toHaveBeenCalledTimes(1);
    expect(mockUpdateQuestionResponse).toHaveBeenCalledWith(
      'entry-devotional-1',
      'What stood out?',
      'Pending background answer'
    );

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(mockUpdateQuestionResponse).toHaveBeenCalledTimes(1);

    act(() => tree!.unmount());
  });

  it('measures the focused input after expanding a collapsed question', () => {
    let tree: any;
    const onFocusInput = jest.fn();
    const scrollView = {};
    const textInputNode = {
      focus: jest.fn(),
      measureLayout: jest.fn((_relativeTo: unknown, onSuccess: (x: number, y: number) => void) => {
        onSuccess(12, 640);
      }),
    };

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?', 'How will you respond?']}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
          scrollViewRef={{ current: scrollView as any }}
          onFocusInput={onFocusInput}
        />,
        {
          createNodeMock: () => textInputNode,
        }
      );
    });

    act(() => {
      tree!.root
        .findByProps({ accessibilityLabel: 'Reflection question 2: How will you respond?' })
        .props.onPress();
    });

    // The jest TextInput mock is a class component, so the component's ref map
    // holds the class instance — spy on it directly before the focus timer fires.
    const { TextInput: RNTextInput } = require('react-native');
    const inputInstance = tree!.root.findByType(RNTextInput).instance;
    inputInstance.focus = textInputNode.focus;
    inputInstance.measureLayout = textInputNode.measureLayout;

    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(onFocusInput).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(textInputNode.focus).toHaveBeenCalled();
    expect(textInputNode.measureLayout).toHaveBeenCalledWith(
      scrollView,
      expect.any(Function),
      expect.any(Function)
    );
    expect(onFocusInput).toHaveBeenCalledWith(640);

    act(() => tree!.unmount());
  });
});
