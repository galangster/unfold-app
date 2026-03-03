/**
 * Cartesia API Integration
 * Text-to-speech for devotional audio playback
 */

import { File, Paths } from 'expo-file-system';

const TTS_PROXY_URL = 'https://tts-proxy-five.vercel.app/api/tts';

// Voice options for Unfold - ALL PREMIUM
export const CARTESIA_VOICES = [
  {
    id: '694f9389-aac1-45b6-b726-9d9369183238',
    name: 'Katie',
    description: 'Warm, contemplative — perfect for devotionals',
    premium: false,
  },
  {
    id: '03496517-369a-4db1-8236-3d3ae459ddf7',
    name: 'Elena',
    description: 'Gentle, nurturing voice',
    premium: true,
  },
  {
    id: '1463a4e1-56a1-4b41-b257-728d56e93605',
    name: 'Marcus',
    description: 'Calm, authoritative male voice',
    premium: true,
  },
  {
    id: '00967b2f-88a6-4a31-8153-110a92134b9f',
    name: 'Sophia',
    description: 'Soft, peaceful tone',
    premium: true,
  },
  {
    id: '3246e36c-ac8c-418d-83cd-4eaad5a3b887',
    name: 'David',
    description: 'Warm, pastoral presence',
    premium: true,
  },
  {
    id: '15a9cd88-84b0-4a8b-95f2-5d583b54c72e',
    name: 'Grace',
    description: 'Ethereal, angelic quality',
    premium: true,
  },
  {
    id: 'a924b0e6-9253-4711-8fc3-5cb8e0188c94',
    name: 'Michael',
    description: 'Strong, reassuring male voice',
    premium: true,
  },
];

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface TTSResult {
  audioUrl: string;
  wordTimestamps: WordTimestamp[];
  duration: number;
}

/**
 * Simple string hash for deterministic cache filenames.
 * Not cryptographic — just needs to be consistent for the same input.
 */
function hashKey(text: string, voiceId: string): string {
  const input = `${voiceId}:${text}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Fetch audio from Cartesia TTS bytes endpoint.
 * Caches audio per text+voice combo — replay costs zero API tokens.
 */
export async function streamDevotionalAudio(
  text: string,
  voiceId: string = '694f9389-aac1-45b6-b726-9d9369183238',
  onProgress?: (word: string, timestamp: number) => void
): Promise<TTSResult> {
  try {
    const cacheKey = hashKey(text, voiceId);
    const cachedFile = new File(Paths.cache, `tts_${cacheKey}.mp3`);

    // Return cached audio if it exists and has content
    if (cachedFile.exists && cachedFile.size > 0) {
      return {
        audioUrl: cachedFile.uri,
        wordTimestamps: [],
        duration: 0,
      };
    }

    const response = await fetch(TTS_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voiceId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`TTS proxy error: ${response.status} ${errorBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    cachedFile.write(bytes);

    return {
      audioUrl: cachedFile.uri,
      wordTimestamps: [],
      duration: 0,
    };
  } catch (error) {
    console.error('Cartesia TTS error:', error);
    throw error;
  }
}

/**
 * Get default voice for user
 * Returns Katie (free) for non-premium, or saved preference
 */
export function getDefaultVoice(isPremium: boolean = false): string {
  // Always return Katie (free voice) as default
  return '694f9389-aac1-45b6-b726-9d9369183238';
}

/**
 * Get available voices for user
 */
export function getAvailableVoices(isPremium: boolean = false): typeof CARTESIA_VOICES {
  if (isPremium) {
    return CARTESIA_VOICES;
  }
  // Free tier: only Katie
  return CARTESIA_VOICES.filter(v => !v.premium);
}
