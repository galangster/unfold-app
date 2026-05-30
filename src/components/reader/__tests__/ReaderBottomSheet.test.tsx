import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { ReaderBottomSheet } from '../ReaderBottomSheet';

const renderer = require('react-test-renderer');
const { act } = renderer;

let panGesture: any;

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#0A0A0A',
      backgroundElevated: '#141210',
      text: '#F5F0EB',
      textMuted: 'rgba(245,240,235,0.6)',
      textSubtle: 'rgba(245,240,235,0.4)',
      border: 'rgba(245,240,235,0.08)',
      borderStrong: 'rgba(245,240,235,0.28)',
    },
    isDark: true,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 12, left: 0 }),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  Easing: {
    out: jest.fn((value) => value),
    in: jest.fn((value) => value),
    inOut: jest.fn((value) => value),
    cubic: 'cubic',
  },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => true,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
    callback?.(true);
    return value;
  },
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makePan = () => {
    const gesture: any = {
      activeOffsetY: jest.fn(() => gesture),
      failOffsetX: jest.fn(() => gesture),
      onUpdate: jest.fn((handler) => {
        gesture.updateHandler = handler;
        return gesture;
      }),
      onEnd: jest.fn((handler) => {
        gesture.endHandler = handler;
        return gesture;
      }),
    };
    panGesture = gesture;
    return gesture;
  };

  return {
    Gesture: { Pan: jest.fn(makePan) },
    GestureDetector: ({ children }: any) => <View testID="reader-sheet-gesture-detector">{children}</View>,
    GestureHandlerRootView: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

jest.mock('phosphor-react-native', () => ({
  XIcon: () => null,
}));

function renderSheet(props: Partial<React.ComponentProps<typeof ReaderBottomSheet>> = {}) {
  const onClose = props.onClose ?? jest.fn();
  let tree: any;
  act(() => {
    tree = renderer.create(
      <ReaderBottomSheet
        visible={props.visible ?? true}
        title={props.title ?? 'Reader preferences'}
        onClose={onClose}
        bottomInset={props.bottomInset ?? 20}
        testID={props.testID ?? 'reader-preferences-sheet'}
        accessibilityLabel={props.accessibilityLabel}
        footer={props.footer}
      >
        {props.children ?? <Text>Sheet body</Text>}
      </ReaderBottomSheet>,
    );
  });
  return { tree, onClose };
}

describe('ReaderBottomSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    panGesture = undefined;
  });

  it('renders nothing while hidden', () => {
    const { tree } = renderSheet({ visible: false });

    expect(tree.toJSON()).toBeNull();
  });

  it('renders title, children, footer, backdrop, grabber, surface, and close affordance when visible', () => {
    const { tree } = renderSheet({ footer: <Text>Footer action</Text> });

    expect(tree.root.findByProps({ testID: 'reader-bottom-sheet-backdrop' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'reader-bottom-sheet-surface' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'reader-bottom-sheet-grabber' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'reader-bottom-sheet-close' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'reader-preferences-sheet' })).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).toContain('Reader preferences');
    expect(JSON.stringify(tree.toJSON())).toContain('Sheet body');
    expect(JSON.stringify(tree.toJSON())).toContain('Footer action');
  });

  it('closes from backdrop and close button presses', () => {
    const { tree, onClose } = renderSheet();

    act(() => {
      tree.root.findByProps({ testID: 'reader-bottom-sheet-backdrop' }).props.onPress();
    });
    act(() => {
      tree.root.findByProps({ testID: 'reader-bottom-sheet-close' }).props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('wires downward pan on the grabber/header region without wrapping sheet controls', () => {
    const { tree, onClose } = renderSheet({
      children: <TouchableOpacity testID="inner-control"><Text>Inner control</Text></TouchableOpacity>,
    });

    const detector = tree.root.findByProps({ testID: 'reader-sheet-gesture-detector' });
    const innerControl = tree.root.findByProps({ testID: 'inner-control' });

    expect(detector.findByProps({ testID: 'reader-bottom-sheet-grabber' })).toBeTruthy();
    expect(() => detector.findByProps({ testID: 'inner-control' })).toThrow();
    expect(innerControl).toBeTruthy();

    expect(panGesture.onUpdate).toHaveBeenCalled();
    expect(panGesture.onEnd).toHaveBeenCalled();

    act(() => {
      panGesture.updateHandler({ translationY: 24 });
      panGesture.endHandler({ translationY: 90, velocityY: 100 });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
