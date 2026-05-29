import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { XIcon, LockIcon, CrownIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { logger } from '@/lib/logger';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const WALLPAPER_ASPECT = 19.5 / 9;

interface WallpaperStyle {
  id: string;
  name: string;
  premium: boolean;
  bg: string;
  textColor: string;
  subtleColor: string;
  accentColor: string;
  quoteFont: string;
  quoteFontSize: number;
}

function getWallpaperStyles(isDark: boolean): WallpaperStyle[] {
  return [
    isDark
      ? {
          id: 'default',
          name: 'Dark',
          premium: false,
          bg: '#1A1A1A',
          textColor: 'rgba(245, 240, 235, 0.92)',
          subtleColor: 'rgba(245, 240, 235, 0.45)',
          accentColor: 'rgba(245, 240, 235, 0.25)',
          quoteFont: FontFamily.display,
          quoteFontSize: 20,
        }
      : {
          id: 'default',
          name: 'Light',
          premium: false,
          bg: '#FAFAFA',
          textColor: 'rgba(20, 20, 20, 0.9)',
          subtleColor: 'rgba(20, 20, 20, 0.4)',
          accentColor: 'rgba(20, 20, 20, 0.2)',
          quoteFont: FontFamily.display,
          quoteFontSize: 20,
        },
    {
      id: 'parchment',
      name: 'Parchment',
      premium: true,
      bg: '#F5EEE0',
      textColor: 'rgba(40, 30, 15, 0.88)',
      subtleColor: 'rgba(40, 30, 15, 0.45)',
      accentColor: 'rgba(40, 30, 15, 0.25)',
      quoteFont: FontFamily.display,
      quoteFontSize: 20,
    },
    {
      id: 'deep-ocean',
      name: 'Ocean',
      premium: true,
      bg: '#0A1628',
      textColor: 'rgba(180, 210, 240, 0.92)',
      subtleColor: 'rgba(180, 210, 240, 0.5)',
      accentColor: 'rgba(180, 210, 240, 0.3)',
      quoteFont: FontFamily.bodyItalic,
      quoteFontSize: 19,
    },
    {
      id: 'forest',
      name: 'Forest',
      premium: true,
      bg: '#0D1A0D',
      textColor: 'rgba(190, 220, 180, 0.9)',
      subtleColor: 'rgba(190, 220, 180, 0.5)',
      accentColor: 'rgba(190, 220, 180, 0.3)',
      quoteFont: FontFamily.display,
      quoteFontSize: 20,
    },
    {
      id: 'dusk',
      name: 'Dusk',
      premium: true,
      bg: '#1A0F1E',
      textColor: 'rgba(230, 200, 240, 0.9)',
      subtleColor: 'rgba(230, 200, 240, 0.5)',
      accentColor: 'rgba(230, 200, 240, 0.3)',
      quoteFont: FontFamily.bodyItalic,
      quoteFontSize: 19,
    },
    {
      id: 'clay',
      name: 'Clay',
      premium: true,
      bg: '#2C1E14',
      textColor: 'rgba(240, 215, 190, 0.9)',
      subtleColor: 'rgba(240, 215, 190, 0.5)',
      accentColor: 'rgba(240, 215, 190, 0.3)',
      quoteFont: FontFamily.display,
      quoteFontSize: 20,
    },
  ];
}

export default function WallpaperScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ quote: string; dayNumber: string; dayTitle: string }>();
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';

  const quote = params.quote ?? '';
  const dayNumber = params.dayNumber ?? '1';
  const dayTitle = params.dayTitle ?? '';

  const tabBarHeight = useBottomTabBarHeight();
  const wallpaperStyles = getWallpaperStyles(isDark);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('default');
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const wallpaperRef = useRef<View>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeStyle = wallpaperStyles.find((s) => s.id === selectedStyle) ?? wallpaperStyles[0];

  const captureWallpaper = useCallback(async (): Promise<string | null> => {
    if (!wallpaperRef.current) return null;
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      return await captureRef(wallpaperRef.current, { format: 'png', quality: 1 });
    } catch (error) {
      logger.error('Capture error:', error);
      return null;
    }
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Permission needed to save to your photo library');
        setSaving(false);
        return;
      }
      const uri = await captureWallpaper();
      if (!uri) {
        Alert.alert('Capture Failed', 'Could not capture the image. Please try again.');
        setSaving(false);
        return;
      }
      await MediaLibrary.createAssetAsync(uri);
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      logger.error('Failed to save wallpaper:', error);
      Alert.alert('Save Failed', 'Failed to save. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const uri = await captureWallpaper();
      if (!uri) {
        Alert.alert('Capture Failed', 'Could not capture the image. Please try again.');
        setSaving(false);
        return;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device');
        setSaving(false);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Unfold quote' });
    } catch (error) {
      logger.error('Failed to share wallpaper:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSelectStyle = (style: WallpaperStyle) => {
    if (style.premium && !isPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowPremiumSheet(true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedStyle(style.id);
  };

  const previewWidth = SCREEN_WIDTH - 80;
  const previewHeight = Math.min(previewWidth * WALLPAPER_ASPECT, SCREEN_HEIGHT * 0.45);
  const actualPreviewWidth = previewHeight / WALLPAPER_ASPECT;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing['4'],
            paddingVertical: Spacing['3'],
          }}
        >
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ padding: Spacing['3'] }}
            accessibilityLabel="Close wallpaper"
            accessibilityRole="button"
          >
            <XIcon size={22} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.base, color: colors.text }}>
            Share Quote
          </Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Preview */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing['8'] }}>
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
            <View
              style={{
                width: actualPreviewWidth,
                height: previewHeight,
                borderRadius: Radius['2xl'],
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                ref={wallpaperRef}
                collapsable={false}
                style={{
                  width: actualPreviewWidth,
                  height: previewHeight,
                  backgroundColor: activeStyle.bg,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: Spacing['8'],
                }}
              >
                <Text
                  style={{
                    fontFamily: activeStyle.quoteFont,
                    fontSize: activeStyle.quoteFontSize,
                    color: activeStyle.textColor,
                    textAlign: 'center',
                    lineHeight: activeStyle.quoteFontSize * 1.6,
                  }}
                >
                  {quote}
                </Text>
                <View style={{ position: 'absolute', bottom: 32, left: 16, right: 16, alignItems: 'center' }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 9,
                      color: activeStyle.subtleColor,
                      textAlign: 'center',
                    }}
                  >
                    Day {dayNumber} — {dayTitle}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 7,
                      color: activeStyle.accentColor,
                      textAlign: 'center',
                      marginTop: 5,
                      letterSpacing: 1,
                    }}
                  >
                    UNFOLD
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Style Carousel */}
        <View style={{ paddingBottom: isPremium ? 100 : 140 }}>
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(100).easing(Ease.out)}>
            <FlatList
              data={wallpaperStyles}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              snapToAlignment="center"
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: Spacing['6'], gap: Spacing['3'] }}
              renderItem={({ item: style }) => {
                const isLocked = style.premium && !isPremium;
                const isActive = selectedStyle === style.id;
                return (
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => handleSelectStyle(style)}
                    style={{ alignItems: 'center', marginRight: 12 }}
                  >
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: style.bg,
                        borderWidth: isActive ? 3 : 2,
                        borderColor: isActive ? colors.accent : colors.border,
                        justifyContent: 'center',
                        alignItems: 'center',
                        shadowColor: isActive ? colors.accent : 'transparent',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isActive ? 0.3 : 0,
                        shadowRadius: 4,
                      }}
                    >
                      {isLocked && (
                        <View
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            borderRadius: 28,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <LockIcon size={18} color="rgba(255,255,255,0.9)" weight="light" />
                        </View>
                      )}
                    </View>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 11,
                        color: isActive ? colors.text : colors.textMuted,
                        marginTop: 6,
                      }}
                    >
                      {style.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              keyExtractor={(item) => item.id}
            />
          </Animated.View>

          {/* Page Indicator */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
              marginTop: Spacing['3'],
            }}
          >
            {wallpaperStyles.map((style) => (
              <View
                key={style.id}
                style={{
                  width: selectedStyle === style.id ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor:
                    selectedStyle === style.id ? colors.accent : colors.border,
                }}
              />
            ))}
          </View>
        </View>

        {/* Upgrade CTA for Free Users */}
        {!isPremium && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeInUp.duration(Duration.slow).delay(200).easing(Ease.out)}
            style={{
              position: 'absolute',
              bottom: 90 + tabBarHeight,
              left: 0,
              right: 0,
              paddingHorizontal: Spacing['6'],
              paddingVertical: Spacing['4'],
              backgroundColor: colors.background,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textMuted,
                textAlign: 'center',
                marginBottom: Spacing['3'],
              }}
            >
              Unlock all {wallpaperStyles.filter((s) => s.premium).length} premium styles
            </Text>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowPremiumSheet(true);
              }}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 14,
                borderRadius: Radius.md,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: Spacing['2'],
              }}
            >
              <CrownIcon size={16} color={colors.background} weight="light" />
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 15,
                  color: colors.background,
                }}
              >
                Upgrade to Premium
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Actions */}
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(200).easing(Ease.out)}
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            paddingBottom: Spacing['6'] + tabBarHeight,
            paddingHorizontal: Spacing['6'],
            gap: Spacing['4'],
          }}
        >
          <TouchableOpacity activeOpacity={0.7} onPress={handleSave} disabled={saving} style={{ opacity: saving && !saved ? 0.5 : 1 }} accessibilityLabel={saved ? 'Saved' : 'Save wallpaper'} accessibilityRole="button" accessibilityState={{ disabled: saving }}>
            <View
              style={{
                backgroundColor: saved ? colors.text : colors.buttonBackground,
                paddingVertical: Spacing['4'],
                paddingHorizontal: Spacing['7'],
                borderRadius: Radius.card,
                borderWidth: 1,
                borderColor: saved ? colors.text : colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 15,
                  color: saved ? colors.background : colors.text,
                }}
              >
                {saved ? 'Saved!' : 'Save'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.7} onPress={handleShare} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }} accessibilityLabel="Share wallpaper" accessibilityRole="button" accessibilityState={{ disabled: saving }}>
            <View
              style={{
                backgroundColor: colors.buttonBackground,
                paddingVertical: Spacing['4'],
                paddingHorizontal: Spacing['7'],
                borderRadius: Radius.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 15,
                  color: colors.text,
                }}
              >
                Share
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="wallpaper"
      />
    </View>
  );
}
