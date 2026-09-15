import type { RefObject } from 'react';
import type { View } from 'react-native';
import { makeImageFromView } from '@shopify/react-native-skia';
import { markBookReaderReady, setBookReaderImage, useBookOpening } from './book-opening';

/**
 * Marks the reader ready, then snapshots it for the hardcover interior while
 * the cover is still held closed. A snapshot never runs once the turn has
 * started: the capture blocks the UI thread, and a late image is discarded.
 */
export function markBookReaderReadyWithSnapshot(id: string | undefined, ref: RefObject<View | null>): void {
  markBookReaderReady(id);
  const session = useBookOpening.getState().session;
  if (!id || !session || session.id !== id || !session.cover || session.readerImage || session.turnStarted || !ref.current) return;
  void makeImageFromView(ref).then((image) => {
    if (!image) return;
    if (!setBookReaderImage(id, image)) image.dispose();
  }).catch(() => {});
}
