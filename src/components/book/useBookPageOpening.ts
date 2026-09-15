import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useIsFocused } from 'expo-router';
import { AppState, Platform, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { makeImageFromView } from '@shopify/react-native-skia';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { bookOpeningProgress, clearBookOpening, shouldOpenBook, useBookOpening, type BookOpeningCover } from '@/lib/book-opening';
import type { BookTodayPage } from '@/lib/book-of-seasons';
import { bookPageColors } from './book-page-colors';
import type { ColorTheme } from '@/constants/colors';

function hintStorageKey(hardcover: boolean): string {
  return hardcover ? 'unfold.book-cover-discovered.v1' : 'unfold.book-corner-discovered.v1';
}
let nextOpening = 0;

export function useBookPageOpening({ pageRef, coverRef, page, colors, isDark, onContinue, cover }: {
  pageRef: RefObject<View | null>;
  coverRef?: RefObject<View | null>;
  page: BookTodayPage;
  colors: ColorTheme;
  isDark: boolean;
  onContinue: (openingId?: string) => void;
  cover?: BookOpeningCover;
}) {
  const focused = useIsFocused();
  const { reducedMotion } = useAccessibleAnimation();
  const progress = useSharedValue(0);
  const dragProgress = useSharedValue(0);
  const sourceHidden = useSharedValue(false);
  const pageWidth = useSharedValue(320);
  const dragging = useSharedValue(false);
  const busy = useSharedValue(false);
  const activeId = useRef<string | null>(null);
  const mounted = useRef(true);
  const discovered = useRef(false);
  const pageSize = useRef({ width: 0, height: 0 });
  const capturing = useRef<string | null>(null);
  const pendingSettle = useRef<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);
  const hardcover = Boolean(cover);
  const session = useBookOpening((state) => state.session);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeId.current && !useBookOpening.getState().session?.committed) {
        clearBookOpening(activeId.current);
      }
      activeId.current = null;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(hintStorageKey(hardcover)).then((seen) => {
      if (mounted.current && !discovered.current) setShowHint(seen !== '1');
    }).catch(() => {});
  }, [hardcover]);

  const reset = useCallback(() => {
    dragging.value = false;
    busy.value = false;
    sourceHidden.value = false;
    pendingSettle.current = null;
    cancelAnimation(progress);
    if (activeId.current) clearBookOpening(activeId.current);
    activeId.current = null;
    progress.value = 0;
  }, [busy, dragging, progress, sourceHidden]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') reset();
    });
    return () => subscription.remove();
    // The shared value and ref remain stable throughout this mount.
  }, [reset]);

  useEffect(() => {
    if (!session) { activeId.current = null; busy.value = false; }
  }, [busy, session]);

  useEffect(() => {
    if (!focused && !useBookOpening.getState().session?.committed) reset();
  }, [focused, reset]);

  useEffect(() => () => {
    if (!useBookOpening.getState().session?.committed) reset();
  }, [page.dayNumber, page.totalDays, page.title, page.invitation, page.scriptureReference, colors, isDark, cover?.id, reset]);

  function open(id: string) {
    if (!focused || !mounted.current || activeId.current !== id) return;
    discovered.current = true;
    setShowHint(false);
    void AsyncStorage.setItem(hintStorageKey(hardcover), '1').catch(() => {});
    const current = useBookOpening.getState().session;
    if (current?.id === id && !current.failed) {
      useBookOpening.setState({ session: { ...current, committed: true } });
      onContinue(id);
    } else {
      clearBookOpening(id);
      onContinue(id);
    }
  }

  function settle(commit: boolean) {
    const id = activeId.current;
    if (!id) return;
    if (reducedMotion) {
      if (commit) open(id);
      else reset();
      return;
    }
    const current = useBookOpening.getState().session;
    if ((!current && capturing.current === id) || (current && !current.presented && !current.failed)) {
      pendingSettle.current = commit;
      return;
    }
    if (commit && (!current || current.failed)) {
      open(id);
      return;
    }
    // Prepare the reader behind the hardcover while the committed motion finishes.
    progress.value = withTiming(commit ? 1 : 0, {
      duration: commit ? Math.max(120, (hardcover ? 420 : 280) * (1 - progress.value)) : 190,
      easing: Easing.bezier(0.22, 0.72, 0, 1),
    }, (finished) => {
      if (!finished) return;
      if (!commit) runOnJS(reset)();
      else if (!hardcover) runOnJS(open)(id);
    });
    if (commit && hardcover) open(id);
  }

  async function begin(tap: boolean) {
    if (!focused || !page.canOpen || activeId.current || useBookOpening.getState().session) return;
    const id = `book-opening-${++nextOpening}`;
    activeId.current = id;
    busy.value = true;
    if (tap) progress.value = 0;
    if (reducedMotion || Platform.OS === 'web' || !page.contentReady) {
      if (tap) open(id);
      return;
    }
    let captureExpired = false;
    const captureTimeout = setTimeout(() => {
      if (!mounted.current || activeId.current !== id || capturing.current !== id) return;
      captureExpired = true;
      capturing.current = null;
      if (tap || pendingSettle.current === true) open(id);
      else if (pendingSettle.current === false) reset();
    }, 700);
    try {
      capturing.current = id;
      const rect = await new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
        if (!pageRef.current) return resolve(null);
        pageRef.current.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
      });
      const paperColor = bookPageColors(colors, isDark).surface;
      const image = rect && rect.width > 0 && rect.height > 0 ? await makeImageFromView(pageRef) : null;
      const coverImage = cover && image && coverRef ? await makeImageFromView(coverRef) : undefined;
      if (captureExpired || !mounted.current || activeId.current !== id) return;
      if (rect && image && (!cover || coverImage)) {
        useBookOpening.setState({ session: {
          id, rect, image, paperColor,
          progress, sourceHidden, presented: false, committed: false, readerReady: false,
          ...(cover && coverImage ? { cover, coverImage } : {}),
          onPresented: () => {
            const pending = pendingSettle.current;
            pendingSettle.current = null;
            if (tap || pending !== null) settle(tap || pending === true);
            else if (sourceHidden.value) progress.value = withTiming(dragProgress.value, { duration: 70 });
          },
        } });
      }
    } catch {
      // Snapshot support varies by renderer. The reading remains accessible.
    } finally {
      clearTimeout(captureTimeout);
      if (capturing.current === id) capturing.current = null;
    }
    if (captureExpired) return;
    if (mounted.current && activeId.current === id && useBookOpening.getState().session?.id !== id) {
      if (tap) settle(true);
      else if (pendingSettle.current !== null) settle(pendingSettle.current);
    }
  }

  const pan = Gesture.Pan()
    .enabled(page.canOpen)
    .maxPointers(1)
    .activeOffsetX(-10)
    .failOffsetY([-14, 14])
    .onTouchesDown((event, manager) => { if (event.numberOfTouches > 1) manager.fail(); })
    .onStart(() => {
      if (busy.value) return;
      busy.value = true;
      dragging.value = true;
      progress.value = 0;
      dragProgress.value = 0;
      runOnJS(begin)(false);
    })
    .onUpdate((event) => {
      if (!dragging.value) return;
      dragProgress.value = bookOpeningProgress(event.translationX, pageWidth.value);
      if (sourceHidden.value) progress.value = dragProgress.value;
    })
    .onEnd((event) => {
      if (!dragging.value) return;
      dragging.value = false;
      runOnJS(settle)(shouldOpenBook(dragProgress.value, event.velocityX));
    })
    .onFinalize((_event, success) => {
      if (!success && dragging.value) { dragging.value = false; runOnJS(settle)(false); }
    });

  const sourceStyle = useAnimatedStyle(() => ({ opacity: sourceHidden.value ? 0 : 1 }));

  return {
    gesture: pan,
    open: () => { void begin(true); },
    showHint,
    hidden: Boolean(session?.presented && session.id === activeId.current),
    sourceStyle,
    onLayout: (width: number, height: number) => {
      if ((width !== pageSize.current.width || height !== pageSize.current.height) && activeId.current) reset();
      pageSize.current = { width, height };
      pageWidth.value = width;
    },
  };
}
