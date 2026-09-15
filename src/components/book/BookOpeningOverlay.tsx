import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Fill, ImageShader, Shader, Skia } from '@shopify/react-native-skia';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useAnimatedReaction, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import {
  BOOK_OPENING_HANDOFF_MS,
  BOOK_OPENING_INTERIOR_FADE_MS,
  bookOpeningBackdropOpacity,
  bookOpeningExpand,
  clearBookOpening,
  failBookOverlay,
  hardcoverHingeDegrees,
  markBookOverlayPresented,
  useBookOpening,
  type BookOpeningSession,
} from '@/lib/book-opening';
import { PAGE_CURL_SHADER } from './page-curl-shader';
import { SERIES_BOOK_PAPER_FRACTION } from '@/lib/series-book-geometry';

const effect = Skia.RuntimeEffect.Make(PAGE_CURL_SHADER);

function presentAfterPaint(id: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => markBookOverlayPresented(id)));
}

function Opening({ session }: { session: BookOpeningSession }) {
  const { width, height } = useWindowDimensions();
  const { reducedMotion } = useAccessibleAnimation();
  // Paper openings only: the final curl and the backdrop reveal beneath it.
  const reveal = useSharedValue(0);
  const backgroundReveal = useSharedValue(0);
  // Hardcover only: paper capture to reader snapshot under the board, and the fallback exit fade.
  const interiorFade = useSharedValue(0);
  const handoff = useSharedValue(1);
  const [curlFinished, setCurlFinished] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canvasSize = useSharedValue({ width: 0, height: 0 });
  const color = useMemo(() => Array.from(Skia.Color(session.paperColor)), [session.paperColor]);
  const { rect, progress, id, cover, sourceHidden, backdrop } = session;
  const hasCover = cover != null;
  const readerWidth = session.readerWidth ?? rect.width;
  const uniforms = useDerivedValue(() => ({
    viewport: [width, height],
    startRect: [rect.x, rect.y, rect.width, rect.height],
    expansion: bookOpeningExpand(progress.value),
    hardcover: hasCover ? 1 : 0,
    hingeDegrees: hardcoverHingeDegrees(progress.value),
    coverBoardRight: rect.width * (1 - SERIES_BOOK_PAPER_FRACTION),
    curlProgress: hasCover ? 0 : progress.value * (0.6 + 0.4 * reveal.value),
    paperColor: color,
    backgroundOpacity: hasCover
      ? Math.max(bookOpeningBackdropOpacity(progress.value, sourceHidden.value), backdrop.value)
      : 0,
    readerFade: hasCover ? interiorFade.value : 0,
    readerWidth,
  }));
  useAnimatedReaction(
    () => progress.value >= 1,
    (done, wasDone) => { if (done !== wasDone) runOnJS(setExpanded)(done); },
  );
  useAnimatedReaction(
    () => canvasSize.value.width > 0 && canvasSize.value.height > 0,
    (ready, wasReady) => { if (ready && !wasReady) runOnJS(presentAfterPaint)(id); },
  );
  const preview = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 2) * (1 - backgroundReveal.value) }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: hasCover ? handoff.value : 1 }));

  useEffect(() => {
    if (session.presented || session.failed) return;
    if (!effect) { failBookOverlay(id); return; }
    const timeout = setTimeout(() => failBookOverlay(id), hasCover ? 1000 : 500);
    return () => clearTimeout(timeout);
  }, [hasCover, id, session.presented, session.failed]);

  useEffect(() => {
    if (!hasCover || !session.readerImage) return;
    // The snapshot only ever lands while the cover is still held, so this fade hides under the board.
    interiorFade.value = withTiming(1, { duration: reducedMotion ? 0 : BOOK_OPENING_INTERIOR_FADE_MS });
    return () => cancelAnimation(interiorFade);
  }, [hasCover, interiorFade, reducedMotion, session.readerImage]);

  useEffect(() => {
    if (hasCover || !session.committed || !expanded) return;
    reveal.value = withDelay(reducedMotion ? 0 : 80, withTiming(1, { duration: reducedMotion ? 0 : 240 }, finished => {
      if (finished) runOnJS(setCurlFinished)(true);
    }));
    return () => cancelAnimation(reveal);
  }, [expanded, hasCover, reducedMotion, reveal, session.committed]);

  useEffect(() => {
    if (!hasCover || !expanded || !session.readerReady) return;
    if (session.readerImage || reducedMotion) {
      // The interior already is the reader, pixel for pixel: clear straight onto it.
      clearBookOpening(id);
      return;
    }
    // No snapshot arrived before the turn: fade onto the live reader instead of popping.
    handoff.value = withTiming(0, { duration: BOOK_OPENING_HANDOFF_MS }, done => {
      if (done) runOnJS(clearBookOpening)(id);
    });
    return () => cancelAnimation(handoff);
  }, [expanded, handoff, hasCover, id, reducedMotion, session.readerImage, session.readerReady]);

  useEffect(() => {
    if (hasCover || !curlFinished || !session.readerReady) return;
    backgroundReveal.value = withTiming(1, { duration: reducedMotion ? 0 : 140 }, done => {
      if (done) runOnJS(clearBookOpening)(id);
    });
    return () => cancelAnimation(backgroundReveal);
  }, [backgroundReveal, curlFinished, hasCover, id, reducedMotion, session.readerReady]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') clearBookOpening(id);
    });
    // A failed route must never leave the screen covered.
    const timeout = setTimeout(() => clearBookOpening(id), session.committed ? 4000 : 20000);
    return () => { listener.remove(); clearTimeout(timeout); };
  }, [id, session.committed]);

  useEffect(() => {
    // Window changes invalidate measured coordinates.
    return () => clearBookOpening(id);
  }, [height, id, width]);

  // Keep the display list intact while presentation and reader readiness change.
  const canvas = useMemo(() => effect ? (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" onSize={canvasSize}>
      <Fill><Shader source={effect} uniforms={uniforms}>
        <ImageShader image={session.image} fit="fill" rect={{ x: 0, y: 0, width: rect.width, height: rect.height }} tx="clamp" ty="clamp" />
        <ImageShader image={session.coverImage ?? session.image} fit="fill" rect={{ x: 0, y: 0, width: rect.width, height: rect.height }} tx="clamp" ty="clamp" />
        <ImageShader image={session.readerImage ?? session.image} tx="clamp" ty="clamp" />
      </Shader></Fill>
    </Canvas>
  ) : null, [canvasSize, rect.height, rect.width, session.coverImage, session.image, session.readerImage, uniforms]);

  if (session.failed) return null;

  const content = (
    <Animated.View cssInterop={false} pointerEvents={session.committed ? 'auto' : 'none'} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}>
      {!hasCover && <Animated.View cssInterop={false} testID="book-opening-backdrop" style={[StyleSheet.absoluteFill, { backgroundColor: session.paperColor }, preview]} />}
      {canvas}
    </Animated.View>
  );
  return Platform.OS === 'ios' ? <FullWindowOverlay>{content}</FullWindowOverlay> : content;
}

export function BookOpeningOverlay() {
  const session = useBookOpening((state) => state.session);
  return session ? <Opening key={session.id} session={session} /> : null;
}

const styles = StyleSheet.create({
  overlay: { zIndex: 1000 },
});
