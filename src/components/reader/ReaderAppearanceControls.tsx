import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import {
  LockSimpleIcon,
  MinusIcon,
  PlusIcon,
  SunDimIcon,
  TextAaIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize as TypeSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import {
  READING_FONTS,
  type FontSize,
  type ReadingFontId,
  type ThemeMode,
} from '@/lib/store';

type ThemeOption = { label: string; value: ThemeMode; accessibilityLabel: string };
type FontSizeOption = { label: string; value: FontSize; accessibilityLabel: string };

interface ReaderAppearanceControlsProps {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;

  brightness: number | null;
  brightnessAvailable: boolean;
  onBrightnessChange: (value: number) => void;
  onResetBrightness?: () => void;

  fontSizeKind?: FontSize;
  onFontSizeKindChange?: (value: FontSize) => void;

  bibleFontSize?: number;
  onBibleFontSizeChange?: (value: number) => void;

  readingFont: ReadingFontId;
  onReadingFontChange: (font: ReadingFontId) => void;
  isPremium: boolean;
  onLockedFontPress: () => void;
}

const THEME_OPTIONS: ThemeOption[] = [
  { label: 'System', value: 'system', accessibilityLabel: 'Use system theme' },
  { label: 'Light', value: 'light', accessibilityLabel: 'Use light theme' },
  { label: 'Dark', value: 'dark', accessibilityLabel: 'Use dark theme' },
];

const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { label: 'Small', value: 'small', accessibilityLabel: 'Use small text size' },
  { label: 'Medium', value: 'medium', accessibilityLabel: 'Use medium text size' },
  { label: 'Large', value: 'large', accessibilityLabel: 'Use large text size' },
];

const MIN_BIBLE_FONT_SIZE = 14;
const MAX_BIBLE_FONT_SIZE = 28;
const FREE_READING_FONT_ID: ReadingFontId = 'source-serif';

export function ReaderAppearanceControls({
  themeMode,
  onThemeModeChange,
  brightness,
  brightnessAvailable,
  onBrightnessChange,
  onResetBrightness,
  fontSizeKind,
  onFontSizeKindChange,
  bibleFontSize,
  onBibleFontSizeChange,
  readingFont,
  onReadingFontChange,
  isPremium,
  onLockedFontPress,
}: ReaderAppearanceControlsProps) {
  const { colors, isDark } = useTheme();
  const surfaceColor = isDark ? 'rgba(245, 240, 235, 0.055)' : 'rgba(28, 23, 16, 0.045)';
  const selectedColor = isDark ? 'rgba(245, 240, 235, 0.16)' : 'rgba(28, 23, 16, 0.10)';
  const disabledColor = isDark ? 'rgba(245, 240, 235, 0.035)' : 'rgba(28, 23, 16, 0.035)';
  const sliderValue = brightness ?? 0.5;

  const renderSegment = <T extends string>({
    label,
    value,
    accessibilityLabel,
    selected,
    onPress,
  }: {
    label: string;
    value: T;
    accessibilityLabel: string;
    selected: boolean;
    onPress: (value: T) => void;
  }) => (
    <TouchableOpacity
      key={value}
      style={[
        styles.segmentButton,
        { backgroundColor: selected ? selectedColor : surfaceColor, borderColor: selected ? colors.borderStrong : colors.border },
      ]}
      activeOpacity={0.72}
      onPress={() => onPress(value)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.segmentText, { color: selected ? colors.text : colors.textMuted }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.groupTitle, { color: colors.text }]}>Appearance</Text>

      <View style={[styles.block, { borderColor: colors.border, backgroundColor: surfaceColor }]}>
        <Text style={[styles.label, { color: colors.textSubtle }]}>Theme</Text>
        <View style={styles.segmentRow}>
          {THEME_OPTIONS.map((option) =>
            renderSegment({
              ...option,
              selected: themeMode === option.value,
              onPress: onThemeModeChange,
            }),
          )}
        </View>
      </View>

      <View style={[styles.block, { borderColor: colors.border, backgroundColor: surfaceColor }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionLabelRow}>
            <SunDimIcon size={17} color={colors.textMuted} weight="regular" />
            <Text style={[styles.label, { color: colors.textSubtle }]}>Brightness</Text>
          </View>
          {onResetBrightness ? (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={onResetBrightness}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Reset reader brightness to system level"
            >
              <Text style={[styles.resetText, { color: colors.accent }]}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {brightnessAvailable ? (
          <Slider
            testID="reader-brightness-slider"
            value={sliderValue}
            minimumValue={0.15}
            maximumValue={1}
            step={0.01}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.borderStrong}
            thumbTintColor={colors.text}
            onValueChange={onBrightnessChange}
            accessibilityLabel="Reader brightness"
          />
        ) : (
          <Text style={[styles.helperText, { color: colors.textMuted }]}>Brightness is not available on this device.</Text>
        )}
      </View>

      {fontSizeKind && onFontSizeKindChange ? (
        <View style={[styles.block, { borderColor: colors.border, backgroundColor: surfaceColor }]}>
          <View style={styles.sectionLabelRow}>
            <TextAaIcon size={17} color={colors.textMuted} weight="regular" />
            <Text style={[styles.label, { color: colors.textSubtle }]}>Text size</Text>
          </View>
          <View style={styles.segmentRow}>
            {FONT_SIZE_OPTIONS.map((option) =>
              renderSegment({
                ...option,
                selected: fontSizeKind === option.value,
                onPress: onFontSizeKindChange,
              }),
            )}
          </View>
        </View>
      ) : null}

      {bibleFontSize != null && onBibleFontSizeChange ? (
        <View style={[styles.block, { borderColor: colors.border, backgroundColor: surfaceColor }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionLabelRow}>
              <TextAaIcon size={17} color={colors.textMuted} weight="regular" />
              <Text style={[styles.label, { color: colors.textSubtle }]}>Text size</Text>
            </View>
            <View style={styles.bibleFontControls}>
              <TouchableOpacity
                style={[styles.roundControl, { backgroundColor: bibleFontSize <= MIN_BIBLE_FONT_SIZE ? disabledColor : selectedColor }]}
                onPress={() => onBibleFontSizeChange(Math.max(MIN_BIBLE_FONT_SIZE, bibleFontSize - 1))}
                disabled={bibleFontSize <= MIN_BIBLE_FONT_SIZE}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel="Decrease Bible text size"
                accessibilityState={{ disabled: bibleFontSize <= MIN_BIBLE_FONT_SIZE }}
              >
                <MinusIcon size={15} color={bibleFontSize <= MIN_BIBLE_FONT_SIZE ? colors.textHint : colors.text} weight="bold" />
              </TouchableOpacity>
              <Text style={[styles.bibleFontValue, { color: colors.text }]}>{bibleFontSize}</Text>
              <TouchableOpacity
                style={[styles.roundControl, { backgroundColor: bibleFontSize >= MAX_BIBLE_FONT_SIZE ? disabledColor : selectedColor }]}
                onPress={() => onBibleFontSizeChange(Math.min(MAX_BIBLE_FONT_SIZE, bibleFontSize + 1))}
                disabled={bibleFontSize >= MAX_BIBLE_FONT_SIZE}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel="Increase Bible text size"
                accessibilityState={{ disabled: bibleFontSize >= MAX_BIBLE_FONT_SIZE }}
              >
                <PlusIcon size={15} color={bibleFontSize >= MAX_BIBLE_FONT_SIZE ? colors.textHint : colors.text} weight="bold" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      <View style={[styles.block, { borderColor: colors.border, backgroundColor: surfaceColor }]}>
        <Text style={[styles.label, { color: colors.textSubtle }]}>Reading font</Text>
        <View style={styles.fontList}>
          {READING_FONTS.map((font) => {
            const selected = readingFont === font.id;
            const locked = !isPremium && font.id !== FREE_READING_FONT_ID;
            return (
              <TouchableOpacity
                key={font.id}
                style={[
                  styles.fontRow,
                  {
                    backgroundColor: selected ? selectedColor : 'transparent',
                    borderColor: selected ? colors.borderStrong : colors.border,
                  },
                ]}
                activeOpacity={0.72}
                onPress={() => {
                  if (locked) {
                    onLockedFontPress();
                    return;
                  }
                  onReadingFontChange(font.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${font.name} reading font${locked ? ', Premium locked' : ''}`}
                accessibilityState={{ selected }}
              >
                <View style={styles.fontCopy}>
                  <Text style={[styles.fontName, { color: colors.text }]}>{font.name}</Text>
                  <Text style={[styles.fontPreview, { color: colors.textMuted }]}>{font.preview}</Text>
                </View>
                {locked ? <LockSimpleIcon size={15} color={colors.textSubtle} weight="regular" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing['3'],
  },
  groupTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: TypeSize.base,
  },
  block: {
    gap: Spacing['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing['3.5'],
  },
  sectionHeaderRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing['3'],
  },
  sectionLabelRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: TypeSize.sm,
  },
  segmentRow: {
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
    fontSize: TypeSize.sm,
  },
  resetButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing['2'],
  },
  resetText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: TypeSize.sm,
  },
  helperText: {
    fontFamily: FontFamily.ui,
    fontSize: TypeSize.sm,
    lineHeight: 20,
  },
  bibleFontControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  roundControl: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bibleFontValue: {
    minWidth: 28,
    textAlign: 'center',
    fontFamily: FontFamily.uiMedium,
    fontSize: TypeSize.base,
  },
  fontList: {
    gap: Spacing['2'],
  },
  fontRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  fontCopy: {
    flex: 1,
    gap: Spacing['0.5'],
  },
  fontName: {
    fontFamily: FontFamily.uiMedium,
    fontSize: TypeSize.sm,
  },
  fontPreview: {
    fontFamily: FontFamily.ui,
    fontSize: TypeSize.xs,
  },
});
