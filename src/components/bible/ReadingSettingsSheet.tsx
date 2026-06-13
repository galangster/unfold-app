import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { ReaderBottomSheet } from '@/components/reader/ReaderBottomSheet';
import { ReaderAppearanceControls } from '@/components/reader/ReaderAppearanceControls';
import { ReaderLibraryRow } from '@/components/reader/ReaderLibraryRow';
import { useReaderBrightness } from '@/hooks/useReaderBrightness';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import type { BibleReaderSettings, ReadingFontId, ThemeMode } from '@/lib/store';

interface ReadingSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  tabBarHeight: number;
  onOpenSavedVerses?: () => void;
  savedVersesCount?: number;
  isPremium?: boolean;
  onLockedFontPress?: () => void;
}

const LINE_HEIGHT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Compact', value: 1.8 },
  { label: 'Comfortable', value: 2.1 },
  { label: 'Relaxed', value: 2.5 },
];

const TRANSLATION_OPTIONS: Array<BibleReaderSettings['translation']> = ['BSB', 'KJV'];

export function ReadingSettingsSheet({
  visible,
  onClose,
  onOpenSavedVerses,
  savedVersesCount,
  isPremium = true,
  onLockedFontPress = () => {},
}: ReadingSettingsSheetProps) {
  const { colors, isDark } = useTheme();
  const settings = useUnfoldStore((state) => state.bibleReaderSettings);
  const themeMode = useUnfoldStore((state) => state.user?.themeMode ?? 'dark');
  const readingFont = useUnfoldStore((state) => state.user?.readingFont ?? 'source-serif');
  const updateSettings = useUnfoldStore((state) => state.updateBibleReaderSettings);
  const updateUser = useUnfoldStore((state) => state.updateUser);
  const readerBrightness = useReaderBrightness();

  const blockBackground = isDark ? 'rgba(245, 240, 235, 0.055)' : 'rgba(28, 23, 16, 0.045)';
  const selectedBackground = isDark ? 'rgba(245, 240, 235, 0.16)' : 'rgba(28, 23, 16, 0.10)';

  return (
    <ReaderBottomSheet
      visible={visible}
      title="Reader preferences"
      onClose={onClose}
      bottomInset={0}
      maxHeightRatio={0.72}
      testID="bible-reader-preferences-sheet"
      accessibilityLabel="Bible reader preferences"
    >
      <View style={styles.content}>
        <ReaderAppearanceControls
          themeMode={themeMode}
          onThemeModeChange={(mode: ThemeMode) => updateUser({ themeMode: mode })}
          brightness={readerBrightness.brightness}
          brightnessAvailable={readerBrightness.brightnessAvailable}
          onBrightnessChange={readerBrightness.setBrightness}
          onResetBrightness={readerBrightness.resetBrightness}
          bibleFontSize={settings.fontSize}
          onBibleFontSizeChange={(fontSize) => updateSettings({ fontSize })}
          readingFont={readingFont}
          onReadingFontChange={(font: ReadingFontId) => updateUser({ readingFont: font })}
          isPremium={isPremium}
          onLockedFontPress={onLockedFontPress}
        />

        <View style={[styles.bibleBlock, { backgroundColor: blockBackground, borderColor: colors.border }]}>
          <Text style={[styles.groupTitle, { color: colors.text }]}>Bible</Text>

          <View style={styles.controlGroup}>
            <Text style={[styles.label, { color: colors.textSubtle }]}>Line height</Text>
            <View style={styles.segmentRow}>
              {LINE_HEIGHT_OPTIONS.map((option) => {
                const selected = settings.lineHeightMultiplier === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.segmentButton,
                      {
                        backgroundColor: selected ? selectedBackground : 'transparent',
                        borderColor: selected ? colors.borderStrong : colors.border,
                      },
                    ]}
                    activeOpacity={0.72}
                    onPress={() => updateSettings({ lineHeightMultiplier: option.value })}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.label} line height`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.segmentText, { color: selected ? colors.text : colors.textMuted }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.controlGroup}>
            <Text style={[styles.label, { color: colors.textSubtle }]}>Translation</Text>
            <View style={styles.segmentRowCompact}>
              {TRANSLATION_OPTIONS.map((translation) => {
                const selected = settings.translation === translation;
                return (
                  <TouchableOpacity
                    key={translation}
                    style={[
                      styles.translationButton,
                      {
                        backgroundColor: selected ? selectedBackground : 'transparent',
                        borderColor: selected ? colors.borderStrong : colors.border,
                      },
                    ]}
                    activeOpacity={0.72}
                    onPress={() => updateSettings({ translation })}
                    accessibilityRole="button"
                    accessibilityLabel={`${translation} translation`}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.translationText, { color: selected ? colors.text : colors.textMuted }]}>
                      {translation}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {onOpenSavedVerses ? (
          <ReaderLibraryRow
            label="Saved Bible highlights"
            count={savedVersesCount}
            onPress={onOpenSavedVerses}
            accessibilityLabel={`Open saved Bible highlights${savedVersesCount != null && savedVersesCount > 0 ? `, ${savedVersesCount} saved` : ''}`}
          />
        ) : null}
      </View>
    </ReaderBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing['4'],
  },
  bibleBlock: {
    gap: Spacing['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing['3.5'],
  },
  groupTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
  },
  controlGroup: {
    gap: Spacing['3'],
  },
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  segmentRowCompact: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  segmentButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing['2'],
  },
  segmentText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  translationButton: {
    minHeight: 44,
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing['4'],
  },
  translationText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
    letterSpacing: 0.2,
  },
});
