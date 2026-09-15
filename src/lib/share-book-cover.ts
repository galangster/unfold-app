import * as Sharing from 'expo-sharing';
import { releaseCapture } from 'react-native-view-shot';
import { cacheDirectory, copyAsync, deleteAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

/** Keep the local image alive until the native share sheet finishes with it. */
export async function shareBookCover(title: string, capture: () => Promise<string>): Promise<'shared' | 'unavailable'> {
  if (!await Sharing.isAvailableAsync()) return 'unavailable';
  if (!cacheDirectory) throw new Error('Image storage is unavailable');
  const uri = await capture();
  const directory = `${cacheDirectory}unfold-cover-${Date.now()}/`;
  const name = title.replace(/[/\\:?%*|"<>\x00-\x1F]/g, '').trim().slice(0, 80) || 'Book cover';
  const shareUri = `${directory}${encodeURIComponent(`${name} — Unfold.png`)}`;
  try {
    await makeDirectoryAsync(directory, { intermediates: true });
    await copyAsync({ from: uri, to: shareUri });
    await Sharing.shareAsync(shareUri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Share your book cover',
    });
    return 'shared';
  } finally {
    releaseCapture(uri);
    // OS cache eviction remains the fallback if cleanup is interrupted.
    await deleteAsync(directory, { idempotent: true }).catch(() => {});
  }
}
