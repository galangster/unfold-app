import { useEffect, useState } from 'react';
import { fetchVerse, fetchVerseLocal } from '@/lib/bible-api';
import type { BibleTranslation } from '@/lib/bible-db';
import { useUnfoldStore } from '@/lib/store';

/**
 * The passage words the devotional reader shows for a reference: the local
 * Bible in the reader's translation, then the remote WEB text, else the day's
 * own text. It follows the lookup in DevotionalContent, so a screen opened
 * from the reader shows the same words the person was reading.
 */
export function useReaderScripture(reference: string | undefined, fallbackText: string | undefined): string | undefined {
  const translation = useUnfoldStore((s) => s.bibleReaderSettings.translation) as BibleTranslation;
  const [fetchedText, setFetchedText] = useState<string | null>(null);

  useEffect(() => {
    setFetchedText(null);
    if (!reference) return;
    let cancelled = false;
    fetchVerseLocal(reference, translation).then(async (result) => {
      if (result?.text) {
        if (!cancelled) setFetchedText(result.text);
        return;
      }
      try {
        const remote = await fetchVerse(reference, 'web');
        if (remote?.text && !cancelled) setFetchedText(remote.text);
      } catch {
        // Keep the day's own text.
      }
    }).catch(() => {
      // Keep the day's own text.
    });
    return () => { cancelled = true; };
  }, [reference, translation]);

  return fetchedText ?? fallbackText;
}
