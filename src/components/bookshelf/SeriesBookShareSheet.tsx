import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Alert, Modal, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { XIcon } from '@/components/icons';
import { SeriesBookCover, type SeriesBookCoverProps } from './SeriesBookCover';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { shareBookCover } from '@/lib/share-book-cover';

type Book = SeriesBookCoverProps['devotional'];

/** Fixed editorial proportions keep the exported artwork independent of device text size. */
function CoverPortrait({ book, width, onTextureLoad }: { book: Book; width: number; onTextureLoad: () => void }) {
  const bookWidth = width * 0.72;
  const bookHeight = bookWidth * 1.4;
  return <View pointerEvents="none" style={{ width, height: width * 1.25, backgroundColor: '#F3EBDC', overflow: 'hidden' }}>
    <LinearGradient colors={['#FBF6EB', '#E9DCC5', '#F7F0E4']} locations={[0, 0.8, 1]} style={StyleSheet.absoluteFill} />
    <View style={{ position: 'absolute', top: width * 0.068, left: (width - bookWidth) / 2 }}>
      <SeriesBookCover devotional={book} width={bookWidth} height={bookHeight} allowFontScaling={false} onTextureLoad={onTextureLoad} />
    </View>
    <View style={{ position: 'absolute', top: width * 0.068 + bookHeight, height: width * 0.07, left: 0, right: 0 }}>
      <LinearGradient colors={['#AC8A4F38', '#F7F0E400']} style={StyleSheet.absoluteFill} />
      <View style={{ height: 0.5, backgroundColor: '#AA8C5355' }} />
    </View>
    <Text allowFontScaling={false} style={{ position: 'absolute', bottom: width * 0.058, width: '100%', textAlign: 'center', color: '#76664D', fontFamily: FontFamily.ui, fontSize: width * 0.027, letterSpacing: width * 0.001 }}>From my Unfold library</Text>
  </View>;
}

export function SeriesBookShareSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const { reducedMotion } = useAccessibleAnimation();
  const { fontScale } = useWindowDimensions();
  const busy = useRef(false);
  return <Modal visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!busy.current) onClose(); }}>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ShareContent key={fontScale} book={book} onClose={onClose} busy={busy} />
    </SafeAreaProvider>
  </Modal>;
}

function ShareContent({ book, onClose, busy }: { book: Book; onClose: () => void; busy: RefObject<boolean> }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const previewWidth = Math.max(180, Math.min(width - 48, 400, (height - insets.top - insets.bottom - 230) / 1.25));
  const canvas = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [textureLoaded, setTextureLoaded] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!textureLoaded || !laidOut) return;
    // Allow native text fitting and the image to paint after layout completes.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setReady(true)); });
    return () => cancelAnimationFrame(frame);
  }, [textureLoaded, laidOut, previewWidth]);

  const share = async () => {
    if (busy.current || !ready || !canvas.current) return;
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View accessible accessibilityRole="image" accessibilityLabel={`Share image: ${book.title}. Book cover, begun date, and Unfold imprint.`}>
          <View ref={canvas} cssInterop={false} collapsable={false} onLayout={() => setLaidOut(true)} style={{ width: previewWidth, height: previewWidth * 1.25 }}>
            <CoverPortrait book={book} width={previewWidth} onTextureLoad={() => setTextureLoaded(true)} />
          </View>
        </View>
        <Text style={[styles.description, { color: colors.textMuted }]}>A book worth keeping. A cover worth sharing.</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 12, paddingTop: 8, paddingBottom: 16 },
  title: { fontFamily: FontFamily.display, fontSize: 30, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20 },
  description: { fontFamily: FontFamily.ui, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 22, maxWidth: 280 },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, alignItems: 'center' },
  share: { width: '100%', maxWidth: 400, minHeight: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14 },
  shareText: { fontFamily: FontFamily.uiMedium, fontSize: 16, color: '#17150F' },
});
