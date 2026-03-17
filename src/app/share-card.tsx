import { useState, useCallback, useEffect, useRef } from 'react';
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
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import {
  Skia,
  useFonts as useSkiaFonts,
  Fill,
  Group,
  RoundedRect,
  Rect,
  Paragraph,
  drawAsImage,
  ImageFormat,
  TextAlign,
} from '@shopify/react-native-skia';
import { XIcon, UploadSimpleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { logger } from '@/lib/logger';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
}

const CARD_THEMES: CardTheme[] = [
  { id: 'midnight', name: 'Midnight', bg: '#0A0A0A' },
  { id: 'cream', name: 'Cream', bg: '#FAF7F2' },
  { id: 'parchment', name: 'Parchment', bg: '#F5EEE0' },
  { id: 'ocean', name: 'Ocean', bg: '#0A1628' },
  { id: 'forest', name: 'Forest', bg: '#0D1A0D' },
  { id: 'dusk', name: 'Dusk', bg: '#1A0F1E' },
  { id: 'clay', name: 'Clay', bg: '#2C1E14' },
  { id: 'slate', name: 'Slate', bg: '#1C2833' },
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
  const params = useLocalSearchParams<{
    text: string;
    reference: string;
    translation?: string;
    type?: string;
  }>();

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
        textAlign: TextAlign.Center,
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
        textAlign: TextAlign.Center,
        textStyle: {
          color: refColor,
          fontFamilies: ['Inter'],
          fontSize: 28,
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
        textAlign: TextAlign.Center,
        textStyle: {
          color: refColor,
          fontFamilies: ['Inter'],
          fontSize: 22,
          letterSpacing: 5,
        },
      };
      const brandParagraph = Skia.ParagraphBuilder.Make(brandParagraphStyle, skiaFonts)
        .addText('UNFOLD')
        .build();
      brandParagraph.layout(IMG_W - 160);

      // Calculate verse height and center vertically
      const verseH = verseParagraph.getHeight();
      const refH = refParagraph.getHeight();
      const brandH = brandParagraph.getHeight();

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
    }
  }, [isSharing, generateImage, reference]);

  return (
    <View style={[s.container, { backgroundColor: 'rgba(0, 0, 0, 0.94)' }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={s.closeButton}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <XIcon size={22} color="rgba(255,255,255,0.7)" weight="light" />
        </TouchableOpacity>
      </View>

      {/* Card Preview (RN views — just for display, NOT captured) */}
      <Animated.View entering={FadeIn.duration(350)} style={s.cardWrapper}>
        <View style={[s.card, { backgroundColor: activeTheme.bg }]}>
          {/* Verse / quote text */}
          <View style={s.textContainer}>
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize,
                lineHeight,
                color: textColor,
                textAlign: 'center',
              }}
            >
              {displayText}
            </Text>
          </View>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: dividerColor }]} />

          {/* Reference */}
          <View style={s.refContainer}>
            {reference ? (
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 11,
                  color: subtleColor,
                  letterSpacing: 0.4,
                  textAlign: 'center',
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
                  marginTop: 3,
                  textAlign: 'center',
                  opacity: 0.7,
                }}
              >
                {translation}
              </Text>
            ) : null}
          </View>

          {/* Unfold logo */}
          <View style={s.brandRow}>
            <Image
              source={require('@/app/icon-paywall-light.png')}
              style={[s.brandIcon, { tintColor: subtleColor }]}
              resizeMode="contain"
            />
          </View>
        </View>
      </Animated.View>

      {/* Theme carousel */}
      <Animated.View entering={FadeIn.duration(350).delay(100)} style={s.carouselWrapper}>
        <FlatList
          data={CARD_THEMES}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.carouselContent}
          renderItem={({ item }) => {
            const isActive = selectedTheme === item.id;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
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
                    },
                  ]}
                />
                <Text
                  style={[
                    s.themeLabel,
                    { color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.4)' },
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
        entering={FadeInUp.duration(300).delay(200)}
        style={[s.actionsWrapper, { paddingBottom: insets.bottom + 16 }]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleShare}
          disabled={isSharing}
          accessibilityLabel="Share image"
          accessibilityRole="button"
          style={[s.actionButton, s.shareButton, { opacity: isSharing ? 0.6 : 1, alignSelf: 'center', minWidth: 160 }]}
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
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  closeButton: {
    padding: 12,
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 26,
    paddingTop: 44,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: 36,
    alignSelf: 'center',
    marginVertical: 14,
  },
  refContainer: {
    alignItems: 'center',
  },
  brandRow: {
    alignItems: 'center',
    marginTop: 16,
  },
  brandIcon: {
    width: 16,
    height: 16,
    opacity: 0.5,
  },
  carouselWrapper: {
    paddingVertical: 16,
  },
  carouselContent: {
    paddingHorizontal: 24,
    gap: 16,
  },
  themeItem: {
    alignItems: 'center',
    gap: 6,
  },
  themeSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  themeLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  actionsWrapper: {
    paddingHorizontal: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 14,
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
