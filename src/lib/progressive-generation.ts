/**
 * Progressive Generation — Client-Side Utilities
 *
 * All content generation has been moved server-side. This module retains
 * only the client-side TTS pre-generation helper that runs after the
 * server delivers a new day.
 */

import { buildTtsText, prefetchDevotionalAudio, getDefaultVoice } from './tts-service';
import { useUnfoldStore } from './store';

// ---------------------------------------------------------------------------
// TTS Pre-Generation
// ---------------------------------------------------------------------------

/**
 * Pre-generate TTS audio for a devotional day.
 * Called after text generation succeeds — audio is a bonus, not a blocker.
 * Silently fails so devotional text delivery is never blocked by audio issues.
 */
export async function preGenerateAudio(
  devotionalId: string,
  dayNumber: number,
): Promise<void> {
  try {
    const store = useUnfoldStore.getState();
    const devotional = store.devotionals.find((d) => d.id === devotionalId);
    const day = devotional?.days.find((d) => d.dayNumber === dayNumber);
    if (!day) return;

    const voiceId = store.user?.preferredVoice || getDefaultVoice();
    const text = buildTtsText(day);
    await prefetchDevotionalAudio(text, voiceId);
  } catch {
    // Silent fail — devotional text is the priority, audio is a bonus
  }
}
