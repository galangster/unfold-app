import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BookmarkSimpleIcon, CaretRightIcon, MinusIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useUnfoldStore } from '@/lib/store';
import type { BibleReaderSettings } from '@/lib/store';

interface ReadingSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  tabBarHeight: number;
  onOpenSavedVerses?: () => void;
  savedVersesCount?: number;
}

const LINE_HEIGHT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Compact', value: 1.8 },
  { label: 'Comfortable', value: 2.1 },
  { label: 'Relaxed', value: 2.5 },
];

const TRANSLATION_OPTIONS: Array<BibleReaderSettings['translation']> = ['BSB', 'KJV'];

const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 28;

const EASE_OUT_QUART = Easing.bezier(0.165, 0.84, 0.44, 1);

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Reading Settings Sheet
 *
 *    0ms   overlay fades in (200ms)
 *    0ms   card fades in + slides up 12px (250ms ease-out-quart)
 *  250ms   settled
 *
 * Exit:
 *    0ms   card fades out (180ms)
 *    0ms   overlay fades out (150ms)
 * ───────────────────────────────────────────────────────── */

const ANIM = {
  sheetEnter:   250,   // card fade + slide up
  sheetExit:    180,   // card fade out
  overlayEnter: 200,   // backdrop fade in
  overlayExit:  150,   // backdrop fade out
};

export function ReadingSettingsSheet({ visible, onClose, tabBarHeight, onOpenSavedVerses, savedVersesCount }: ReadingSettingsSheetProps) {
  const { colors, isDark } = useTheme();
  const settings = useUnfoldStore((s) => s.bibleReaderSettings);
  const updateSettings = useUnfoldStore((s) => s.updateBibleReaderSettings);
  const [minusPressed, setMinusPressed] = useState(false);
  const [plusPressed, setPlusPressed] = useState(false);

  // Slide-up animation for the settings card
  const sheetSlideY = useSharedValue(12);
  useEffect(() => {
    if (visible) {
      sheetSlideY.value = 12;
      sheetSlideY.value = withTiming(0, { duration: ANIM.sheetEnter, easing: EASE_OUT_QUART });
    }
  }, [visible]);
  const sheetSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetSlideY.value }],
  }));

  if (!visible) return null;

  const sectionBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const controlBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const pressedBg = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.15)';
  const selectedBg = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.12)';

  return (
    <>
      {/* Dark overlay */}
      <Animated.View
        entering={FadeIn.duration(ANIM.overlayEnter)}
        exiting={FadeOut.duration(ANIM.overlayExit)}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close settings"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Settings card */}
      <Animated.View
        entering={FadeIn.duration(ANIM.sheetEnter)}
        exiting={FadeOut.duration(ANIM.sheetExit)}
        style={[
          styles.container,
          {
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            shadowColor: '#000',
            bottom: tabBarHeight + 16,
          },
          sheetSlideStyle,
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: FontFamily.uiMedium }]}>
            Reading Settings
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Close"
            accessibilityRole="button"
            style={[styles.closeButton, { backgroundColor: controlBg }]}
            hitSlop={8}
          >
            <XIcon size={14} color={colors.textSubtle} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* Font Size */}
        <View style={[styles.section, { borderBottomColor: sectionBorder }]}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Aa</Text>
            <View style={styles.fontSizeControls}>
              <TouchableOpacity
                onPress={() => {
                  if (settings.fontSize > MIN_FONT_SIZE) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ fontSize: settings.fontSize - 1 });
                  }
                }}
                onPressIn={() => setMinusPressed(true)}
                onPressOut={() => setMinusPressed(false)}
                disabled={settings.fontSize <= MIN_FONT_SIZE}
                style={[
                  styles.fontSizeButton,
                  { backgroundColor: minusPressed && settings.fontSize > MIN_FONT_SIZE ? pressedBg : controlBg },
                  settings.fontSize <= MIN_FONT_SIZE && styles.disabledControl,
                ]}
                activeOpacity={1}
                accessibilityLabel="Decrease font size"
                accessibilityRole="button"
                hitSlop={4}
              >
                <MinusIcon
                  size={16}
                  color={settings.fontSize <= MIN_FONT_SIZE ? colors.textHint : colors.text}
                  weight={minusPressed && settings.fontSize > MIN_FONT_SIZE ? 'bold' : 'light'}
                />
              </TouchableOpacity>

              <Text style={[styles.fontSizeValue, { color: colors.text }]}>
                {settings.fontSize}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  if (settings.fontSize < MAX_FONT_SIZE) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ fontSize: settings.fontSize + 1 });
                  }
                }}
                onPressIn={() => setPlusPressed(true)}
                onPressOut={() => setPlusPressed(false)}
                disabled={settings.fontSize >= MAX_FONT_SIZE}
                style={[
                  styles.fontSizeButton,
                  { backgroundColor: plusPressed && settings.fontSize < MAX_FONT_SIZE ? pressedBg : controlBg },
                  settings.fontSize >= MAX_FONT_SIZE && styles.disabledControl,
                ]}
                activeOpacity={1}
                accessibilityLabel="Increase font size"
                accessibilityRole="button"
                hitSlop={4}
              >
                <PlusIcon
                  size={16}
                  color={settings.fontSize >= MAX_FONT_SIZE ? colors.textHint : colors.text}
                  weight={plusPressed && settings.fontSize < MAX_FONT_SIZE ? 'bold' : 'light'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Line Height */}
        <View style={[styles.section, { borderBottomColor: sectionBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSubtle }]}>Line Height</Text>
          <View style={styles.segmentedRow}>
            {LINE_HEIGHT_OPTIONS.map((opt) => {
              const isActive = settings.lineHeightMultiplier === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ lineHeightMultiplier: opt.value });
                  }}
                  style={[
                    styles.segmentButton,
                    { backgroundColor: isActive ? selectedBg : controlBg },
                  ]}
                  activeOpacity={0.7}
                  accessibilityLabel={`${opt.label} line height`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[
                    styles.segmentLabel,
                    { color: isActive ? colors.text : colors.textHint },
                    isActive && { fontFamily: FontFamily.uiMedium },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Translation */}
        <View style={[onOpenSavedVerses ? styles.section : styles.sectionLast, onOpenSavedVerses && { borderBottomColor: sectionBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSubtle }]}>Translation</Text>
          <View style={styles.segmentedRow}>
            {TRANSLATION_OPTIONS.map((t) => {
              const isActive = settings.translation === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ translation: t });
                  }}
                  style={[
                    styles.translationButton,
                    { backgroundColor: isActive ? selectedBg : controlBg },
                  ]}
                  activeOpacity={0.7}
                  accessibilityLabel={`${t} translation`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[
                    styles.translationLabel,
                    { color: isActive ? colors.text : colors.textHint },
                    isActive && { fontFamily: FontFamily.uiMedium },
                  ]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Library */}
        {onOpenSavedVerses && (
          <View style={styles.sectionLast}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenSavedVerses();
              }}
              style={[styles.libraryRow, { backgroundColor: controlBg }]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Saved verses${savedVersesCount != null ? `, ${savedVersesCount} items` : ''}`}
            >
              <BookmarkSimpleIcon size={18} color={colors.text} weight="regular" />
              <Text style={[styles.libraryLabel, { color: colors.text }]}>Saved verses</Text>
              {savedVersesCount != null && savedVersesCount > 0 && (
                <Text style={[styles.libraryCount, { color: colors.textSubtle }]}>{savedVersesCount}</Text>
              )}
              <CaretRightIcon size={14} color={colors.textSubtle} weight="regular" />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 99,
  },
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    marginHorizontal: 8,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['5'],
    paddingBottom: Spacing['5'],
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['4'],
  },
  headerTitle: {
    fontSize: FontSize.base,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sections
  section: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLast: {
    paddingVertical: 14,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Font size controls
  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  fontSizeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeValue: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    minWidth: 28,
    textAlign: 'center',
  },
  disabledControl: {
    opacity: 0.35,
  },

  // Segmented controls
  segmentedRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },

  // Translation
  translationButton: {
    paddingHorizontal: Spacing['6'],
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  translationLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    letterSpacing: 0.5,
  },

  // Library row
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  libraryLabel: {
    flex: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  libraryCount: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});
