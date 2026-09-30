import { useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';
import { foldFirstPane, keyboardCrowdsSecondPane, type AdaptivePanes } from '@/lib/adaptive-layout';

type KeyboardFoldOptions = {
  /** Whether the screen folds at all. Rows and unpaired windows never fold. */
  enabled?: boolean;
  /** What the folded first pane keeps, in points. Zero hides it. */
  keep?: number;
  insetBottom: number;
  reducedMotion: boolean;
};

/**
 * Stacked panes whose first pane folds away while the software keyboard would
 * leave the second pane too short to write in. The first pane stays mounted,
 * and the fold moves with the keyboard, on its duration and curve.
 */
export function useKeyboardFoldedPanes(
  panes: AdaptivePanes | null,
  { enabled = true, keep = 0, insetBottom, reducedMotion }: KeyboardFoldOptions,
): { panes: AdaptivePanes | null; folded: boolean } {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const foldsAt = (height: number) => enabled
    && panes?.axis === 'column'
    && keyboardCrowdsSecondPane(panes, height, insetBottom);
  const folded = foldsAt(keyboardHeight);
  // Read by the keyboard listeners, which outlive a render.
  const motionRef = useRef({ folded, foldsAt, reducedMotion });
  motionRef.current = { folded, foldsAt, reducedMotion };
  const axis = panes?.axis;
  useEffect(() => {
    if (axis !== 'column') return;
    setKeyboardHeight(Keyboard.metrics()?.height ?? 0);
    const followKeyboard = (event: KeyboardEvent, height: number) => {
      const motion = motionRef.current;
      if (!motion.reducedMotion && event.duration > 0 && motion.foldsAt(height) !== motion.folded) {
        const type = LayoutAnimation.Types[event.easing] ?? LayoutAnimation.Types.keyboard;
        LayoutAnimation.configureNext({ duration: event.duration, update: { duration: event.duration, type } });
      }
      setKeyboardHeight(height);
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      followKeyboard(event, event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', (event) => {
      followKeyboard(event, 0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [axis]);

  return { panes: panes && folded ? foldFirstPane(panes, keep) : panes, folded };
}
