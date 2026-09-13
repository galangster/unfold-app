import React from 'react';
import { Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CompanionMessageContent } from '../CompanionMessageContent';
import type { CompanionMessage } from '@/lib/companion-chat-store';

const ERROR_COLOR = '#FF0000';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      accent: '#D4AF37',
      backgroundElevated: '#F7F2EA',
      border: '#DDD4C8',
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
    LinearTransition: { duration: () => ({ easing: () => ({ reduceMotion: () => undefined }) }) },
    ReduceMotion: { Never: 'never' },
    Easing: {
      cubic: 'cubic',
      in: () => 'in',
      inOut: () => 'inOut',
      out: () => 'out',
    },
    useReducedMotion: () => true,
  };
});

const mockCompanionOrbThinking: boolean[] = [];
jest.mock('@/components/CompanionOrb', () => {
  const ReactActual = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  return {
    CompanionOrb: (props: { thinking?: boolean; active?: boolean }) => {
      const instance = ReactActual.useRef(Symbol('companion-orb')).current;
      mockCompanionOrbThinking.push(Boolean(props.thinking));
      return ReactActual.createElement(RNView, {
        testID: 'companion-orb',
        instance,
        thinking: props.thinking,
        active: props.active,
      });
    },
  };
});

jest.mock('../DevotionalCard', () => ({
  DevotionalCard: () => null,
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

function companionMessage(
  status: CompanionMessage['status'],
  content = '',
): CompanionMessage {
  return {
    id: 'companion-live',
    role: 'companion',
    content,
    timestamp: 1,
    status,
  };
}

function liveMessageElement(
  message: CompanionMessage,
  options: { showIcon?: boolean; isStreaming?: boolean; active?: boolean } = {},
) {
  return (
    <CompanionMessageContent
      message={message}
      showIcon={options.showIcon ?? true}
      isStreaming={options.isStreaming ?? false}
      active={options.active ?? true}
      onVersePress={jest.fn()}
      onRetry={jest.fn()}
    />
  );
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

function companionOrbs(tree: any) {
  return tree.root
    .findAllByType(View)
    .filter((node: any) => node.props.testID === 'companion-orb');
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

describe('CompanionMessageContent live presence', () => {
  beforeEach(() => {
    mockCompanionOrbThinking.length = 0;
  });

  it('keeps one avatar instance from pending through streamed text and completion', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(liveMessageElement(companionMessage('streaming'), { isStreaming: true }));
    });

    const pendingBubble = tree.root.findByProps({ testID: 'companion-message-bubble' });
    const pendingPresence = tree.root.findByProps({ testID: 'companion-presence-slot' });
    expect(pendingPresence.props.accessible).toBe(true);
    expect(pendingPresence.props.accessibilityLabel).toBe('Companion is replying');
    expect(pendingPresence.props.accessibilityLiveRegion).toBe('polite');
    const pendingOrb = companionOrbs(tree)[0];
    const orbInstance = pendingOrb.props.instance;
    expect(tree.root.findAllByProps({ testID: 'reply-text' })).toHaveLength(0);
    expect(mockCompanionOrbThinking.slice(0, 2)).toEqual([false, true]);
    expect(pendingOrb.props.thinking).toBe(true);

    act(() => {
      tree.update(liveMessageElement(
        companionMessage('streaming', 'The response has started.'),
        { isStreaming: true },
      ));
    });
    expect(tree.root.findByProps({ testID: 'companion-message-bubble' })).toBe(pendingBubble);
    expect(tree.root.findByProps({ testID: 'companion-presence-slot' })).toBe(pendingPresence);
    expect(companionOrbs(tree)[0].props.instance).toBe(orbInstance);
    expect(companionOrbs(tree)[0].props.thinking).toBe(true);

    act(() => {
      tree.update(liveMessageElement(
        companionMessage('complete', 'The response has started.'),
      ));
    });
    expect(tree.root.findByProps({ testID: 'companion-message-bubble' })).toBe(pendingBubble);
    expect(companionOrbs(tree)[0].props.instance).toBe(orbInstance);
    expect(companionOrbs(tree)[0].props.thinking).toBe(false);
  });

  it('reunites the latest presence on error without a typing label', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(liveMessageElement(companionMessage('streaming'), { isStreaming: true }));
    });
    const orbInstance = companionOrbs(tree)[0].props.instance;

    act(() => {
      tree.update(liveMessageElement(
        errorMessage({ id: 'companion-live', content: 'Stopped', interrupted: false }),
        { isStreaming: false },
      ));
    });

    expect(companionOrbs(tree)).toHaveLength(1);
    expect(companionOrbs(tree)[0].props.instance).toBe(orbInstance);
    expect(companionOrbs(tree)[0].props.thinking).toBe(false);
    const visibleText = tree.root.findAllByType(Text).map((node: any) => node.props.children);
    expect(visibleText).not.toContain('Thinking…');
  });

  it('does not render a Companion presence in an older incoming bubble', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(liveMessageElement(
        companionMessage('complete', 'An older reply.'),
        { showIcon: false },
      ));
    });

    expect(companionOrbs(tree)).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'reply-text' }).props.children).toBe('An older reply.');
  });
});
