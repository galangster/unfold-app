/** @jsxImportSource react */
import React, { useState } from 'react';
import { PixelRatio, Platform, Text, type LayoutChangeEvent, type TextProps } from 'react-native';

interface BibleVerseTextProps extends TextProps {
  layoutKey: string;
}

function MeasuredParagraph({ style, onLayout, ...props }: TextProps) {
  const [minimumHeight, setMinimumHeight] = useState<number>();

  function handleLayout(event: LayoutChangeEvent) {
    if (Platform.OS === 'ios' && minimumHeight === undefined) {
      const height = event.nativeEvent.layout.height;
      if (height > 0) {
        const scale = PixelRatio.get();
        // Fabric can turn a measured 144pt paragraph into 143.999878pt.
        // TextKit then drops its last line and clips that text into the line
        // above. Round the actual host height up, with one physical pixel for
        // the next Fabric rounding. Padding is excluded from its content frame.
        setMinimumHeight((Math.ceil(height * scale) + 1) / scale);
      }
    }
    onLayout?.(event);
  }

  return (
    <Text
      {...props}
      onLayout={handleLayout}
      style={[style, minimumHeight === undefined ? undefined : { minHeight: minimumHeight }]}
    />
  );
}

export function BibleVerseText({ layoutKey, ...props }: BibleVerseTextProps) {
  // Width, typography, content and inline markers invalidate the old minimum.
  return <MeasuredParagraph key={layoutKey} {...props} />;
}
