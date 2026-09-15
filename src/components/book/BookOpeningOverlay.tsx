import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Fill, ImageShader, Shader, Skia } from '@shopify/react-native-skia';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useAnimatedReaction, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { bookOpeningExpand, clearBookOpening, failBookOverlay, hardcoverHingeDegrees, hardcoverPaperCurlProgress, markBookOverlayPresented, useBookOpening, type BookOpeningSession } from '@/lib/book-opening';
import { PAGE_CURL_SHADER } from './page-curl-shader';
import { SERIES_BOOK_PAPER_FRACTION } from '@/lib/series-book-geometry';

const effect = Skia.RuntimeEffect.Make(PAGE_CURL_SHADER);

function presentAfterPaint(id: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => markBookOverlayPresented(id)));
}

function Opening({ session }: { session: BookOpeningSession }) {
  const { width, height } = useWindowDimensions();
  const { reducedMotion } = useAccessibleAnimation();
  const reveal = useSharedValue(0);
  const backgroundReveal = useSharedValue(0);
  const [curlFinished, setCurlFinished] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canvasSize = useSharedValue({ width: 0, height: 0 });
  const color = useMemo(() => Array.from(Skia.Color(session.paperColor)), [session.paperColor]);
  const { rect, progress, id, cover, sourceHidden } = session;
  const hasCover = cover != null;
  const readyToFinish = !hasCover || session.readerReady;
  const uniforms = useDerivedValue(() => ({
    viewport: [width, height],
    startRect: [rect.x, rect.y, rect.width, rect.height],
    expansion: bookOpeningExpand(progress.value),
    hardcover: hasCover ? 1 : 0,
    hingeDegrees: hardcoverHingeDegrees(progress.value),
    coverBoardRight: rect.width * (1 - SERIES_BOOK_PAPER_FRACTION),
    curlProgress: hasCover
      ? hardcoverPaperCurlProgress(progress.value) * (0.35 + 0.65 * reveal.value)
      : progress.value * (0.6 + 0.4 * reveal.value),
    paperColor: color,
    backgroundOpacity: hasCover && sourceHidden.value ? 1 - backgroundReveal.value : 0,
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

  useEffect(() => {
    if (session.presented || session.failed) return;
    if (!effect) { failBookOverlay(id); return; }
    const timeout = setTimeout(() => failBookOverlay(id), hasCover ? 1000 : 500);
    return () => clearTimeout(timeout);
  }, [hasCover, id, session.presented, session.failed]);

  useEffect(() => {
    if (!session.committed || !expanded || !readyToFinish) return;
    // Keep the paper readable until the real reader can appear underneath its final turn.
    if (hasCover) backgroundReveal.value = withTiming(1, { duration: reducedMotion ? 0 : 180 });
    reveal.value = withDelay(reducedMotion ? 0 : 80, withTiming(1, { duration: reducedMotion ? 0 : 240 }, finished => {
      if (finished) runOnJS(setCurlFinished)(true);
    }));
    return () => {
      cancelAnimation(reveal);
      if (hasCover) cancelAnimation(backgroundReveal);
    };
  }, [backgroundReveal, expanded, hasCover, readyToFinish, reducedMotion, reveal, session.committed]);

  useEffect(() => {
    if (!curlFinished || !session.readerReady) return;
    if (hasCover) { clearBookOpening(id); return; }
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
      </Shader></Fill>
    </Canvas>
  ) : null, [canvasSize, rect.height, rect.width, session.coverImage, session.image, uniforms]);

  if (session.failed) return null;

  const content = (
    <Animated.View cssInterop={false} pointerEvents={session.committed ? 'auto' : 'none'} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.overlay]}>
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
