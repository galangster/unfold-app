import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import QaMethodReadingsRoute from '@/app/qa-method-readings';

const mockIsScripturePracticeEnabled = jest.fn(() => true);
const mockClear = jest.fn();
const mockSetReturn = jest.fn((_method: string) => true);
const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
const mockReplace = jest.fn();
const mockAddListener = jest.fn();
let mockMethod: string | undefined;
let beforeRemove: ((e: { data: { action: { type: string } }; preventDefault: () => void }) => void) | null = null;

jest.mock('@/lib/scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => mockIsScripturePracticeEnabled(),
}));

jest.mock('@/lib/qa-method-reading-return', () => ({
  clearQaMethodReadingReturn: () => mockClear(),
  setQaMethodReadingReturn: (method: string) => mockSetReturn(method),
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="qa-method-readings-redirect">{href}</Text>;
  },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => (() => void) | void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
  useLocalSearchParams: () => ({ method: mockMethod }),
  useNavigation: () => ({
    addListener: (...args: unknown[]) => mockAddListener(...args),
  }),
  useRouter: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    setParams: mockSetParams,
  }),
}));

jest.mock('../QaMethodReadingsScreen', () => ({
  QaMethodReadingsScreen: (props: {
    onClose: () => void;
    onOpenBible: (
      example: { methodId: string },
      passage: { bookId: number; chapter: number; verseStart: number },
    ) => void;
  }) => {
    const { Text, TouchableOpacity, View } = require('react-native');
    return (
      <View testID="qa-method-readings-screen">
        <TouchableOpacity testID="qa-close" onPress={props.onClose} />
        <TouchableOpacity
          testID="qa-open-bible"
          onPress={() => props.onOpenBible(
            { methodId: 'lectio_divina' },
            { bookId: 43, chapter: 1, verseStart: 1 },
          )}
        />
        <Text>screen</Text>
      </View>
    );
  },
}));

jest.mock('@/lib/qa-method-readings', () => ({
  buildQaMethodBibleHref: (passage: { bookId: number; chapter: number; verseStart: number }) =>
    `/(tabs)/(bible)/reader?bookId=${passage.bookId}&chapter=${passage.chapter}&verse=${passage.verseStart}`,
}));

describe('qa-method-readings route', () => {
  beforeEach(() => {
    mockIsScripturePracticeEnabled.mockReturnValue(true);
    mockClear.mockReset();
    mockSetReturn.mockReset().mockReturnValue(true);
    mockNavigate.mockReset();
    mockSetParams.mockReset();
    mockReplace.mockReset();
    beforeRemove = null;
    mockAddListener.mockReset().mockImplementation((event: string, handler: typeof beforeRemove) => {
      if (event === 'beforeRemove') beforeRemove = handler;
      return jest.fn();
    });
    mockMethod = 'lectio_divina';
  });

  it('returns hardware back to the library, then closes to Devotional', async () => {
    let handler: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    const remove = jest.fn();
    const listener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => {
      handler = callback;
      return { remove };
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<QaMethodReadingsRoute />); });
    await act(async () => { expect(handler?.({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true); });
    expect(mockSetParams).toHaveBeenCalledWith({ method: '' });
    expect(mockReplace).not.toHaveBeenCalled();
    mockMethod = undefined;
    await act(async () => { tree!.update(<QaMethodReadingsRoute />); });
    await act(async () => { expect(handler?.({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true); });
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(study)');
    await act(async () => { tree!.unmount(); });
    expect(remove).toHaveBeenCalled();
    listener.mockRestore();
  });

  it('renders the library when QA is on and redirects when it is off', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<QaMethodReadingsRoute />);
    });
    expect(tree!.root.findByProps({ testID: 'qa-method-readings-screen' })).toBeTruthy();

    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-open-bible' }).props.onPress();
    });
    expect(mockSetReturn).toHaveBeenCalledWith('lectio_divina');
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/(bible)/reader?bookId=43&chapter=1&verse=1');

    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-close' }).props.onPress();
    });
    expect(mockClear).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(study)');

    mockIsScripturePracticeEnabled.mockReturnValue(false);
    await act(async () => {
      tree!.update(<QaMethodReadingsRoute />);
    });
    expect(tree!.root.findByProps({ testID: 'qa-method-readings-redirect' }).props.children).toBe('/(tabs)/(today)');
    expect(mockClear).toHaveBeenCalled();
  });

  it('allows an explicit close and preserves a delayed Bible navigation', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<QaMethodReadingsRoute />);
    });
    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-open-bible' }).props.onPress();
      await Promise.resolve();
    });
    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemove?.({ data: { action: { type: 'NAVIGATE' } }, preventDefault });
    });
    expect(mockClear).not.toHaveBeenCalled();
    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-close' }).props.onPress();
      beforeRemove?.({ data: { action: { type: 'GO_BACK' } }, preventDefault });
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalled();
  });
});
