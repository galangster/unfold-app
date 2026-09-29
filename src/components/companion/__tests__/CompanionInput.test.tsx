import React from 'react';
import { Text, TextInput } from 'react-native';

const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('phosphor-react-native', () => ({
  ArrowUpIcon: () => null,
  StopCircleIcon: () => null,
  MicrophoneIcon: () => null,
}));

let mockVoiceProps: { onChangeText: (text: string) => void } | null = null;
jest.mock('@/components/VoiceInputBar', () => {
  const { createElement } = jest.requireActual('react');
  return {
    VoiceInputBar: (props: { onChangeText: (text: string) => void }) => {
      mockVoiceProps = props;
      return createElement('VoiceInputBar');
    },
  };
});

jest.mock('@/components/ui', () => ({
  alpha: (color: string) => color,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      accent: '#D4AF37',
      backgroundElevated: '#FFFFFF',
      backgroundPure: '#FFFFFF',
      border: '#DDDDDD',
      buttonBackground: '#F4F4F4',
      error: '#FF0000',
      inputBackground: '#FFFFFF',
      text: '#111111',
      textHint: '#777777',
      textMuted: '#666666',
    },
  }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      View,
    },
    Easing: {
      cubic: 'cubic',
      in: () => 'in',
      inOut: () => 'inOut',
      out: () => 'out',
    },
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

const COMPANION_MESSAGE_MAX_CHARS = 4000;

// Drafts live in memory for the whole process, so each test starts clean.
beforeEach(() => clearCompanionDrafts());

function renderInput(onSend: (text: string) => boolean, conversationId = 'conversation-a') {
  let tree: any;

  act(() => {
    tree = renderer.create(
      <CompanionInput
        onSend={onSend}
        onStop={jest.fn()}
        isStreaming={false}
        conversationId={conversationId}
      />
    );
  });

  return tree;
}

function enterText(tree: any, text: string) {
  act(() => {
    tree.root.findByType(TextInput).props.onChangeText(text);
  });
}

function pressSend(tree: any) {
  act(() => {
    tree.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress();
  });
}

describe('CompanionInput send clearing', () => {
  it('preserves the draft when the screen send guard rejects', () => {
    const onSend = jest.fn(() => false);
    const tree = renderInput(onSend);

    enterText(tree, '  I need help with prayer  ');
    pressSend(tree);

    expect(onSend).toHaveBeenCalledWith('I need help with prayer');
    expect(tree.root.findByType(TextInput).props.value).toBe('  I need help with prayer  ');
  });

  it('clears the draft when the screen accepts the send', () => {
    const onSend = jest.fn(() => true);
    const tree = renderInput(onSend);

    enterText(tree, 'What does this verse mean?');
    pressSend(tree);

    expect(onSend).toHaveBeenCalledWith('What does this verse mean?');
    expect(tree.root.findByType(TextInput).props.value).toBe('');
  });

  it('surfaces the length cap and preserves an over-limit draft when rejected', () => {
    const onSend = jest.fn((message: string) => message.length <= COMPANION_MESSAGE_MAX_CHARS);
    const tree = renderInput(onSend);
    const message = 'a'.repeat(COMPANION_MESSAGE_MAX_CHARS + 1);

    enterText(tree, message);

    // No hard maxLength: voice dictation appends programmatically and can push
    // the draft past the cap, so the limit is surfaced rather than enforced.
    expect(tree.root.findByType(TextInput).props.maxLength).toBeUndefined();
    expect(
      tree.root
        .findAllByType(Text)
        .some((node: any) => node.props.children === '4,001 / 4,000')
    ).toBe(true);

    pressSend(tree);

    expect(onSend).toHaveBeenCalledWith(message);
    expect(tree.root.findByType(TextInput).props.value).toBe(message);
  });

  it('updates the native font-scale prop without remounting or clearing the draft', () => {
    const onSend = jest.fn(() => true);
    const onStop = jest.fn();
    let tree: any;

    act(() => {
      tree = renderer.create(
        <CompanionInput conversationId="conversation-a"
          onSend={onSend}
          onStop={onStop}
          isStreaming={false}
          fontScale={1}
        />
      );
    });
    enterText(tree, 'Keep this draft and focus target');

    act(() => {
      tree.update(
        <CompanionInput conversationId="conversation-a"
          onSend={onSend}
          onStop={onStop}
          isStreaming={false}
          fontScale={2.35}
        />
      );
    });

    const input = tree.root.findByType(TextInput);
    expect(input.props.value).toBe('Keep this draft and focus target');
    expect(input.props.maxFontSizeMultiplier).toBe(1.8);
  });

  it('centers the empty field in the 44pt pill so the placeholder is not low', () => {
    const tree = renderInput(jest.fn(() => true));
    const input = tree.root.findByType(TextInput);
    expect(input.parent.props.style).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        minHeight: 44,
      }),
    );
    expect(input.props.style).toEqual(
      expect.objectContaining({
        paddingTop: 0,
        paddingBottom: 0,
      }),
    );
  });

  it.each([
    ['Voice input', false, ''],
    ['Send message', false, 'Ready to send'],
    ['Stop generating', true, ''],
  ])('gives %s button semantics and a real 44-point frame', (label, isStreaming, draft) => {
    const onSend = jest.fn(() => true);
    let tree: any;

    act(() => {
      tree = renderer.create(
        <CompanionInput conversationId="conversation-a" onSend={onSend} onStop={jest.fn()} isStreaming={isStreaming} />
      );
    });
    if (draft) enterText(tree, draft);

    const button = tree.root.findByProps({ accessibilityLabel: label });
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.hitSlop).toBeUndefined();
    expect(button.props.style).toEqual(expect.objectContaining({ width: 44, height: 44 }));
  });
});

describe('CompanionInput drafts across conversations', () => {
  function switchTo(tree: any, onSend: (text: string) => boolean, conversationId: string) {
    act(() => {
      tree.update(<CompanionInput onSend={onSend} onStop={jest.fn()} isStreaming={false} conversationId={conversationId} />);
    });
  }
  const shownText = (tree: any) => tree.root.findByType(TextInput).props.value;
  const startRecording = (tree: any) => act(() => {
    tree.root.findByProps({ accessibilityLabel: 'Voice input' }).props.onPress();
  });

  it('never sends one conversation\'s unsent text to another, and keeps it for its return', () => {
    const onSend = jest.fn(() => true);
    const tree = renderInput(onSend);
    enterText(tree, "Pray for Sam's surgery");

    switchTo(tree, onSend, 'conversation-b');
    expect(shownText(tree)).toBe('');
    enterText(tree, 'Hello from B');
    pressSend(tree);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Hello from B');

    switchTo(tree, onSend, 'conversation-a');
    expect(shownText(tree)).toBe("Pray for Sam's surgery");
    switchTo(tree, onSend, 'conversation-b');
    expect(shownText(tree)).toBe('');
  });

  it('ends a recording when the conversation changes', () => {
    const tree = renderInput(jest.fn(() => true));
    startRecording(tree);
    expect(tree.root.findAllByType('VoiceInputBar')).toHaveLength(1);

    switchTo(tree, jest.fn(() => true), 'conversation-b');
    expect(tree.root.findAllByType('VoiceInputBar')).toHaveLength(0);
  });

  it('drops a voice result that arrives after the conversation changed', () => {
    const onSend = jest.fn(() => true);
    const tree = renderInput(onSend);
    startRecording(tree);
    const lateResult = mockVoiceProps!.onChangeText;

    switchTo(tree, onSend, 'conversation-b');
    act(() => lateResult('A transcript meant for A'));
    expect(shownText(tree)).toBe('');
    switchTo(tree, onSend, 'conversation-a');
    expect(shownText(tree)).toBe('');
  });

  it('keeps a voice result in the conversation it was recorded in', () => {
    const tree = renderInput(jest.fn(() => true));
    startRecording(tree);
    act(() => mockVoiceProps!.onChangeText('A transcript for A'));
    expect(shownText(tree)).toBe('A transcript for A');
  });
});
