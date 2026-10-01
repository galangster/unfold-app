import { useCallback, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { GestureResponderEvent } from 'react-native';
import type { DevotionalWebViewCommands } from './DevotionalWebView';

/** A tap: the finger stays within TAP_SLOP_PX of where it started and lifts
 *  within TAP_MAX_MS. The page uses the same values for a tap outside the
 *  selection bar. */
export const TAP_SLOP_PX = 10;
export const TAP_MAX_MS = 450;

/**
 * Closes an open selection bar on a tap on the reader's own views (the
 * Scripture card, the reflection, the act). The page closes the bar on a tap
 * outside it, but a touch on a native view never reaches the page.
 *
 * RN reports touches on the WebView too. Those stay with the page, which has
 * its own rule. The page's wrapper marks them with `onPageTouchStart`: a touch
 * event bubbles from the view it started on to the root, so the wrapper sees
 * the touch before the root does.
 *
 * A drag or a long press is a scroll or another gesture, not a dismissal, the
 * same as in the page.
 */
export function useSelectionBarOutsideTap(commandRef: MutableRefObject<DevotionalWebViewCommands | null>) {
  const tapRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const inPageRef = useRef(false);

  const onPageTouchStart = useCallback(() => {
    inPageRef.current = true;
  }, []);

  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY, timestamp } = event.nativeEvent;
    tapRef.current = inPageRef.current ? null : { x: pageX, y: pageY, at: timestamp };
    inPageRef.current = false;
  }, []);

  const onTouchMove = useCallback((event: GestureResponderEvent) => {
    const tap = tapRef.current;
    if (!tap) return;
    const { pageX, pageY } = event.nativeEvent;
    if (Math.abs(pageX - tap.x) > TAP_SLOP_PX || Math.abs(pageY - tap.y) > TAP_SLOP_PX) tapRef.current = null;
  }, []);

  const onTouchEnd = useCallback((event: GestureResponderEvent) => {
    const tap = tapRef.current;
    tapRef.current = null;
    if (tap && event.nativeEvent.timestamp - tap.at <= TAP_MAX_MS) commandRef.current?.closeSelectionBar();
  }, [commandRef]);

  const onTouchCancel = useCallback(() => {
    tapRef.current = null;
  }, []);

  const readerTouchHandlers = useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }),
    [onTouchCancel, onTouchEnd, onTouchMove, onTouchStart],
  );
  return { onPageTouchStart, readerTouchHandlers };
}
