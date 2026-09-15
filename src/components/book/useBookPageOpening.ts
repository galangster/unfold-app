import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useIsFocused } from 'expo-router';
import { AppState, Platform, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { makeImageFromView } from '@shopify/react-native-skia';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import {
  BOOK_OPENING_BACKDROP_MS,
  BOOK_OPENING_CREEP_MS,
  BOOK_OPENING_CREEP_PROGRESS,
  BOOK_OPENING_PRESS_MS,
  BOOK_OPENING_PRESS_PROGRESS,
  BOOK_OPENING_READY_HOLD_MS,
  bookOpeningCancelDuration,
  bookOpeningProgress,
  bookOpeningTurnDuration,
  clearBookOpening,
  hardcoverDragProgress,
  markBookTurnStarted,
  shouldOpenBook,
  useBookOpening,
  type BookOpeningCover,
} from '@/lib/book-opening';
import type { BookTodayPage } from '@/lib/book-of-seasons';
import { bookPageColors } from './book-page-colors';
import type { ColorTheme } from '@/constants/colors';

function hintStorageKey(hardcover: boolean): string {
  return hardcover ? 'unfold.book-cover-discovered.v1' : 'unfold.book-corner-discovered.v1';
}
let nextOpening = 0;
// Quad-out: the board stays visible for most of the turn instead of flipping in the first frames.
const HARDCOVER_TURN_EASING = Easing.bezier(0.25, 0.46, 0.45, 0.94);
const PAPER_EASING = Easing.bezier(0.22, 0.72, 0, 1);

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
  const backdrop = useSharedValue(0);
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
    backdrop.value = 0;
    pendingSettle.current = null;
    cancelAnimation(progress);
    if (activeId.current) clearBookOpening(activeId.current);
    activeId.current = null;
    progress.value = 0;
  }, [backdrop, busy, dragging, progress, sourceHidden]);

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
    if (!commit) {
      progress.value = withTiming(0, {
        duration: hardcover ? bookOpeningCancelDuration(progress.value) : 190,
        easing: hardcover ? HARDCOVER_TURN_EASING : PAPER_EASING,
      }, (finished) => {
        if (finished) runOnJS(reset)();
      });
      return;
    }
    if (hardcover) {
      // Answer the press at once: the cover cracks open and holds there until the reader snapshot exists.
      if (progress.value < BOOK_OPENING_PRESS_PROGRESS) {
        progress.value = withTiming(BOOK_OPENING_PRESS_PROGRESS, { duration: BOOK_OPENING_PRESS_MS, easing: HARDCOVER_TURN_EASING }, (finished) => {
          // Then keep creeping open while the reader prepares; the turn retargets from wherever this is.
          if (finished) progress.value = withTiming(BOOK_OPENING_CREEP_PROGRESS, { duration: BOOK_OPENING_CREEP_MS, easing: HARDCOVER_TURN_EASING });
        });
      }
      // Paper covers the tab before the reader mounts behind the overlay, so nothing leaks through the hold.
      backdrop.value = withTiming(1, { duration: BOOK_OPENING_BACKDROP_MS, easing: HARDCOVER_TURN_EASING }, (finished) => {
        if (finished) runOnJS(open)(id);
      });
      return;
    }
    // Keep navigation behind the fully opened page, including the canvas's first frame.
    progress.value = withTiming(1, {
      duration: Math.max(120, 280 * (1 - progress.value)),
      easing: PAPER_EASING,
    }, (finished) => {
      if (finished) runOnJS(open)(id);
    });
  }

  useEffect(() => {
    if (!hardcover || !session?.committed || session.id !== activeId.current || session.turnStarted) return;
    const openingId = session.id;
    const startTurn = () => {
      if (activeId.current !== openingId || useBookOpening.getState().session?.turnStarted) return;
      markBookTurnStarted(openingId);
      progress.value = withTiming(1, {
        duration: bookOpeningTurnDuration(progress.value),
        easing: HARDCOVER_TURN_EASING,
      });
    };
    // The interior under the board must already be the reader, so the turn waits for the snapshot, not just readiness.
    if (session.readerImage) {
      startTurn();
      return;
    }
    const timeout = setTimeout(startTurn, BOOK_OPENING_READY_HOLD_MS);
    return () => clearTimeout(timeout);
  }, [hardcover, progress, session?.committed, session?.id, session?.readerImage, session?.turnStarted]);

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
          progress, sourceHidden, backdrop, presented: false, committed: false, readerReady: false,
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
      const raw = bookOpeningProgress(event.translationX, pageWidth.value);
      dragProgress.value = hardcover ? hardcoverDragProgress(raw) : raw;
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
