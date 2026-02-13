import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { X, Lock, Crown } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

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
  const params = useLocalSearchParams<{ quote: string; dayNumber: string; dayTitle: string }>();
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);

  const quote = params.quote ?? '';
  const dayNumber = params.dayNumber ?? '1';
  const dayTitle = params.dayTitle ?? '';

  const wallpaperStyles = getWallpaperStyles(isDark);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('default');
  const wallpaperRef = useRef<View>(null);

  const activeStyle = wallpaperStyles.find((s) => s.id === selectedStyle) ?? wallpaperStyles[0];

  const captureWallpaper = useCallback(async (): Promise<string | null> => {
    if (!wallpaperRef.current) return null;
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      return await captureRef(wallpaperRef.current, { format: 'png', quality: 1 });
    } catch (error) {
      console.error('Capture error:', error);
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
        alert('Permission needed to save to your photo library');
        setSaving(false);
        return;
      }
      const uri = await captureWallpaper();
      if (!uri) {
        alert('Could not capture the image. Please try again.');
        setSaving(false);
        return;
      }
      await MediaLibrary.createAssetAsync(uri);
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save wallpaper:', error);
      alert('Failed to save. Please try again.');
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
        alert('Could not capture the image. Please try again.');
        setSaving(false);
        return;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        alert('Sharing is not available on this device');
        setSaving(false);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Unfold quote' });
    } catch (error) {
      console.error('Failed to share wallpaper:', error);
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
      router.push('/paywall');
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
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Pressable
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 8 }}
          >
            <X size={22} color={colors.textMuted} />
          </Pressable>
          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.text }}>
            Share Quote
          </Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Preview */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.View entering={FadeIn.duration(400)}>
            <View
              style={{
                width: actualPreviewWidth,
                height: previewHeight,
                borderRadius: 24,
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
                  paddingHorizontal: 32,
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
                <View style={{ position: 'absolute', bottom: 32, alignItems: 'center' }}>
                  <Text
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
                      fontFamily: FontFamily.mono,
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
        <View style={{ paddingBottom: isPremium ? 16 : 140 }}>
          <Animated.View entering={FadeIn.duration(400).delay(100)}>
            <FlatList
              data={wallpaperStyles}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              snapToAlignment="center"
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
              renderItem={({ item: style }) => {
                const isLocked = style.premium && !isPremium;
                const isActive = selectedStyle === style.id;
                return (
                  <Pressable
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
                          <Lock size={18} color="rgba(255,255,255,0.9)" />
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
                  </Pressable>
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
              marginTop: 12,
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
            entering={FadeInUp.duration(300).delay(200)}
            style={{
              position: 'absolute',
              bottom: 90,
              left: 0,
              right: 0,
              paddingHorizontal: 24,
              paddingVertical: 16,
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
                marginBottom: 12,
              }}
            >
              Unlock all {wallpaperStyles.filter((s) => s.premium).length} premium styles
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/paywall');
              }}
              style={({ pressed }) => ({
                backgroundColor: colors.accent,
                paddingVertical: 14,
                borderRadius: 12,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Crown size={16} color={isDark ? '#000' : '#fff'} />
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 15,
                  color: isDark ? '#000' : '#fff',
                }}
              >
                Upgrade to Premium
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Actions */}
        <Animated.View
          entering={FadeIn.duration(400).delay(200)}
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            paddingBottom: 24,
            paddingHorizontal: 24,
            gap: 16,
          }}
        >
          <Pressable onPress={handleSave} disabled={saving} style={{ opacity: saving && !saved ? 0.5 : 1 }}>
            <View
              style={{
                backgroundColor: saved ? colors.text : colors.buttonBackground,
                paddingVertical: 16,
                paddingHorizontal: 28,
                borderRadius: 14,
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
          </Pressable>

          <Pressable onPress={handleShare} disabled={saving}>
            {({ pressed }) => (
              <View
                style={{
                  backgroundColor: pressed ? colors.text : colors.buttonBackground,
                  paddingVertical: 16,
                  paddingHorizontal: 28,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: pressed ? colors.text : colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 15,
                    color: pressed ? colors.background : colors.text,
                  }}
                >
                  Share
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
