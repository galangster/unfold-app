import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
  PaletteIcon,
  TextAaIcon,
  CaretDownIcon,
  LockIcon,
} from '@/components/icons';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import {
  useUnfoldStore,
  FontSize as FontSizePreference,
  ThemeMode,
  ACCENT_THEMES,
  READING_FONTS,
} from '@/lib/store';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { loadAllReadingFonts, loadReadingFont } from '@/lib/reading-fonts-loader';
import { SettingsSectionHeader, getSettingsCardStyle } from './SettingsSectionHeader';
import { shouldStackSettingsPreferenceRow } from './preference-row-layout';

const FONT_SIZES: { value: FontSizePreference; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];

// Dynamic Type caps for settings rows with trailing chip groups (RT-DYN-1/2).
// Codebase pattern: per-file *_MAX_SCALE consts + maxFontSizeMultiplier (see
// StreakBox.tsx, PremiumNudgeCard.tsx). Caps remain; adaptive rows prevent
// crowding so chip groups cannot starve labels at XXL/AX.
const SETTINGS_LABEL_MAX_SCALE = 1.4;
const SETTINGS_CHIP_MAX_SCALE = 1.2;

interface AppearanceSectionProps {
  onPremiumFeature: (feature: 'theme' | 'font') => void;
}

function PreferenceChipRow({
  label,
  stack,
  bordered,
  borderColor,
  labelColor,
  children,
}: {
  label: string;
  stack: boolean;
  bordered: boolean;
  borderColor: string;
  labelColor: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: stack ? 'column' : 'row',
        flexWrap: 'wrap',
        alignItems: stack ? 'stretch' : 'center',
        minHeight: 44,
        padding: Spacing['4'],
        borderBottomWidth: bordered ? 1 : 0,
        borderBottomColor: borderColor,
      }}
    >
      <Text
        maxFontSizeMultiplier={SETTINGS_LABEL_MAX_SCALE}
        style={{
          fontFamily: FontFamily.ui,
          fontSize: 15,
          lineHeight: 22,
          color: labelColor,
          flexGrow: 1,
          flexShrink: 0,
          marginBottom: stack ? Spacing['2'] : 0,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          flexShrink: 0,
          justifyContent: stack ? 'flex-start' : 'flex-end',
          gap: Spacing['2'],
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function AppearanceSection({ onPremiumFeature }: AppearanceSectionProps) {
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const isPremium = usePremiumAccessPolicy() === 'granted';
  const stackPreferenceRows = shouldStackSettingsPreferenceRow(width, fontScale);

  const [expandedPremium, setExpandedPremium] = useState<'colors' | 'fonts' | null>(null);

  // PERF (cold start): only the default reading family ships in the
  // splash-blocking font load. Pull the rest in as soon as this section
  // mounts — the picker is the one screen that must render every family — so
  // the previews below are in their real faces by the time the row is opened.
  useEffect(() => {
    void loadAllReadingFonts();
  }, []);

  return (
    <>
      <SettingsSectionHeader label="Preferences" />

      {/* Theme + Accent Colors + Reading Font card */}
      <View style={getSettingsCardStyle(colors)}>
        {/* Theme row */}
        <PreferenceChipRow
          label="Theme"
          stack={stackPreferenceRows}
          bordered
          borderColor={colors.border}
          labelColor={colors.text}
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = (user?.themeMode ?? 'dark') === option.value;
            return (
              <TouchableOpacity activeOpacity={0.7}
                key={option.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateUser({ themeMode: option.value });
                }}
                accessibilityRole="button"
                accessibilityLabel={`${option.label} theme`}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={{
                    backgroundColor: isSelected ? colors.text : colors.buttonBackground,
                    minHeight: 44,
                    paddingVertical: Spacing['2'],
                    paddingHorizontal: Spacing['3'],
                    borderRadius: Radius.sm,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.text : colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    size={14}
                    color={isSelected ? colors.background : colors.text}
                    weight="light"
                  />
                  <Text
                    maxFontSizeMultiplier={SETTINGS_CHIP_MAX_SCALE}
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.xs,
                      color: isSelected ? colors.background : colors.text,
                      marginLeft: Spacing['1.5'],
                    }}
                  >
                    {option.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </PreferenceChipRow>

        {/* Accent Colors - Collapsible */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => {
              if (!isPremium) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onPremiumFeature('theme');
                return;
              }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setExpandedPremium(expandedPremium === 'colors' ? null : 'colors');
            }}
            accessibilityRole="button"
            accessibilityLabel="Accent Colors"
            accessibilityState={{ expanded: expandedPremium === 'colors' }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: Spacing['4'],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2.5'] }}>
              <PaletteIcon size={18} color={colors.text} weight="light" />
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 15,
                  color: colors.text,
                }}
              >
                Accent Colors
              </Text>
              {!isPremium && (
                <LockIcon size={12} color={colors.textSubtle} weight="light" />
              )}
            </View>
            <CaretDownIcon
              size={18}
              color={colors.textMuted}
              weight="light"
              style={{
                transform: [{ rotate: expandedPremium === 'colors' ? '180deg' : '0deg' }],
              }}
            />
          </TouchableOpacity>

          {expandedPremium === 'colors' && (
            <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ paddingHorizontal: Spacing['4'], paddingBottom: Spacing['4'] }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['3'] }}>
                {ACCENT_THEMES.map((theme) => {
                  const isSelected = (user?.accentTheme ?? 'gold') === theme.id;
                  const swatchColor = isDark ? theme.dark : theme.light;
                  const isLocked = !isPremium && theme.id !== 'gold';
                  return (
                    <TouchableOpacity activeOpacity={0.7}
                      key={theme.id}
                      onPress={() => {
                        if (isLocked) {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                          onPremiumFeature('theme');
                          return;
                        }
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateUser({ accentTheme: theme.id });
                      }}
                      accessibilityLabel={isLocked ? `${theme.name} accent theme, premium only` : `${theme.name} accent theme`}
                      style={{ alignItems: 'center', width: 56 }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: swatchColor,
                          borderWidth: isSelected ? 3 : 1,
                          borderColor: isSelected ? colors.text : colors.border,
                          justifyContent: 'center',
                          alignItems: 'center',
                          opacity: isLocked ? 0.5 : 1,
                        }}
                      >
                        {isSelected && (
                          <CheckIcon size={16} color={colors.background} weight="bold" />
                        )}
                        {isLocked && !isSelected && (
                          <LockIcon size={14} color={colors.background} weight="fill" />
                        )}
                      </View>
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: 11,
                          color: isSelected ? colors.text : (isLocked ? colors.textSubtle : colors.textMuted),
                          marginTop: Spacing['1.5'],
                        }}
                      >
                        {theme.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          )}
        </View>

        {/* Reading Font - Collapsible */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setExpandedPremium(expandedPremium === 'fonts' ? null : 'fonts');
            }}
            accessibilityRole="button"
            accessibilityLabel="Reading Font"
            accessibilityState={{ expanded: expandedPremium === 'fonts' }}
            style={{
              flexDirection: stackPreferenceRows ? 'column' : 'row',
              flexWrap: 'wrap',
              alignItems: stackPreferenceRows ? 'stretch' : 'center',
              justifyContent: stackPreferenceRows ? 'flex-start' : 'space-between',
              padding: Spacing['4'],
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing['2.5'],
                flexShrink: 1,
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              <View style={{ flexShrink: 0 }}>
                <TextAaIcon size={18} color={colors.text} weight="light" />
              </View>
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 15,
                  color: colors.text,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                Reading Font
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: Spacing['2'],
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                marginTop: stackPreferenceRows ? Spacing['2'] : 0,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textMuted,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                {READING_FONTS.find(f => f.id === (user?.readingFont ?? 'source-serif'))?.name}
              </Text>
              <View style={{ flexShrink: 0 }}>
                <CaretDownIcon
                  size={18}
                  color={colors.textMuted}
                  weight="light"
                  style={{
                    transform: [{ rotate: expandedPremium === 'fonts' ? '180deg' : '0deg' }],
                  }}
                />
              </View>
            </View>
          </TouchableOpacity>

          {expandedPremium === 'fonts' && (
            <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
              {READING_FONTS.map((font, index) => {
                const isSelected = (user?.readingFont ?? 'source-serif') === font.id;
                return (
                  <TouchableOpacity activeOpacity={0.7}
                    key={font.id}
                    onPress={() => {
                      if (!isPremium) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        onPremiumFeature('font');
                        return;
                      }
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      // Belt-and-braces with the mount-time preload: guarantees
                      // the newly chosen family is requested even if the
                      // preload failed or is still in flight.
                      void loadReadingFont(font.id);
                      updateUser({ readingFont: font.id });
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 13,
                      paddingHorizontal: Spacing['4'],
                      borderBottomWidth: index < READING_FONTS.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                      backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: font.regular,
                          fontSize: 17,
                          color: colors.text,
                          marginBottom: Spacing['0.5'],
                        }}
                      >
                        {font.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: FontSize.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {font.preview}
                      </Text>
                    </View>
                    {isSelected && (
                      <CheckIcon size={18} color={colors.accent} weight="bold" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          )}
        </View>

        {/* Font size row */}
        <PreferenceChipRow
          label="Font size"
          stack={stackPreferenceRows}
          bordered={false}
          borderColor={colors.border}
          labelColor={colors.text}
        >
          {FONT_SIZES.map((size) => (
            <TouchableOpacity activeOpacity={0.7}
              key={size.value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateUser({ fontSize: size.value });
              }}
              accessibilityRole="button"
              accessibilityLabel={`${size.label} font size`}
              accessibilityState={{ selected: user?.fontSize === size.value }}
            >
              <View
                style={{
                  backgroundColor:
                    user?.fontSize === size.value
                      ? colors.text
                      : colors.buttonBackground,
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingVertical: Spacing['2'],
                  paddingHorizontal: Spacing['3.5'],
                  borderRadius: Radius.sm,
                  borderWidth: 1,
                  borderColor: user?.fontSize === size.value ? colors.text : colors.border,
                }}
              >
                <Text
                  maxFontSizeMultiplier={SETTINGS_CHIP_MAX_SCALE}
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 13,
                    lineHeight: 18,
                    color: user?.fontSize === size.value ? colors.background : colors.text,
                  }}
                >
                  {size.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </PreferenceChipRow>
      </View>
    </>
  );
}
