import { render } from '@testing-library/react-native';
import { createRef, type Ref } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { cssInterop } from 'react-native-css-interop';

// On device, NativeWind's JSX runtime swaps View, Text, TextInput, ScrollView
// and Image for css-interop wrappers. React Native 0.86 writes them as plain
// function components that take `ref` as a prop, so they go through
// css-interop's function branch. Unpatched, that branch drops the ref
// (patches/react-native-css-interop@0.1.22.patch). Jest never registers the
// core wrappers, so this suite registers its own function component.
function RefTarget({ ref, style }: { ref?: Ref<View>; style?: StyleProp<ViewStyle> }) {
  return <View ref={ref} style={style} />;
}
cssInterop(RefTarget, { className: 'style' });

describe('css-interop ref forwarding', () => {
  it('attaches a ref written in app JSX to a registered function component', () => {
    const ref = createRef<View>();

    render(<RefTarget ref={ref} />);

    expect(ref.current).not.toBeNull();
  });
});
