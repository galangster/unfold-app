import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import {
  Skia,
  useFonts as useSkiaFonts,
  Fill,
  Group,
  Rect,
  Paragraph,
  drawAsImage,
  ImageFormat,
  TextAlign,
} from '@shopify/react-native-skia';
import { XIcon, UploadSimpleIcon, DownloadSimpleIcon, LockSimpleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { logger } from '@/lib/logger';
import { canUsePremiumFeature } from '@/lib/premium-access-helpers';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Output image dimensions (9:16 Instagram Stories) ─────────────────────────
const IMG_W = 1080;
const IMG_H = 1920;

// ─── WCAG contrast helpers ────────────────────────────────────────────────────

function sRGBtoLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function shouldUseWhiteText(bgHex: string): boolean {
  const [r, g, b] = hexToRgb(bgHex);
  return relativeLuminance(r, g, b) < 0.179;
}

// ─── Preview card dimensions ──────────────────────────────────────────────────

const CARD_ASPECT = 9 / 16;
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.58, 520);
const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT;

// ─── Wallpaper themes ─────────────────────────────────────────────────────────

interface CardTheme {
  id: string;
  name: string;
  bg: string;
  premium?: boolean;
}

const CARD_THEMES: CardTheme[] = [
  { id: 'midnight', name: 'Midnight', bg: '#0A0A0A' },
  { id: 'cream', name: 'Cream', bg: '#FAF7F2' },
  { id: 'parchment', name: 'Parchment', bg: '#F5EEE0', premium: true },
  { id: 'ocean', name: 'Ocean', bg: '#0A1628', premium: true },
  { id: 'forest', name: 'Forest', bg: '#0D1A0D', premium: true },
  { id: 'dusk', name: 'Dusk', bg: '#1A0F1E', premium: true },
  { id: 'clay', name: 'Clay', bg: '#2C1E14', premium: true },
  { id: 'slate', name: 'Slate', bg: '#1C2833', premium: true },
];

// ─── Dynamic font sizing (for preview) ───────────────────────────────────────

function getPreviewFontSize(textLength: number): { fontSize: number; lineHeight: number } {
  if (textLength > 300) return { fontSize: 15, lineHeight: 24 };
  if (textLength > 200) return { fontSize: 17, lineHeight: 27 };
  if (textLength > 120) return { fontSize: 19, lineHeight: 30 };
  if (textLength > 60) return { fontSize: 22, lineHeight: 34 };
  return { fontSize: 26, lineHeight: 40 };
}

// Skia output font sizes (scaled for 1080px canvas)
function getOutputFontSize(textLength: number): number {
  if (textLength > 300) return 42;
  if (textLength > 200) return 48;
  if (textLength > 120) return 56;
  if (textLength > 60) return 64;
  return 72;
}

const MAX_TEXT_LENGTH = 400;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShareCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{
    text: string;
    reference: string;
    translation?: string;
    type?: string;
  }>();

  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = canUsePremiumFeature(premiumPolicy);

  const text = params.text ?? '';
  const reference = params.reference ?? '';
  const translation = params.translation ?? '';

  // Prevent orphaned words
  const displayText = text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH).replace(/\s+\S*$/, '') + '\u2026'
    : text.replace(/\s+(\S+)$/, '\u00A0$1');

  const { fontSize, lineHeight } = getPreviewFontSize(displayText.length);

  const [selectedTheme, setSelectedTheme] = useState(isDark ? 'midnight' : 'cream');
  const [isSharing, setIsSharing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Toggle pointer events off/on after native share sheet dismisses to
  // reconnect the touch responder chain (iOS share sheet leaves it stale).
  // Unlike key-based re-mount, this avoids re-triggering entering animations.
  const [touchActive, setTouchActive] = useState<'auto' | 'none'>('auto');

  // Load fonts for Skia paragraph rendering
  const skiaFonts = useSkiaFonts({
    'InstrumentSerif': [require('../../assets/fonts/InstrumentSerif_400Regular.ttf')],
    'Inter': [
      require('../../assets/fonts/Inter_400Regular.ttf'),
      require('../../assets/fonts/Inter_500Medium.ttf'),
    ],
  });

  const activeTheme = CARD_THEMES.find((t) => t.id === selectedTheme) ?? CARD_THEMES[0];
  const useWhite = shouldUseWhiteText(activeTheme.bg);
  const textColor = useWhite ? 'rgba(245, 240, 235, 0.92)' : 'rgba(28, 23, 16, 0.88)';
  const subtleColor = useWhite ? 'rgba(245, 240, 235, 0.35)' : 'rgba(28, 23, 16, 0.35)';
  const dividerColor = useWhite ? 'rgba(245, 240, 235, 0.08)' : 'rgba(28, 23, 16, 0.06)';

  // ─── Skia offscreen image generation ──────────────────────────────────────
  const generateImage = useCallback(async (): Promise<string | null> => {
    if (!skiaFonts) {
      logger.log('[ShareCard] Skia fonts not loaded yet');
      return null;
    }

    try {
      const theme = CARD_THEMES.find((t) => t.id === selectedTheme) ?? CARD_THEMES[0];
      const white = shouldUseWhiteText(theme.bg);
      const mainColor = white
        ? Skia.Color('rgba(245, 240, 235, 0.92)')
        : Skia.Color('rgba(28, 23, 16, 0.88)');
      const refColor = white
        ? Skia.Color('rgba(245, 240, 235, 0.35)')
        : Skia.Color('rgba(28, 23, 16, 0.35)');
      const divColor = white
        ? Skia.Color('rgba(245, 240, 235, 0.08)')
        : Skia.Color('rgba(28, 23, 16, 0.06)');

      const outFontSize = getOutputFontSize(displayText.length);

      // Build verse paragraph
      const verseParagraphStyle = {
        textAlign: TextAlign.Left,
        textStyle: {
          color: mainColor,
          fontFamilies: ['InstrumentSerif'],
          fontSize: outFontSize,
          heightMultiplier: 1.55,
        },
      };
      const verseParagraph = Skia.ParagraphBuilder.Make(verseParagraphStyle, skiaFonts)
        .addText(displayText)
        .build();
      verseParagraph.layout(IMG_W - 160); // padding 80px each side

      // Build reference paragraph
      const refParagraphStyle = {
        textAlign: TextAlign.Left,
        textStyle: {
          color: refColor,
          fontFamilies: ['Inter'],
          fontSize: 24,
          letterSpacing: 0.8,
        },
      };
      const refBuilder = Skia.ParagraphBuilder.Make(refParagraphStyle, skiaFonts);
      if (reference) refBuilder.addText(reference);
      if (reference && translation) refBuilder.addText(`  ·  ${translation}`);
      else if (translation) refBuilder.addText(translation);
      const refParagraph = refBuilder.build();
      refParagraph.layout(IMG_W - 160);

      // Build branding paragraph
      const brandParagraphStyle = {
        textAlign: TextAlign.Left,
        textStyle: {
          color: refColor,
          fontFamilies: ['Inter'],
          fontSize: 18,
          letterSpacing: 5,
        },
      };
      const brandParagraph = Skia.ParagraphBuilder.Make(brandParagraphStyle, skiaFonts)
        .addText('UNFOLD')
        .build();
      brandParagraph.layout(IMG_W - 160);

      // Calculate verse height and center vertically
      const verseH = verseParagraph.getHeight();
      // Layout: verse centered in top 70%, ref + brand in bottom area
      const contentTop = (IMG_H * 0.5) - (verseH / 2) - 40;
      const refY = contentTop + verseH + 60;
      const brandY = IMG_H - 100;
      const divY = refY - 30;

      // Draw using Skia React elements via drawAsImage
      const element = (
        <Group>
          <Fill color={Skia.Color(theme.bg)} />
          {/* Verse text */}
          <Paragraph paragraph={verseParagraph} x={80} y={Math.max(200, contentTop)} width={IMG_W - 160} />
          {/* Divider line */}
          <Rect x={(IMG_W - 80) / 2} y={divY} width={80} height={1} color={divColor} />
          {/* Reference */}
          <Paragraph paragraph={refParagraph} x={80} y={refY} width={IMG_W - 160} />
          {/* Brand */}
          <Paragraph paragraph={brandParagraph} x={80} y={brandY} width={IMG_W - 160} />
        </Group>
      );

      const image = await drawAsImage(element, { width: IMG_W, height: IMG_H });
      if (!image) {
        logger.error('[ShareCard] drawAsImage returned null');
        return null;
      }

      // Export to base64 PNG
      const base64 = image.encodeToBase64(ImageFormat.PNG, 100);
      if (!base64) {
        logger.error('[ShareCard] encodeToBase64 returned null');
        return null;
      }

      // Write to temp file
      const path = `${cacheDirectory}share-card-${Date.now()}.png`;
      await writeAsStringAsync(path, base64, {
        encoding: EncodingType.Base64,
      });

      logger.log('[ShareCard] Generated image:', path);
      return path;
    } catch (err) {
      logger.error('[ShareCard] Generation failed:', err);
      return null;
    }
  }, [skiaFonts, selectedTheme, displayText, reference, translation]);

  const handleShare = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const uri = await generateImage();
      if (!uri) {
        Alert.alert('Error', 'Could not generate the image. Please try again.');
        setIsSharing(false);
        return;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        setIsSharing(false);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: reference || 'Share Quote',
        UTI: 'public.png',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('cancel') && !msg.includes('dismiss')) {
        Alert.alert('Error', 'Could not share the image. Please try again.');
      }
    } finally {
      setIsSharing(false);
      // iOS share sheet leaves RN touch handlers stale — toggle pointer events
      // off then on to force the native touch system to re-register handlers
      setTouchActive('none');
      setTimeout(() => setTouchActive('auto'), 50);
    }
  }, [isSharing, generateImage, reference]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Permission needed to save to your photo library');
        setIsSaving(false);
        return;
      }
      const uri = await generateImage();
      if (!uri) {
        Alert.alert('Error', 'Could not generate the image. Please try again.');
        setIsSaving(false);
        return;
      }
      await MediaLibrary.createAssetAsync(uri);
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, generateImage]);

  const isBusy = isSharing || isSaving;

  return (
    <View pointerEvents={touchActive} style={[s.container, { backgroundColor: 'rgba(0, 0, 0, 0.94)' }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => router.dismiss()}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={s.closeButton}
          accessibilityLabel="Close share card"
          accessibilityRole="button"
        >
          <XIcon size={22} color="rgba(255,255,255,0.7)" weight="light" />
        </TouchableOpacity>
      </View>

      {/* Card Preview (RN views — just for display, NOT captured) */}
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)} style={s.cardWrapper}>
        <View style={[s.card, { backgroundColor: activeTheme.bg }]}>
          {/* Verse / quote text */}
          <View style={s.textContainer}>
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize,
                lineHeight,
                color: textColor,
                textAlign: 'left',
              }}
            >
              {displayText}
            </Text>
          </View>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: dividerColor, alignSelf: 'flex-start' }]} />

          {/* Reference */}
          <View style={[s.refContainer, { alignItems: 'flex-start' }]}>
            {reference ? (
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 11,
                  color: subtleColor,
                  letterSpacing: 0.3,
                  textAlign: 'left',
                }}
              >
                {reference}
              </Text>
            ) : null}
            {translation ? (
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 9,
                  color: subtleColor,
                  letterSpacing: 0.8,
                  marginTop: 4,
                  textAlign: 'left',
                  opacity: 0.7,
                }}
              >
                {translation}
              </Text>
            ) : null}
          </View>

          {/* Unfold logo */}
          <View style={[s.brandRow, { alignItems: 'flex-start' }]}>
            <Image
              source={require('@/app/icon-paywall-light.png')}
              style={[s.brandIcon, { tintColor: subtleColor, width: 14, height: 14 }]}
              resizeMode="contain"
            />
          </View>
        </View>
      </Animated.View>

      {/* Theme carousel */}
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).delay(100).easing(Ease.out)} style={s.carouselWrapper}>
        <FlatList
          data={CARD_THEMES}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.carouselContent}
          renderItem={({ item }) => {
            const isActive = selectedTheme === item.id;
            const isLocked = item.premium && !isPremium;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  if (isLocked) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    router.push('/paywall');
                    return;
                  }
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTheme(item.id);
                }}
                style={s.themeItem}
              >
                <View
                  style={[
                    s.themeSwatch,
                    {
                      backgroundColor: item.bg,
                      borderColor: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
                      borderWidth: isActive ? 2.5 : 1,
                      opacity: isLocked ? 0.5 : 1,
                    },
                  ]}
                >
                  {isLocked && (
                    <View style={s.lockBadge}>
                      <LockSimpleIcon size={12} color="#ffffff" weight="fill" />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    s.themeLabel,
                    { color: isActive ? '#FFFFFF' : isLocked ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.4)' },
                  ]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
          keyExtractor={(item) => item.id}
        />
      </Animated.View>

      {/* Action buttons */}
      <Animated.View
        entering={reducedMotion ? undefined : FadeInUp.duration(Duration.slow).delay(200).easing(Ease.out)}
        style={[s.actionsWrapper, { paddingBottom: insets.bottom + 16 }]}
      >
        <View style={s.actionsRow}>
          {/* Save */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSave}
            disabled={isBusy}
            accessibilityLabel={saved ? 'Saved' : 'Save image'}
            accessibilityRole="button"
            style={[s.actionButton, s.saveButton, { opacity: isBusy && !saved ? 0.6 : 1 }]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <DownloadSimpleIcon size={17} color="#ffffff" weight="light" />
                <Text style={s.actionText}>{saved ? 'Saved!' : 'Save'}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleShare}
            disabled={isBusy}
            accessibilityLabel="Share image"
            accessibilityRole="button"
            style={[s.actionButton, s.shareButton, { opacity: isBusy ? 0.6 : 1 }]}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <UploadSimpleIcon size={17} color="#ffffff" weight="light" />
                <Text style={s.actionText}>Share</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing['5'],
    paddingBottom: 4,
  },
  closeButton: {
    padding: Spacing['3'],
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingHorizontal: Spacing['7'],
    paddingTop: 48,
    paddingBottom: Spacing['7'],
    justifyContent: 'space-between',
    // Subtle border so dark themes don't disappear into the backdrop
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    width: 48,
    alignSelf: 'center',
    marginVertical: Spacing['4'],
  },
  refContainer: {
    alignItems: 'center',
  },
  brandRow: {
    alignItems: 'center',
    marginTop: 18,
  },
  brandIcon: {
    width: 18,
    height: 18,
    opacity: 0.4,
  },
  carouselWrapper: {
    paddingTop: Spacing['5'],
    paddingBottom: Spacing['4'],
  },
  carouselContent: {
    paddingHorizontal: Spacing['6'],
    gap: Spacing['4'],
  },
  themeItem: {
    alignItems: 'center',
    gap: 6,
  },
  themeSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  lockBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  themeLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  actionsWrapper: {
    paddingHorizontal: Spacing['6'],
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing['3'],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    paddingVertical: 15,
    paddingHorizontal: Spacing['7'],
    borderRadius: Radius.card,
  },
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
  shareButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
  },
  actionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    color: '#ffffff',
  },
});
