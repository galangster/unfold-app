import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Alert, Modal, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { XIcon } from '@/components/icons';
import { SeriesBookCover, type SeriesBookCoverProps } from './SeriesBookCover';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { shareBookCover } from '@/lib/share-book-cover';
import { mmkvStorage } from '@/lib/mmkv-storage';

type Book = SeriesBookCoverProps['devotional'];
const BACKGROUND_GAP = 22;
const CONTENT_BOTTOM_PADDING = 20;
const BACKGROUND_KEY = 'unfold.book-share-background.v1';
const BACKGROUNDS = [
  { id: 'parchment', name: 'Parchment', colors: ['#FBF7EF', '#F1E4D0', '#D7C1A0'] },
  { id: 'sage', name: 'Sage', colors: ['#EEF3EA', '#CAD7C8', '#91A99A'] },
  { id: 'rose', name: 'Rose', colors: ['#FBF0E8', '#E8C8BD', '#B98888'] },
  { id: 'mist', name: 'Mist', colors: ['#EEF3F8', '#CFDCE7', '#91ABC3'] },
  { id: 'dusk', name: 'Dusk', colors: ['#F1EBF5', '#D5C6E1', '#9D8DAF'] },
  { id: 'midnight', name: 'Midnight', colors: ['#617487', '#344457', '#142233'] },
] as const;
type Background = typeof BACKGROUNDS[number];

function BackgroundGradient({ background }: { background: Background }) {
  return <LinearGradient colors={background.colors} locations={[0, 0.5, 1]} start={{ x: 0.05, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />;
}

/** Fixed editorial proportions keep the exported artwork independent of device text size. */
function CoverPortrait({ book, width, background, onTextureLoad }: { book: Book; width: number; background: Background; onTextureLoad: () => void }) {
  const bookWidth = width * 0.74;
  const bookHeight = bookWidth * 1.4;
  return <View pointerEvents="none" style={{ width, height: width * 1.25, backgroundColor: background.colors[1], overflow: 'hidden' }}>
    <BackgroundGradient background={background} />
    <View style={{ position: 'absolute', top: (width * 1.25 - bookHeight) / 2, left: (width - bookWidth) / 2 }}>
      <SeriesBookCover devotional={book} width={bookWidth} height={bookHeight} allowFontScaling={false} onTextureLoad={onTextureLoad} />
    </View>
  </View>;
}

export function SeriesBookShareSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const { reducedMotion } = useAccessibleAnimation();
  const { fontScale } = useWindowDimensions();
  const busy = useRef(false);
  const [background, setBackground] = useState<Background>(() => {
    const saved = mmkvStorage.getItem(BACKGROUND_KEY);
    return BACKGROUNDS.find(option => option.id === saved) ?? BACKGROUNDS[0];
  });
  const changeBackground = (next: Background) => {
    if (busy.current) return;
    setBackground(next);
    mmkvStorage.setItem(BACKGROUND_KEY, next.id);
  };
  return <Modal visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!busy.current) onClose(); }}>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ShareContent key={fontScale} book={book} onClose={onClose} busy={busy} background={background} onBackgroundChange={changeBackground} />
    </SafeAreaProvider>
  </Modal>;
}

function ShareContent({ book, onClose, busy, background, onBackgroundChange }: { book: Book; onClose: () => void; busy: RefObject<boolean>; background: Background; onBackgroundChange: (background: Background) => void }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [backgroundPickerHeight, setBackgroundPickerHeight] = useState(0);
  const contentWidth = Math.min(width - 48, 400);
  const artworkHeight = viewportHeight - backgroundPickerHeight - BACKGROUND_GAP - CONTENT_BOTTOM_PADDING;
  const previewWidth = Math.min(contentWidth, Math.max(180, artworkHeight / 1.25));
  const canvas = useRef<View>(null);
  const captureReady = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [textureLoaded, setTextureLoaded] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    captureReady.current = false;
    setReady(false);
    if (!textureLoaded || !laidOut) return;
    // Allow native text fitting and the image to paint after layout completes.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { captureReady.current = true; setReady(true); }); });
    return () => cancelAnimationFrame(frame);
  }, [textureLoaded, laidOut, previewWidth, background.id]);

  const share = async () => {
    if (busy.current || !captureReady.current || !canvas.current) return;
    busy.current = true;
    setSharing(true);
    try {
      // iOS view-shot sizes are points. Android sizes are output pixels.
      const scale = Platform.OS === 'ios' ? PixelRatio.get() : 1;
      const result = await shareBookCover(book.title, () => captureRef(canvas, {
        format: 'png', result: 'tmpfile', width: 1080 / scale, height: 1350 / scale,
      }));
      if (result === 'unavailable') Alert.alert('Sharing is unavailable', 'This device cannot open the share sheet.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!/cancel|dismiss/i.test(message)) Alert.alert('Could not share this cover', 'Please try again.');
    } finally {
      busy.current = false;
      setSharing(false);
    }
  };

  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Share your book</Text>
        <Pressable onPress={onClose} disabled={sharing} accessibilityRole="button" accessibilityLabel="Close share preview" accessibilityState={{ disabled: sharing }} style={[styles.close, { opacity: sharing ? 0.4 : 1 }]}><XIcon size={23} color={colors.textMuted} /></Pressable>
      </View>
      <ScrollView style={styles.viewport} onLayout={event => setViewportHeight(event.nativeEvent.layout.height)} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View accessible style={styles.artwork} accessibilityRole="image" accessibilityLabel={`Share image: ${book.title}. Book cover on a ${background.name.toLowerCase()} gradient.`}>
          <View ref={canvas} cssInterop={false} collapsable={false} onLayout={() => setLaidOut(true)} style={{ width: previewWidth, height: previewWidth * 1.25 }}>
            <CoverPortrait book={book} width={previewWidth} background={background} onTextureLoad={() => setTextureLoaded(true)} />
          </View>
        </View>
        <View onLayout={event => setBackgroundPickerHeight(event.nativeEvent.layout.height)} style={[styles.backgroundPicker, { width: contentWidth }]}>
          <View style={styles.backgroundLabel}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Background</Text>
            <Text style={[styles.label, { color: colors.text }]}>{background.name}</Text>
          </View>
          <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Background">
            {BACKGROUNDS.map(option => <Pressable key={option.id} cssInterop={false} disabled={sharing} accessibilityRole="radio" accessibilityLabel={`${option.name} background`} accessibilityState={{ selected: option.id === background.id, disabled: sharing }} onPress={() => {
              if (busy.current || option.id === background.id) return;
              captureReady.current = false;
              setReady(false);
              onBackgroundChange(option);
            }} style={({ pressed }) => [styles.swatchTarget, { transform: [{ scale: pressed ? 0.96 : 1 }], opacity: sharing ? 0.5 : 1 }]}>
              <View style={[styles.swatchRing, { borderColor: option.id === background.id ? colors.text : 'transparent' }]}>
                <View style={styles.swatch}><BackgroundGradient background={option} /></View>
              </View>
            </Pressable>)}
          </View>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable cssInterop={false} onPress={() => { void share(); }} disabled={!ready || sharing} accessibilityRole="button" accessibilityLabel={!ready || sharing ? 'Preparing cover' : 'Share image'} accessibilityState={{ disabled: !ready || sharing, busy: sharing }} testID="share-book-image" style={({ pressed }) => [styles.share, { backgroundColor: colors.accent, opacity: !ready || sharing ? 0.55 : pressed ? 0.8 : 1 }]}>
          {sharing || !ready ? <ActivityIndicator size="small" color="#17150F" /> : <ExportIcon size={21} color="#17150F" />}
          <Text style={styles.shareText}>{sharing || !ready ? 'Preparing cover…' : 'Share image'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 12, paddingTop: 8, paddingBottom: 16 },
  title: { fontFamily: FontFamily.display, fontSize: 30, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewport: { flex: 1 },
  artwork: { flexShrink: 0 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingBottom: CONTENT_BOTTOM_PADDING },
  backgroundPicker: { flexShrink: 0, marginTop: BACKGROUND_GAP },
  backgroundLabel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12, rowGap: 4, marginBottom: 10 },
  label: { fontFamily: FontFamily.ui, fontSize: 13 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  swatchTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatchRing: { width: 42, height: 42, padding: 3, borderRadius: 21, borderWidth: 1.5 },
  swatch: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  footer: { flexShrink: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, alignItems: 'center' },
  share: { width: '100%', maxWidth: 400, minHeight: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14 },
  shareText: { fontFamily: FontFamily.uiMedium, fontSize: 16, color: '#17150F' },
});
