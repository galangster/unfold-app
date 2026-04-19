import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { CheckIcon } from 'phosphor-react-native';

import { Duration, Ease } from '@/constants/animations';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { getNoteDetailSaveIndicatorLayout, type NoteDetailSaveState } from '@/lib/note-detail-save-indicator';

export function NoteDetailSaveIndicator({
  isEditing,
  saveState,
  reducedMotion,
  textColor,
  iconColor,
}: {
  isEditing: boolean;
  saveState: NoteDetailSaveState;
  reducedMotion: boolean;
  textColor: string;
  iconColor: string;
}) {
  const layout = getNoteDetailSaveIndicatorLayout({ isEditing, saveState });

  if (!layout.showSlot) return null;

  return (
    <View
      testID="note-detail-save-indicator-slot"
      style={[styles.slot, { width: layout.slotWidth, minHeight: layout.slotMinHeight }]}
    >
      {layout.showLabel && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
          exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
          style={styles.indicator}
        >
          <CheckIcon size={14} color={iconColor} weight="bold" />
          <Text testID="note-detail-save-indicator-label" style={[styles.text, { color: textColor }]}>Saved</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 56,
    minHeight: 16,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
  },
  text: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
  },
});
