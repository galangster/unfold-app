// Shared geometry for custom sheet handles and Gorhom indicators.
import React, { forwardRef } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';

export const SHEET_HANDLE = {
  width: 36,
  height: 4,
  radius: 2,
  paddingTop: Spacing['3'],
  paddingBottom: Spacing['2'],
} as const;

export const sheetHandleIndicatorStyle = {
  width: SHEET_HANDLE.width,
  height: SHEET_HANDLE.height,
  borderRadius: SHEET_HANDLE.radius,
} as const;

export const SheetHandle = forwardRef<View, ViewProps>(function SheetHandle(
  { style, testID, ...rest },
  ref,
) {
  const { colors } = useTheme();

  return (
    <View ref={ref} style={[styles.row, style]} {...rest}>
      <View
        testID={testID}
        style={[styles.bar, { backgroundColor: colors.borderStrong }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    paddingTop: SHEET_HANDLE.paddingTop,
    paddingBottom: SHEET_HANDLE.paddingBottom,
  },
  bar: {
    ...sheetHandleIndicatorStyle,
  },
});
