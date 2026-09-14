import { useRef, useState } from 'react';
import { Text as RNText, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { ReaderText } from '../ReaderText';

describe('ReaderText', () => {
  it('refreshes native Text host identity on fontScale change and keeps parent state', () => {
    const dimensions = jest.spyOn(jest.requireActual('react-native'), 'useWindowDimensions');
    dimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });

    const parentTokens: symbol[] = [];

    function Harness() {
      const token = useRef(Symbol('journal-host'));
      parentTokens.push(token.current);
      const [draft, setDraft] = useState('unsaved answer');
      return (
        <View testID="surround">
          <RNText testID="draft">{draft}</RNText>
          <ReaderText testID="reader-host" onPress={() => setDraft('kept after edit')}>
            Reflection body
          </ReaderText>
        </View>
      );
    }

    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });

    act(() => {
      tree!.root.findByProps({ testID: 'reader-host' }).props.onPress();
    });
    expect(tree!.root.findByProps({ testID: 'draft' }).props.children).toBe('kept after edit');

    const firstHost = tree!.root.findByType(ReaderText).findByType(RNText);

    act(() => {
      dimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.6 });
      tree!.update(<Harness />);
    });

    const secondHost = tree!.root.findByType(ReaderText).findByType(RNText);
    expect(secondHost).not.toBe(firstHost);
    expect(tree!.root.findByProps({ testID: 'draft' }).props.children).toBe('kept after edit');
    expect(parentTokens.at(-1)).toBe(parentTokens[0]);
    expect(secondHost.props.maxFontSizeMultiplier).toBe(1.8);

    act(() => {
      tree!.unmount();
    });
    dimensions.mockRestore();
  });
});
