/** @jsxImportSource react */
import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  type TextProps,
} from 'react-native';

/** Scale glyphs and line boxes together in compact controls, up to 200%. */
export const AmbientText = forwardRef<Text, TextProps>(function AmbientText(
  { style, ...props },
  ref,
) {
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(fontScale, 2);
  const base = StyleSheet.flatten(style);
  const size = base?.fontSize ?? 14;
  return (
    <Text
      {...props}
      ref={ref}
      allowFontScaling={false}
      style={[
        style,
        {
          fontSize: size * scale,
          lineHeight: (base?.lineHeight ?? size * 1.3) * scale,
        },
      ]}
    />
  );
});
