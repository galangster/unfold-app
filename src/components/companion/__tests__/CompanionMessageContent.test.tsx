import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CompanionMessageContent } from '../CompanionMessageContent';
import type { CompanionMessage } from '@/lib/companion-chat-store';

const ERROR_COLOR = '#FF0000';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      accent: '#D4AF37',
      error: '#FF0000',
      text: '#111111',
      textMuted: '#666666',
    },
  }),
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}${opacity}`,
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => ({ easing: () => undefined }) },
    Easing: {
      cubic: 'cubic',
      in: () => 'in',
      inOut: () => 'inOut',
      out: () => 'out',
    },
    useReducedMotion: () => true,
  };
});

jest.mock('@/components/CompanionOrb', () => ({
  CompanionOrb: () => null,
}));

jest.mock('../StreamingCursor', () => ({
  StreamingCursor: () => null,
}));

jest.mock('../DevotionalCard', () => ({
  DevotionalCard: () => null,
}));

jest.mock('@/lib/use-smooth-text-reveal', () => ({
  useSmoothTextReveal: (text: string) => text,
}));

// Stub the block renderer so the assertions stay about this component's
// branching: whatever text reaches RichMessageText is "reply text".
jest.mock('../RichMessageText', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    RichMessageText: ({ text }: { text: string }) => <RNText testID="reply-text">{text}</RNText>,
  };
});

function errorMessage(overrides: Partial<CompanionMessage> = {}): CompanionMessage {
  return {
    id: 'companion-1',
    role: 'companion',
    content: '',
    timestamp: 1,
    status: 'error',
    ...overrides,
  };
}

function render(message: CompanionMessage, onRetry?: () => void) {
  let tree: any;
  act(() => {
    tree = renderer.create(
      <CompanionMessageContent
        message={message}
        showIcon
        isStreaming={false}
        onVersePress={jest.fn()}
        onRetry={onRetry}
      />
    );
  });
  return tree;
}

function replyTexts(tree: any): string[] {
  return tree.root
    .findAllByProps({ testID: 'reply-text' })
    .filter((node: any) => node.type === Text)
    .map((node: any) => node.props.children);
}

function errorTexts(tree: any): string[] {
  return tree.root
    .findAllByType(Text)
    .filter((node: any) => node.props.style?.color === ERROR_COLOR)
    .map((node: any) => node.props.children);
}

describe('CompanionMessageContent error rows', () => {
  it('renders an interrupted partial reply as reply text with a separate error line', () => {
    const onRetry = jest.fn();
    const partial = 'Elijah heard a gentle whisper in 1 Kings 19:12, and';
    const tree = render(errorMessage({ content: partial, interrupted: true }), onRetry);

    expect(replyTexts(tree)).toEqual([partial]);
    expect(errorTexts(tree)).toEqual(['Something interrupted this reply. Tap to retry.']);
    // The partial must not be painted in the error color.
    expect(errorTexts(tree)).not.toContain(partial);

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Retry sending your message' }).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry affordance for an interrupted reply without a handler', () => {
    const tree = render(errorMessage({ content: 'A partial answer', interrupted: true }));

    expect(replyTexts(tree)).toEqual(['A partial answer']);
    expect(errorTexts(tree)).toEqual(['Something interrupted this reply. Try again?']);
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Retry sending your message' })).toHaveLength(0);
  });

  it('keeps an app-authored error string in the error line, not as reply text', () => {
    const copy = 'You appear to be offline. Please check your connection and try again.';
    const tree = render(errorMessage({ content: copy }), jest.fn());

    expect(replyTexts(tree)).toEqual([]);
    expect(errorTexts(tree)).toEqual([copy]);
  });

  it('falls back to generic copy when the error row has no content', () => {
    expect(errorTexts(render(errorMessage(), jest.fn()))).toEqual(['Something went wrong. Tap to retry.']);
    expect(errorTexts(render(errorMessage()))).toEqual(['Something went wrong. Try again?']);
    // An interrupted row that never received any text reads the same way.
    expect(errorTexts(render(errorMessage({ interrupted: true }), jest.fn()))).toEqual([
      'Something went wrong. Tap to retry.',
    ]);
    expect(replyTexts(render(errorMessage({ interrupted: true }), jest.fn()))).toEqual([]);
  });

  it('renders complete messages through the block renderer with no error line', () => {
    const tree = render(errorMessage({ content: 'A finished reply.', status: 'complete' }));

    expect(replyTexts(tree)).toEqual(['A finished reply.']);
    expect(errorTexts(tree)).toEqual([]);
  });
});
