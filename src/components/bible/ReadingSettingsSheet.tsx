import React from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { MinusIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import type { BibleReaderSettings } from '@/lib/store';

interface ReadingSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  tabBarHeight: number;
}

const LINE_HEIGHT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Compact', value: 1.5 },
  { label: 'Comfortable', value: 1.8 },
  { label: 'Relaxed', value: 2.1 },
];

const TRANSLATION_OPTIONS: Array<BibleReaderSettings['translation']> = ['BSB', 'KJV'];

const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 28;

export function ReadingSettingsSheet({ visible, onClose, tabBarHeight }: ReadingSettingsSheetProps) {
  const { colors, isDark } = useTheme();
  const settings = useUnfoldStore((s) => s.bibleReaderSettings);
  const updateSettings = useUnfoldStore((s) => s.updateBibleReaderSettings);

  if (!visible) return null;

  const sectionBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const controlBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const activeBg = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)';

  return (
    <>
      {/* Dark overlay */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Close settings"
        accessibilityRole="button"
      />

      {/* Settings card */}
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(200)}
        exiting={SlideOutDown.duration(180)}
        style={[
          styles.container,
          {
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            shadowColor: '#000',
            bottom: tabBarHeight,
          },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />
        </View>

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
                    updateSettings({ fontSize: settings.fontSize - 1 });
                  }
                }}
                disabled={settings.fontSize <= MIN_FONT_SIZE}
                style={[
                  styles.fontSizeButton,
                  { backgroundColor: controlBg },
                  settings.fontSize <= MIN_FONT_SIZE && styles.disabledControl,
                ]}
                accessibilityLabel="Decrease font size"
                accessibilityRole="button"
                hitSlop={4}
              >
                <MinusIcon
                  size={16}
                  color={settings.fontSize <= MIN_FONT_SIZE ? colors.textHint : colors.text}
                  weight="light"
                />
              </TouchableOpacity>

              <Text style={[styles.fontSizeValue, { color: colors.text }]}>
                {settings.fontSize}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  if (settings.fontSize < MAX_FONT_SIZE) {
                    updateSettings({ fontSize: settings.fontSize + 1 });
                  }
                }}
                disabled={settings.fontSize >= MAX_FONT_SIZE}
                style={[
                  styles.fontSizeButton,
                  { backgroundColor: controlBg },
                  settings.fontSize >= MAX_FONT_SIZE && styles.disabledControl,
                ]}
                accessibilityLabel="Increase font size"
                accessibilityRole="button"
                hitSlop={4}
              >
                <PlusIcon
                  size={16}
                  color={settings.fontSize >= MAX_FONT_SIZE ? colors.textHint : colors.text}
                  weight="light"
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
                  onPress={() => updateSettings({ lineHeightMultiplier: opt.value })}
                  style={[
                    styles.segmentButton,
                    { backgroundColor: isActive ? activeBg : controlBg },
                    isActive && { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', borderWidth: 1 },
                  ]}
                  accessibilityLabel={`${opt.label} line height`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[
                    styles.segmentLabel,
                    { color: isActive ? colors.text : colors.textSubtle },
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
        <View style={[styles.section, { borderBottomColor: sectionBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSubtle }]}>Translation</Text>
          <View style={styles.segmentedRow}>
            {TRANSLATION_OPTIONS.map((t) => {
              const isActive = settings.translation === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => updateSettings({ translation: t })}
                  style={[
                    styles.translationButton,
                    { backgroundColor: isActive ? activeBg : controlBg },
                    isActive && { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', borderWidth: 1 },
                  ]}
                  accessibilityLabel={`${t} translation`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[
                    styles.translationLabel,
                    { color: isActive ? colors.text : colors.textSubtle },
                    isActive && { fontFamily: FontFamily.uiMedium },
                  ]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Verse Numbers Toggle */}
        <View style={[styles.section, { borderBottomColor: sectionBorder }]}>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Verse Numbers</Text>
            <Switch
              value={settings.showVerseNumbers}
              onValueChange={(val) => updateSettings({ showVerseNumbers: val })}
              trackColor={{
                false: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                true: colors.accent,
              }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Toggle verse numbers"
            />
          </View>
        </View>

        {/* Paragraph Mode Toggle */}
        <View style={styles.sectionLast}>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Paragraph Mode</Text>
            <Switch
              value={settings.paragraphMode}
              onValueChange={(val) => updateSettings({ paragraphMode: val })}
              trackColor={{
                false: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                true: colors.accent,
              }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Toggle paragraph mode"
            />
          </View>
        </View>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginHorizontal: 8,
    paddingHorizontal: 24,
    paddingBottom: 20,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
    fontSize: 18,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
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
    fontSize: 16,
    minWidth: 28,
    textAlign: 'center',
  },
  disabledControl: {
    opacity: 0.35,
  },

  // Segmented controls
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
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
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  translationLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
    letterSpacing: 0.5,
  },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
});
