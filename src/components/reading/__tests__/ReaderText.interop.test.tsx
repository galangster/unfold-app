import { createRef, type ReactElement } from 'react';
import { Text } from 'react-native';
import { cssInterop } from 'react-native-css-interop';
import { render } from '@testing-library/react-native';

import { ReaderText } from '../ReaderText';

// On device, React Native 0.86's Text is a function component, and NativeWind's
// interop must keep refs on function components. Jest's preset Text is a class that
// keeps refs, so this file puts a function Text behind the interop, as the app
// runs it on device.
jest.mock('react-native/Libraries/Text/Text', () => {
  const { createElement } = jest.requireActual('react');
  function Text({ ref, ...props }: { ref?: unknown }) {
    return createElement('RCTText', { ...props, ref });
  }
  return { __esModule: true, default: Text };
});
cssInterop(Text, { className: 'style' });

// The test renderer hands host refs null unless it is given a node to hand out.
const renderWithHosts = (ui: ReactElement) => render(ui, { createNodeMock: () => ({ host: true }) });

describe('ReaderText behind NativeWind', () => {
  it('keeps a native ref on a plain function Text through the patched interop', () => {
    const ref = createRef<Text>();
    renderWithHosts(<Text ref={ref}>Weary</Text>);
    expect(ref.current).toEqual({ host: true });
  });

  it('keeps a caller ref, so the feelings headings can take VoiceOver focus', () => {
    const ref = createRef<Text>();
    renderWithHosts(<ReaderText ref={ref}>Weary</ReaderText>);
    expect(ref.current).toEqual({ host: true });
  });
});
