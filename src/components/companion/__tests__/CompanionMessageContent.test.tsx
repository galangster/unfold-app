import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CompanionMessageContent } from '../CompanionMessageContent';
import type { CompanionMessage } from '@/lib/companion-chat-store';
import {
  COMPANION_ERROR_CAPACITY,
  COMPANION_ERROR_CONNECTION,
} from '@/lib/companion-error-copy';

const MUTED_COLOR = '#666666';

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

jest.mock('react-native-reanimated', () => {
  return {
    __esModule: true,
    default: { View: 'AnimatedView' },
    FadeIn: { duration: () => ({ easing: () => undefined }) },
    LinearTransition: { duration: () => ({ easing: () => ({ reduceMotion: () => 'surface-growth' }) }) },
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
  options: { isStreaming?: boolean; motionActive?: boolean; reduceMotion?: boolean } = {},
) {
  return (
    <CompanionMessageContent
      message={message}
      isStreaming={options.isStreaming ?? false}
      motionActive={options.motionActive}
      reduceMotion={options.reduceMotion}
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
    .filter((node: any) => node.props.style?.color === MUTED_COLOR)
    .map((node: any) => node.props.children);
}

function pendingEllipses(tree: any) {
  return tree.root
    .findAllByProps({ testID: 'companion-pending-ellipsis' })
    .filter((node: any) => node.type === Text);
}

describe('CompanionMessageContent error rows', () => {
  it('renders an interrupted partial reply as reply text with a separate error line', () => {
    const onRetry = jest.fn();
    const partial = 'Elijah heard a gentle whisper in 1 Kings 19:12, and';
    const tree = render(
      errorMessage({ content: partial, interrupted: true, errorCopy: COMPANION_ERROR_CONNECTION }),
      onRetry,
    );

    expect(replyTexts(tree)).toEqual([partial]);
    expect(errorTexts(tree)).toEqual([COMPANION_ERROR_CONNECTION]);
    // The partial must not be painted in the error color.
    expect(errorTexts(tree)).not.toContain(partial);

    act(() => {
      tree.root.findByProps({ accessibilityLabel: `Retry. ${COMPANION_ERROR_CONNECTION}` }).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps a stored capacity cause on an interrupted partial', () => {
    const partial = 'The companion began to answer, then';
    const tree = render(
      errorMessage({ content: partial, interrupted: true, errorCopy: COMPANION_ERROR_CAPACITY }),
      jest.fn(),
    );

    expect(replyTexts(tree)).toEqual([partial]);
    expect(errorTexts(tree)).toEqual([COMPANION_ERROR_CAPACITY]);
  });

  it('does not invent a connection error when the user stopped the stream', () => {
    const tree = render(errorMessage({ content: 'A partial answer', interrupted: true }), jest.fn());

    expect(replyTexts(tree)).toEqual(['A partial answer']);
    expect(errorTexts(tree)).toEqual([]);
    expect(tree.root.findAllByProps({ accessibilityLabel: `Retry. ${COMPANION_ERROR_CONNECTION}` })).toHaveLength(0);
  });

  it('offers no retry affordance for an interrupted reply without a handler', () => {
    const tree = render(errorMessage({
      content: 'A partial answer',
      interrupted: true,
      errorCopy: COMPANION_ERROR_CONNECTION,
    }));

    expect(replyTexts(tree)).toEqual(['A partial answer']);
    expect(errorTexts(tree)).toEqual([COMPANION_ERROR_CONNECTION]);
    expect(tree.root.findAllByProps({ accessibilityLabel: `Retry. ${COMPANION_ERROR_CONNECTION}` })).toHaveLength(0);
  });

  it('maps stored network copy onto the bubble, not as reply text', () => {
    const tree = render(
      errorMessage({ content: 'You appear to be offline. Please check your connection and try again.' }),
      jest.fn(),
    );

    expect(replyTexts(tree)).toEqual([]);
    expect(errorTexts(tree)).toEqual([COMPANION_ERROR_CONNECTION]);
  });

  it('maps capacity copy onto the bubble', () => {
    const tree = render(
      errorMessage({ content: 'The companion is over capacity right now.' }),
      jest.fn(),
    );

    expect(replyTexts(tree)).toEqual([]);
    expect(errorTexts(tree)).toEqual([COMPANION_ERROR_CAPACITY]);
  });

  it('falls back to connection copy when the error row has no content', () => {
    expect(errorTexts(render(errorMessage(), jest.fn()))).toEqual([COMPANION_ERROR_CONNECTION]);
    expect(errorTexts(render(errorMessage()))).toEqual([COMPANION_ERROR_CONNECTION]);
    // An interrupted row with no stored cause must not blame the network.
    expect(errorTexts(render(errorMessage({ interrupted: true }), jest.fn()))).toEqual([]);
    expect(replyTexts(render(errorMessage({ interrupted: true }), jest.fn()))).toEqual([]);
  });

  it('renders complete messages through the block renderer with no error line', () => {
    const tree = render(errorMessage({ content: 'A finished reply.', status: 'complete' }));

    expect(replyTexts(tree)).toEqual(['A finished reply.']);
    expect(errorTexts(tree)).toEqual([]);
  });
});

describe('CompanionMessageContent streaming bubble', () => {
  it('shows one static, hidden ellipsis while a reply is waiting for its first token', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(liveMessageElement(companionMessage('streaming'), { isStreaming: true }));
    });

    const ellipsis = pendingEllipses(tree)[0];
    expect(pendingEllipses(tree)).toHaveLength(1);
    expect(ellipsis.props.children).toBe('…');
    expect(ellipsis.props.accessibilityElementsHidden).toBe(true);
    expect(ellipsis.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(tree.root.findAllByProps({ testID: 'reply-text' })).toHaveLength(0);
  });

  it('keeps the same bubble mounted from pending through streamed text and completion', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(liveMessageElement(companionMessage('streaming'), { isStreaming: true }));
    });

    const pendingBubble = tree.root.findByProps({ testID: 'companion-message-bubble' });
    expect(pendingEllipses(tree)).toHaveLength(1);

    act(() => {
      tree.update(liveMessageElement(
        companionMessage('streaming', 'The response has started.'),
        { isStreaming: true },
      ));
    });
    expect(tree.root.findByProps({ testID: 'companion-message-bubble' })).toBe(pendingBubble);
    expect(pendingEllipses(tree)).toHaveLength(0);

    act(() => {
      tree.update(liveMessageElement(
        companionMessage('complete', 'The response has started.'),
      ));
    });
    expect(tree.root.findByProps({ testID: 'companion-message-bubble' })).toBe(pendingBubble);
    expect(replyTexts(tree)).toEqual(['The response has started.']);
    expect(pendingEllipses(tree)).toHaveLength(0);
  });

  it('removes the pending ellipsis when the request becomes an error', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(liveMessageElement(companionMessage('streaming'), { isStreaming: true }));
    });

    act(() => {
      tree.update(liveMessageElement(
        errorMessage({ id: 'companion-live', content: 'Stopped', interrupted: false }),
        { isStreaming: false },
      ));
    });

    expect(pendingEllipses(tree)).toHaveLength(0);
    const visibleText = tree.root.findAllByType(Text).map((node: any) => node.props.children);
    expect(visibleText).not.toContain('Thinking…');
    expect(errorTexts(tree)).toEqual([COMPANION_ERROR_CONNECTION]);
  });

  it('disables bubble growth motion while the Ask route is hidden', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(liveMessageElement(
        companionMessage('streaming', 'A live reply.'),
        { isStreaming: true, motionActive: true, reduceMotion: false },
      ));
    });
    expect(tree.root.findByProps({ testID: 'companion-bubble-surface' }).props.layout).toBeDefined();

    act(() => {
      tree.update(liveMessageElement(
        companionMessage('streaming', 'A live reply.'),
        { isStreaming: true, motionActive: false, reduceMotion: false },
      ));
    });
    expect(tree.root.findByProps({ testID: 'companion-bubble-surface' }).props.layout).toBeUndefined();
    expect(
      tree.root.findAllByType('AnimatedView').every((node: any) => node.props.entering == null),
    ).toBe(true);
  });
});
