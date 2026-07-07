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

jest.mock('@/components/VoiceInputBar', () => ({
  VoiceInputBar: () => null,
}));

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

const COMPANION_MESSAGE_MAX_CHARS = 4000;

function renderInput(onSend: (text: string) => boolean) {
  let tree: any;

  act(() => {
    tree = renderer.create(
      <CompanionInput
        onSend={onSend}
        onStop={jest.fn()}
        isStreaming={false}
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

    expect(tree.root.findByType(TextInput).props.maxLength).toBe(COMPANION_MESSAGE_MAX_CHARS);
    expect(
      tree.root
        .findAllByType(Text)
        .some((node: any) => node.props.children === '4,001 / 4,000')
    ).toBe(true);

    pressSend(tree);

    expect(onSend).toHaveBeenCalledWith(message);
    expect(tree.root.findByType(TextInput).props.value).toBe(message);
  });
});
