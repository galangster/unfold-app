import { type ComponentProps } from 'react';
import { Text, useWindowDimensions } from 'react-native';

type ReaderTextProps = ComponentProps<typeof Text>;

/**
 * iOS can paint larger Dynamic Type glyphs before the native Text host
 * invalidates its measured bounds. Key only that host on fontScale so
 * reading, reflection, and tomorrow copy reflow without remounting the
 * reader or journal.
 */
export function ReaderText(props: ReaderTextProps) {
  const { fontScale } = useWindowDimensions();
  return <Text key={fontScale} maxFontSizeMultiplier={1.8} {...props} />;
}
