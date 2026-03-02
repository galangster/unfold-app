/**
 * Cartesia API Integration
 * Text-to-speech for devotional audio playback
 */

import { File, Paths } from 'expo-file-system';

const CARTESIA_API_KEY = process.env.EXPO_PUBLIC_CARTESIA_KEY || '';
const CARTESIA_BASE_URL = 'https://api.cartesia.ai';

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
 * Fetch audio from Cartesia TTS bytes endpoint.
 * Returns a local file URI for expo-audio playback.
 */
export async function streamDevotionalAudio(
  text: string,
  voiceId: string = '694f9389-aac1-45b6-b726-9d9369183238',
  onProgress?: (word: string, timestamp: number) => void
): Promise<TTSResult> {
  try {
    const response = await fetch(`${CARTESIA_BASE_URL}/tts/bytes`, {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2025-04-16',
        'X-API-Key': CARTESIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-3',
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'mp3',
          sample_rate: 24000,
        },
        language: 'en',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Cartesia API error: ${response.status} ${errorBody}`);
    }

    // Get raw MP3 bytes and write directly to cache file
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const file = new File(Paths.cache, `cartesia_tts_${Date.now()}.mp3`);
    file.write(bytes);

    // The /tts/bytes endpoint does not return word timestamps
    return {
      audioUrl: file.uri,
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
