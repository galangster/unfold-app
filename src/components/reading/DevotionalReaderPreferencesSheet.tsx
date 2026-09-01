import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { GearSixIcon } from '@/components/icons';
import { ReaderBottomSheet } from '@/components/reader/ReaderBottomSheet';
import { ReaderAppearanceControls } from '@/components/reader/ReaderAppearanceControls';
import { ReaderLibraryRow } from '@/components/reader/ReaderLibraryRow';
import { useReaderBrightness } from '@/hooks/useReaderBrightness';
import { useSavedHighlights } from '@/hooks/useSavedHighlights';
import { useUnfoldStore } from '@/lib/store';
import type { FontSize, ReadingFontId, ThemeMode } from '@/lib/store';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';

interface DevotionalReaderPreferencesSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenSavedContent: () => void;
  isPremium: boolean;
  onLockedFontPress: () => void;
  bottomInset?: number;
}

export function DevotionalReaderPreferencesSheet({
  visible,
  onClose,
  onOpenSavedContent,
  isPremium,
  onLockedFontPress,
  bottomInset = 84,
}: DevotionalReaderPreferencesSheetProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const themeMode = useUnfoldStore((state) => state.user?.themeMode ?? 'dark');
  const fontSize = useUnfoldStore((state) => state.user?.fontSize ?? 'medium');
  const readingFont = useUnfoldStore((state) => state.user?.readingFont ?? 'source-serif');
  const updateUser = useUnfoldStore((state) => state.updateUser);
  const savedHighlights = useSavedHighlights();
  const readerBrightness = useReaderBrightness();

  return (
    <ReaderBottomSheet
      visible={visible}
      title="Reader preferences"
      onClose={onClose}
      bottomInset={bottomInset}
      maxHeightRatio={0.68}
      testID="devotional-reader-preferences-sheet"
      accessibilityLabel="Devotional reader preferences"
    >
      <View style={styles.content}>
        <ReaderAppearanceControls
          themeMode={themeMode}
          onThemeModeChange={(mode: ThemeMode) => updateUser({ themeMode: mode })}
          brightness={readerBrightness.brightness}
          brightnessAvailable={readerBrightness.brightnessAvailable}
          onBrightnessChange={readerBrightness.setBrightness}
          onResetBrightness={readerBrightness.resetBrightness}
          fontSizeKind={fontSize}
          onFontSizeKindChange={(value: FontSize) => updateUser({ fontSize: value })}
          readingFont={readingFont}
          onReadingFontChange={(font: ReadingFontId) => updateUser({ readingFont: font })}
          isPremium={isPremium}
          onLockedFontPress={onLockedFontPress}
        />

        <ReaderLibraryRow
          label="Saved highlights & notes"
          count={savedHighlights.count.devotional}
          onPress={() => {
            onClose();
            onOpenSavedContent();
          }}
          accessibilityLabel={`Open saved devotional highlights and notes${savedHighlights.count.devotional > 0 ? `, ${savedHighlights.count.devotional} saved` : ''}`}
        />

        {/* Entry to the full Settings screen. `from: 'home'` lets
            useCrossTabBack return to the Today tab on back. */}
        <ReaderLibraryRow
          label="All settings"
          icon={<GearSixIcon size={18} color={colors.text} weight="regular" />}
          testID="reader-all-settings-row"
          onPress={() => {
            onClose();
            router.push({ pathname: '/(tabs)/(you)/settings', params: { from: 'home' } });
          }}
          accessibilityLabel="Open all settings"
        />
      </View>
    </ReaderBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing['4'],
  },
});
