import React from 'react';
import { AppState, type AppStateStatus, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { ReflectionQuestionNav, type ReflectionKeyboardToolbarState } from '../ReflectionQuestionNav';
import type { ReactTestRenderer } from 'react-test-renderer';
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

// Mirrors the store: one entry per (devotionalId, dayNumber), id returned.
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

const mockFlushUnfoldStorePersist = jest.fn(() => true);
const mockFlushUnfoldStorePersistAsync = jest.fn(() => new Promise<boolean>(() => {}));

const mockGetJournalEntry = jest.fn((devotionalId: string, dayNumber: number) =>
  mockEntries.find((entry) => entry.devotionalId === devotionalId && entry.dayNumber === dayNumber)
);

jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: {
    medium: { body: 18, bodyLineHeight: 28 },
  },
  flushUnfoldStorePersist: () => mockFlushUnfoldStorePersist(),
  flushUnfoldStorePersistAsync: () => mockFlushUnfoldStorePersistAsync(),
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
  CaretDownIcon: 'CaretDownIcon',
  CaretUpIcon: 'CaretUpIcon',
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (component: unknown) => component,
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
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedProps: (factory: () => unknown) => factory(),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (value: unknown) => value,
    cancelAnimation: jest.fn(),
  };
});

jest.mock('react-native-svg', () => {
  const ReactLib = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Stub = (props: { children?: React.ReactNode }) => ReactLib.createElement(View, props, props.children);
  return { __esModule: true, default: Stub, Path: Stub };
});

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: true,
    entering: (anim: unknown) => anim,
    exiting: (anim: unknown) => anim,
  }),
}));

describe('InlineReflectionJournal', () => {
  let appStateListener: ((state: AppStateStatus) => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFlushUnfoldStorePersistAsync.mockImplementation(() => new Promise<boolean>(() => {}));
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
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  });

  it('marks reflection optional without claiming an untouched response was saved', () => {
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

    const labels = tree!.root.findAllByType(Text).map((node: any) => node.props.children).join(' ');
    expect(labels).toContain('Reflection');
    expect(labels).toContain('Optional');
    expect(labels).not.toContain('Optional reflection');
    expect(labels).not.toContain('reflected on');
    expect(labels).not.toContain('Saving...');
    expect(labels).not.toContain('Saved to Journal');
    expect(mockAddJournalEntry).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ testID: 'reflection-save-slot-0' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'reflection-journal-link-target' }).props.style.minHeight).toBe(44);
    expect(tree!.root.findByProps({ testID: 'reflection-journal-link' }).findByType(Text).props.children)
      .toBe('Continue in Journal →');

    act(() => tree!.unmount());
  });

  it('shows pending status until the response reaches durable persistence', async () => {
    let resolvePersist: ((value: boolean) => void) | undefined;
    mockFlushUnfoldStorePersistAsync.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { resolvePersist = resolve; })
    );
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
      tree!.root.findByType(TextInput).props.onChangeText('Grace stayed with me.');
    });
    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saving...');

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(mockUpdateQuestionResponse).toHaveBeenCalledWith(
      'entry-devotional-2',
      'What stood out?',
      'Grace stayed with me.'
    );
    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saving...');

    await act(async () => {
      resolvePersist?.(true);
      await Promise.resolve();
    });
    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saved to Journal');

    act(() => tree!.unmount());
  });

  it('shows a persistence failure and retries the same response on explicit tap', async () => {
    mockFlushUnfoldStorePersistAsync.mockRejectedValueOnce(new Error('disk unavailable'));
    mockFlushUnfoldStorePersistAsync.mockResolvedValueOnce(true);
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
      tree!.root.findByType(TextInput).props.onChangeText('Keep this exact response.');
    });
    await act(async () => {
      jest.advanceTimersByTime(800);
      await Promise.resolve();
    });

    const retry = tree!.root.findByProps({ accessibilityLabel: 'Save failed. Tap to retry.' });
    expect(retry).toBeTruthy();
    expect(mockEntries.find((entry) => entry.dayNumber === 2)?.questionResponses).toEqual([
      { question: 'What stood out?', response: 'Keep this exact response.' },
    ]);

    await act(async () => {
      retry.props.onPress();
      await Promise.resolve();
    });

    expect(mockUpdateQuestionResponse).toHaveBeenLastCalledWith(
      'entry-devotional-2',
      'What stood out?',
      'Keep this exact response.'
    );
    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saved to Journal');

    act(() => tree!.unmount());
  });

  it('flushes the first response before another question can replace it', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?', 'What will you carry forward?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('The first response.');
      tree!.root
        .findByProps({ accessibilityLabel: 'Reflection question 2: What will you carry forward?' })
        .props.onPress();
    });

    expect(mockUpdateQuestionResponse).toHaveBeenCalledWith(
      'entry-devotional-2',
      'What stood out?',
      'The first response.'
    );

    act(() => tree!.unmount());
  });

  it('keeps an older question save failure available after another question changes', async () => {
    let rejectFirstSave: ((reason: Error) => void) | undefined;
    mockFlushUnfoldStorePersistAsync.mockImplementationOnce(
      () => new Promise<boolean>((_resolve, reject) => { rejectFirstSave = reject; })
    );
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?', 'What will you carry forward?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('First answer');
      tree!.root
        .findByProps({ accessibilityLabel: 'Reflection question 2: What will you carry forward?' })
        .props.onPress();
    });
    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('Second answer');
    });

    await act(async () => {
      rejectFirstSave?.(new Error('first write failed'));
      await Promise.resolve();
    });

    act(() => {
      tree!.root
        .findByProps({ accessibilityLabel: 'Reflection question 1: What stood out?' })
        .props.onPress();
    });

    expect(tree!.root.findByProps({ accessibilityLabel: 'Save failed. Tap to retry.' })).toBeTruthy();

    act(() => tree!.unmount());
  });

  it('does not reuse a stale save revision after returning to an earlier day', async () => {
    let resolveFirstSave: ((value: boolean) => void) | undefined;
    mockFlushUnfoldStorePersistAsync.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { resolveFirstSave = resolve; })
    );
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
      tree!.root.findByType(TextInput).props.onChangeText('Old day one edit');
      jest.advanceTimersByTime(800);
    });
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
    act(() => {
      tree!.update(
        <InlineReflectionJournal
          questions={questions}
          devotionalId="devotional"
          dayNumber={1}
          onOpenFullJournal={jest.fn()}
        />
      );
    });
    act(() => {
      tree!.root.findByType(TextInput).props.onChangeText('New day one edit');
    });

    await act(async () => {
      resolveFirstSave?.(true);
      await Promise.resolve();
    });

    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saving...');
    expect(tree!.root.findAllByProps({ testID: 'reflection-save-check-0-draw' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ testID: 'reflection-save-check-0-static' })).toHaveLength(0);

    act(() => tree!.unmount());
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
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

  it('uses a left-aligned serif heading, quiet optional label, and journal text link', () => {
    const onOpenFullJournal = jest.fn();
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={onOpenFullJournal}
        />
      );
    });

    const heading = tree!.root.findByProps({ testID: 'reflection-heading' });
    const optional = tree!.root.findByProps({ testID: 'reflection-optional-label' });
    expect(heading.props.children).toBe('Reflection');
    expect(optional.props.children).toBe('Optional');
    expect(StyleSheet.flatten(heading.props.style).fontFamily).toBe(FontFamily.display);
    expect(StyleSheet.flatten(heading.props.style).textAlign).toBe('left');
    expect(StyleSheet.flatten(optional.props.style).fontFamily).toBe(FontFamily.ui);

    act(() => {
      tree!.root.findByProps({ testID: 'reflection-journal-link' }).props.onPress();
    });
    expect(onOpenFullJournal).toHaveBeenCalledTimes(1);

    act(() => tree!.unmount());
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
    // …and the store's coalesced persist is flushed AFTER that write: the
    // store's own AppState listener registered at module load, so it already
    // ran and would have left this response in the debounce window.
    expect(mockFlushUnfoldStorePersist).toHaveBeenCalledTimes(1);
    expect(mockUpdateQuestionResponse.mock.invocationCallOrder[0]).toBeLessThan(
      mockFlushUnfoldStorePersist.mock.invocationCallOrder[0],
    );

    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(mockUpdateQuestionResponse).toHaveBeenCalledTimes(1);

    act(() => tree!.unmount());
  });

  it('remeasures a focused later question after layout commits without remounting its draft', () => {
    let tree: any;
    const onFocusInput = jest.fn();
    const scrollContent = {};
    const scrollContentRef = { current: scrollContent as any };
    const onOpenFullJournal = jest.fn();
    const measurementCallbacks: ((x: number, y: number) => void)[] = [];
    const textInputNode = {
      focus: jest.fn(),
      measureLayout: jest.fn((_relativeTo: unknown, onSuccess: (x: number, y: number) => void) => {
        measurementCallbacks.push(onSuccess);
      }),
    };

    const renderJournal = (layoutCommitSignal: number) => (
      <InlineReflectionJournal
        questions={['What stood out?', 'How will you respond?']}
        devotionalId="devotional"
        dayNumber={1}
        onOpenFullJournal={onOpenFullJournal}
        scrollContentRef={scrollContentRef}
        onFocusInput={onFocusInput}
        layoutCommitSignal={layoutCommitSignal}
      />
    );

    act(() => {
      tree = renderer.create(
        renderJournal(0),
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
    // holds the class instance. Native layout must acknowledge the new input.
    const { TextInput: RNTextInput } = require('react-native');
    const inputInstance = tree!.root.findByType(RNTextInput).instance;
    inputInstance.focus = textInputNode.focus;
    inputInstance.measureLayout = textInputNode.measureLayout;

    expect(textInputNode.focus).not.toHaveBeenCalled();
    act(() => tree!.root.findByType(RNTextInput).props.onLayout());

    expect(textInputNode.focus).toHaveBeenCalled();
    expect(onFocusInput).not.toHaveBeenCalled();

    let input = tree!.root.findByType(RNTextInput);
    const mountedInput = input.instance;
    input.instance.measureLayout = textInputNode.measureLayout;

    act(() => {
      input.props.onFocus();
      input.props.onChangeText('A draft that stays mounted');
    });

    expect(textInputNode.measureLayout).toHaveBeenCalledWith(
      scrollContent,
      expect.any(Function),
      expect.any(Function)
    );
    act(() => {
      tree!.update(renderJournal(1));
    });
    expect(measurementCallbacks).toHaveLength(2);

    act(() => measurementCallbacks[0](12, 640));
    expect(onFocusInput).not.toHaveBeenCalled();

    act(() => measurementCallbacks[1](12, 820));

    input = tree!.root.findByType(RNTextInput);
    expect(input.instance).toBe(mountedInput);
    expect(input.props.value).toBe('A draft that stays mounted');
    expect(onFocusInput).toHaveBeenLastCalledWith(820);

    act(() => {
      tree!.update(renderJournal(2));
    });
    expect(measurementCallbacks).toHaveLength(3);
    act(() => input.props.onBlur());
    act(() => measurementCallbacks[2](12, 900));
    expect(onFocusInput).toHaveBeenLastCalledWith(820);

    act(() => tree!.unmount());
  });

  it('shows a static check for a previously saved response without drawing on mount', () => {
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

    expect(tree!.root.findByProps({ testID: 'reflection-save-check-0-static' })).toBeTruthy();
    expect(tree!.root.findAllByProps({ testID: 'reflection-save-check-0-draw' })).toHaveLength(0);
    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saved to Journal');

    act(() => tree!.unmount());
  });

  it('does not draw a check for an autosave while the input stays focused', async () => {
    mockFlushUnfoldStorePersistAsync.mockResolvedValue(true);
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

    const input = tree!.root.findByType(TextInput);
    act(() => {
      input.props.onFocus();
      input.props.onChangeText('Still writing this.');
    });
    await act(async () => {
      jest.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saved to Journal');
    expect(tree!.root.findAllByProps({ testID: 'reflection-save-check-0-draw' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ testID: 'reflection-save-check-0-static' })).toHaveLength(0);

    act(() => tree!.unmount());
  });

  it('draws a check only after a changed response is finished and persisted', async () => {
    mockFlushUnfoldStorePersistAsync.mockResolvedValue(true);
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

    const input = tree!.root.findByType(TextInput);
    act(() => {
      input.props.onFocus();
      input.props.onChangeText('Finished thought.');
    });
    act(() => {
      input.props.onBlur();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saved to Journal');
    expect(tree!.root.findByProps({ testID: 'reflection-save-check-0-draw' })).toBeTruthy();

    act(() => tree!.unmount());
  });

  it('keeps the failed retry path and does not show a check after a save error', async () => {
    mockFlushUnfoldStorePersistAsync.mockRejectedValueOnce(new Error('disk unavailable'));
    mockFlushUnfoldStorePersistAsync.mockResolvedValueOnce(true);
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

    const input = tree!.root.findByType(TextInput);
    act(() => {
      input.props.onFocus();
      input.props.onChangeText('Keep this exact response.');
      input.props.onBlur();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(tree!.root.findAllByProps({ testID: 'reflection-save-check-0-draw' })).toHaveLength(0);
    const retry = tree!.root.findByProps({ accessibilityLabel: 'Save failed. Tap to retry.' });
    expect(input.props.value).toBe('Keep this exact response.');

    await act(async () => {
      retry.props.onPress();
      await Promise.resolve();
    });

    expect(tree!.root.findByProps({ testID: 'reflection-save-status-0' }).props.children).toBe('Saved to Journal');
    expect(tree!.root.findByProps({ testID: 'reflection-save-check-0-draw' })).toBeTruthy();
    expect(input.props.value).toBe('Keep this exact response.');

    act(() => tree!.unmount());
  });

  function mountNavigation(questions = ['First?', 'Second?', 'Third?']) {
    const change = jest.fn<void, [ReflectionKeyboardToolbarState | null]>();
    let tree: any;
    const render = (dayNumber = 1) => (
      <InlineReflectionJournal questions={questions} devotionalId="nav" dayNumber={dayNumber}
        onOpenFullJournal={jest.fn()} onKeyboardToolbarChange={change} />
    );
    act(() => { tree = renderer.create(render()); });
    const input = tree.root.findByType(TextInput);
    input.instance.focus = jest.fn();
    act(() => { input.props.onLayout(); input.props.onFocus(); });
    const toolbar = () => change.mock.calls[change.mock.calls.length - 1][0]!;
    const acknowledge = (question: string) => {
      const incoming = tree.root.findByProps({ accessibilityLabel: `Your response to: ${question}` });
      incoming.instance.focus = jest.fn();
      act(() => incoming.props.onLayout());
      expect(incoming.instance.focus).toHaveBeenCalled();
      act(() => incoming.props.onFocus());
      return tree.root.findByType(TextInput);
    };
    return { tree, toolbar, acknowledge, change, render };
  }

  it('holds the outgoing field until the laid-out incoming field acknowledges focus', () => {
    const { tree, toolbar, acknowledge } = mountNavigation();
    const outgoing = tree.root.findByType(TextInput).instance;
    const outgoingBlur = tree.root.findByType(TextInput).props.onBlur;
    act(() => toolbar().onNext());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(2);
    const incoming = tree.root.findByProps({ accessibilityLabel: 'Your response to: Second?' });
    incoming.instance.focus = jest.fn();
    expect(incoming.instance.focus).not.toHaveBeenCalled();
    act(() => incoming.props.onLayout());
    expect(incoming.instance.focus).toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(2);
    expect(tree.root.findAllByType(TextInput).some((input: any) => input.instance === outgoing)).toBe(true);
    act(() => incoming.props.onFocus());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(tree.root.findByType(TextInput).instance).toBe(incoming.instance);
    act(() => outgoingBlur());
    expect(toolbar()).not.toBeNull();
    act(() => toolbar().onPrevious());
    acknowledge('First?');
    act(() => tree.unmount());
  });

  it('preserves answers and newline behavior through sequential and blank navigation', () => {
    const { tree, toolbar, acknowledge } = mountNavigation();
    const first = tree.root.findByType(TextInput);
    expect(first.props.multiline).toBe(true);
    expect(first.props.submitBehavior).toBe('newline');
    expect(first.props.blurOnSubmit).toBe(false);
    expect(first.props.inputAccessoryViewID).toBeUndefined();
    act(() => first.props.onChangeText('First line.\nSecond line.'));
    act(() => toolbar().onNext());
    expect(acknowledge('Second?').props.value).toBe('');
    act(() => toolbar().onNext());
    expect(acknowledge('Third?').props.value).toBe('');
    expect(toolbar().questionIndex).toBe(2);
    act(() => toolbar().onPrevious()); acknowledge('Second?');
    act(() => toolbar().onPrevious());
    expect(acknowledge('First?').props.value).toBe('First line.\nSecond line.');
    act(() => tree.unmount());
  });

  it('cancels late focus on Done and flushes without navigating or completing', () => {
    const { tree, toolbar, change } = mountNavigation();
    act(() => tree.root.findByType(TextInput).props.onChangeText('Keep this answer.'));
    act(() => toolbar().onNext());
    const incoming = tree.root.findByProps({ accessibilityLabel: 'Your response to: Second?' });
    incoming.instance.focus = jest.fn();
    const done = toolbar().onDone;
    act(() => done());
    act(() => incoming.props.onLayout());
    expect(incoming.instance.focus).not.toHaveBeenCalled();
    expect(change.mock.calls[change.mock.calls.length - 1][0]).toBeNull();
    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(mockUpdateQuestionResponse).toHaveBeenCalledWith('entry-nav-1', 'First?', 'Keep this answer.');
    act(() => tree.unmount());
  });

  it('clears the toolbar on keyboard closure, day changes, and unmount', () => {
    const listener = jest.spyOn(Keyboard, 'addListener');
    const { tree, toolbar, change, render } = mountNavigation();
    act(() => toolbar().onNext());
    const hide = listener.mock.calls.find(([event]) => event === 'keyboardDidHide')![1];
    act(() => hide({} as never));
    expect(change.mock.calls[change.mock.calls.length - 1][0]).toBeNull();
    act(() => tree.update(render(2)));
    expect(change.mock.calls[change.mock.calls.length - 1][0]).toBeNull();
    act(() => tree.unmount());
    expect(change.mock.calls[change.mock.calls.length - 1][0]).toBeNull();
    listener.mockRestore();
  });

  it('keeps failed drafts and retry status after Next and Previous', async () => {
    mockFlushUnfoldStorePersistAsync.mockRejectedValueOnce(new Error('disk unavailable'));
    const { tree, toolbar, acknowledge } = mountNavigation();
    act(() => tree.root.findByType(TextInput).props.onChangeText('Failed draft.'));
    await act(async () => { jest.advanceTimersByTime(800); await Promise.resolve(); });
    act(() => toolbar().onNext()); acknowledge('Second?');
    act(() => toolbar().onPrevious());
    expect(acknowledge('First?').props.value).toBe('Failed draft.');
    expect(tree.root.findByProps({ accessibilityLabel: 'Save failed. Tap to retry.' })).toBeTruthy();
    act(() => tree.unmount());
  });

  it('gives boundary controls disabled states and 44-point touch targets', () => {
    let tree: any;
    const props = { questionCount: 2, onPrevious: jest.fn(), onNext: jest.fn(), onDone: jest.fn() };
    act(() => { tree = renderer.create(<ReflectionQuestionNav {...props} questionIndex={0} />); });
    expect(tree.root.findAllByProps({ testID: 'reflection-nav-previous' }).find((node: any) => node.props.accessibilityRole === 'button').props.accessibilityState.disabled).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'reflection-nav-next' }).find((node: any) => node.props.accessibilityRole === 'button').props.accessibilityState.disabled).toBe(false);
    for (const id of ['previous', 'next', 'done']) {
      const control = tree.root.findAllByProps({ testID: `reflection-nav-${id}` }).find((node: any) => node.props.accessibilityRole === 'button');
      expect(control.props.style.minHeight).toBeGreaterThanOrEqual(44);
      expect(control.props.style.minWidth).toBeGreaterThanOrEqual(44);
    }
    act(() => tree.update(<ReflectionQuestionNav {...props} questionIndex={1} />));
    expect(tree.root.findAllByProps({ testID: 'reflection-nav-next' }).find((node: any) => node.props.accessibilityRole === 'button').props.accessibilityState.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('expands the next question and focuses its input after Next question is pressed', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?', 'How will you respond?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    const first = tree!.root.findByType(TextInput);
    first.instance.focus = jest.fn();
    act(() => {
      first.props.onLayout();
      first.props.onFocus();
    });

    const next = tree!.root.findByProps({ accessibilityLabel: 'Next question' });
    expect(next.props.accessibilityRole).toBe('button');
    act(() => {
      next.props.onPress();
      jest.advanceTimersByTime(400);
    });

    expect(
      tree!.root.findByProps({
        accessibilityLabel: 'Reflection question 2: How will you respond?',
      }).props.accessibilityState.expanded
    ).toBe(true);

    const incoming = tree!.root.findByProps({
      accessibilityLabel: 'Your response to: How will you respond?',
    });
    incoming.instance.focus = jest.fn();
    act(() => incoming.props.onLayout());
    expect(incoming.instance.focus).toHaveBeenCalled();

    act(() => tree!.unmount());
  });

  it('shows Done and not Next on the last question', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?', 'How will you respond?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root
        .findByProps({ accessibilityLabel: 'Reflection question 2: How will you respond?' })
        .props.onPress();
    });

    expect(tree!.root.findAllByProps({ accessibilityLabel: 'Next question' })).toHaveLength(0);
    const done = tree!.root.findByProps({ accessibilityLabel: 'Done' });
    expect(done.props.accessibilityRole).toBe('button');
    expect(tree!.root.findAllByType(TouchableOpacity).filter((node: any) => node.props.accessibilityLabel === 'Done')).toHaveLength(1);

    act(() => tree!.unmount());
  });

  it('collapses the last question when Done is pressed', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(
        <InlineReflectionJournal
          questions={['What stood out?', 'How will you respond?']}
          devotionalId="devotional"
          dayNumber={2}
          onOpenFullJournal={jest.fn()}
        />
      );
    });

    act(() => {
      tree!.root
        .findByProps({ accessibilityLabel: 'Reflection question 2: How will you respond?' })
        .props.onPress();
    });

    act(() => {
      tree!.root.findByProps({ accessibilityLabel: 'Done' }).props.onPress();
    });

    expect(
      tree!.root.findByProps({
        accessibilityLabel: 'Reflection question 2: How will you respond?',
      }).props.accessibilityState.expanded
    ).toBe(false);
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
    expect(Keyboard.dismiss).toHaveBeenCalled();

    act(() => tree!.unmount());
  });
});
