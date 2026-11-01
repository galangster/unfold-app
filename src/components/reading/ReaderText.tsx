import { type ComponentPropsWithRef } from 'react';
import { Text, useWindowDimensions } from 'react-native';

type ReaderTextProps = ComponentPropsWithRef<typeof Text>;

/**
 * iOS can paint larger Dynamic Type glyphs before the native Text host
 * invalidates its measured bounds. Key only that host on fontScale so
 * reading, reflection, and tomorrow copy reflow without remounting the
 * reader or journal.
 */
export function ReaderText({ ref, ...props }: ReaderTextProps) {
  const { fontScale } = useWindowDimensions();
  // Caller refs target the native host directly, so focus does not depend on
  // NativeWind's Text wrapper.
  return <Text key={fontScale} maxFontSizeMultiplier={1.8} {...props} ref={ref} {...(ref ? { cssInterop: false } : null)} />;
}
