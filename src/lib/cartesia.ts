/**
 * Cartesia API Integration
 * Text-to-speech for devotional audio playback
 */

import { File, Paths } from 'expo-file-system';
import { logger } from '@/lib/logger';
import { reportError } from '@/lib/report-error';
import { getAuthHeaders } from '@/lib/api-config';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';

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
 * Convert scripture references to speakable text.
 * "Mark 4:35-41" → "Mark chapter 4, verses 35 through 41"
 * "John 3:16" → "John chapter 3, verse 16"
 * Handles numbered books: "1 Corinthians" → "First Corinthians"
 */
function makeScripturesSpeakable(text: string): string {
  const numberedBookPrefix: Record<string, string> = {
    '1': 'First', '2': 'Second', '3': 'Third',
  };

  // Match patterns like "Mark 4:35-41" or "1 Corinthians 13:4-7" or "Psalm 23:1-6"
  return text.replace(
    /\b([123]\s+)?([A-Z][a-z]+(?:\s+of\s+[A-Z][a-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?\b/g,
    (_match, numPrefix, book, chapter, verseStart, verseEnd) => {
      let speakableBook = book;
      if (numPrefix) {
        const n = numPrefix.trim();
        speakableBook = `${numberedBookPrefix[n] || n} ${book}`;
      }
      const verseWord = verseEnd ? 'verses' : 'verse';
      const verseRange = verseEnd
        ? `${verseStart} through ${verseEnd}`
        : verseStart;
      return `${speakableBook} chapter ${chapter}, ${verseWord} ${verseRange}`;
    }
  );
}

/**
 * SSML Dynamic Narration Preprocessor
 * Adds Cartesia SSML tags to devotional text for expressive, dynamic narration.
 *
 * Audio text format: "ScriptureRef.\nScriptureText\n\nBodyParagraph1\n\nBodyParagraph2..."
 * Uses Cartesia's custom tags: <speed ratio="">, <volume ratio="">, <break time="">
 *   speed: 0.6–1.5 (1.0 = default)
 *   volume: 0.5–2.0 (1.0 = default)
 *   break: seconds ("1s") or milliseconds ("500ms")
 */
export function addSSMLNarration(text: string): string {
  // Make scripture references speakable first
  let processed = makeScripturesSpeakable(text);

  // Split into scripture section (before first \n\n) and body (after)
  const firstDoubleBreak = processed.indexOf('\n\n');
  let scripturePart = '';
  let bodyPart = processed;

  if (firstDoubleBreak > 0) {
    scripturePart = processed.slice(0, firstDoubleBreak);
    bodyPart = processed.slice(firstDoubleBreak + 2);
  }

  // IMPORTANT: SSML tags must be INLINE with text, never as standalone chunks.
  // The text splitter splits on \n\n, so every paragraph must contain real text.

  let result = '';

  // --- Scripture section: slower, softer, reverent ---
  if (scripturePart) {
    const refLineEnd = scripturePart.indexOf('\n');
    if (refLineEnd > 0) {
      const ref = scripturePart.slice(0, refLineEnd);
      const scriptureText = scripturePart.slice(refLineEnd + 1);
      // Reference + pause, then scripture at slower pace
      result += ref + '.<break time="800ms"/> <speed ratio="0.88"/><volume ratio="0.85"/>' + scriptureText;
      // Reset speed/volume inline before body
      result += '<break time="1.5s"/><speed ratio="1.0"/><volume ratio="1.0"/>';
    } else {
      result += scripturePart + '.<break time="1.2s"/>';
    }
  }

  // --- Body paragraphs: varied pacing for natural narration ---
  if (bodyPart) {
    const paragraphs = bodyPart.split(/\n\n+/).filter(p => p.trim());
    const lastIdx = paragraphs.length - 1;

    paragraphs.forEach((para, i) => {
      // Separate from previous section/paragraph — break tag goes INLINE
      if (result) {
        result += '\n\n';
      }

      let p = para;

      // Theologian/author quotes — slower, more deliberate
      p = p.replace(
        /("[^"]{15,}")\s*[—–-]\s*([A-Z][a-zA-Z.]+ [A-Z][a-zA-Z.]+)/g,
        '<break time="300ms"/><speed ratio="0.86"/><volume ratio="0.9"/>$1<volume ratio="1.0"/><speed ratio="1.0"/> — $2'
      );

      // Questions to the reader — brief pause before, slight slowdown
      p = p.replace(
        /([.!]\s+)([A-Z][^.!?]{8,}[?])/g,
        '$1<break time="400ms"/><speed ratio="0.94"/>$2<speed ratio="1.0"/>'
      );

      // Exclamatory sentences — slightly bolder
      p = p.replace(
        /([.?]\s+)([A-Z][^.!?]{5,}[!])/g,
        '$1<volume ratio="1.12"/>$2<volume ratio="1.0"/>'
      );

      // Short powerful sentences (6-45 chars) — pause + slower for weight
      p = p.replace(
        /(\.\s+)([A-Z][^.!?]{4,43}\.)/g,
        (_match, punct, sentence) => {
          if (/\d+:\d+/.test(sentence)) return _match;
          return punct + '<break time="350ms"/><speed ratio="0.91"/>' + sentence + '<speed ratio="1.0"/>';
        }
      );

      // Final paragraph — slow down for closing/prayer (tag prefix, inline)
      if (i === lastIdx && paragraphs.length > 2) {
        result += '<break time="600ms"/><speed ratio="0.92"/>' + p;
      } else if (i > 0) {
        // Inter-paragraph pause, inline with the paragraph text
        result += '<break time="1s"/>' + p;
      } else {
        result += p;
      }
    });
  }

  return result;
}

/**
 * Deterministic cache key from text + voiceId.
 * Uses two independent hashes (djb2 + sdbm) concatenated to minimize collision risk.
 */
function hashKey(text: string, voiceId: string): string {
  const input = `v4:${voiceId}:${text}`; // v4 = SSML re-enabled with Cartesia tags
  let h1 = 5381;  // djb2
  let h2 = 0;     // sdbm
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = (c + (h2 << 6) + (h2 << 16) - h2) | 0;
  }
  return Math.abs(h1).toString(36) + Math.abs(h2).toString(36);
}

/**
 * In-flight request dedup map.
 * Prevents duplicate network requests when prefetch + play overlap.
 * Key: cache key, Value: the in-flight promise.
 */
const inFlightRequests = new Map<string, Promise<TTSResult>>();

const CHUNK_THRESHOLD = 1500;

/**
 * Split text into chunks at paragraph or sentence boundaries.
 * Each chunk stays under ~1500 chars to balance fewer requests vs proxy timeout.
 */
function splitTextIntoChunks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [text]; // Never return empty array
  if (trimmed.length <= CHUNK_THRESHOLD) return [trimmed];

  const paragraphs = trimmed.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length > 0 && current.length + para.length + 2 > CHUNK_THRESHOLD) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If only 1 chunk (no paragraph breaks), split on sentences
  if (chunks.length <= 1 && trimmed.length > CHUNK_THRESHOLD) {
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    const sentenceChunks: string[] = [];
    let cur = '';
    for (const s of sentences) {
      if (cur.length > 0 && cur.length + s.length + 1 > CHUNK_THRESHOLD) {
        sentenceChunks.push(cur.trim());
        cur = s;
      } else {
        cur = cur ? cur + ' ' + s : s;
      }
    }
    if (cur.trim()) sentenceChunks.push(cur.trim());
    return sentenceChunks.length > 0 ? sentenceChunks : [trimmed];
  }

  return chunks.length > 0 ? chunks : [trimmed];
}

/**
 * Decode a base64 string to Uint8Array.
 * Works reliably in React Native/Hermes (unlike response.arrayBuffer() or FileReader.readAsArrayBuffer).
 */
function base64ToUint8Array(base64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Invalid base64 audio data from proxy');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Fetch a single small chunk from the TTS proxy.
 * Requests base64 JSON format to avoid binary response handling issues in RN/Hermes.
 * Each chunk is short enough to complete well within Vercel's 60s limit.
 */
async function fetchChunk(text: string, voiceId: string): Promise<Uint8Array> {
  try {
    logger.log(`[TTS] fetchChunk: starting fetch (${text.length} chars)...`);
    const response = await fetch(TTS_PROXY_URL, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ text, voiceId, format: 'base64' }),
    });

    logger.log(`[TTS] fetchChunk: response status=${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`TTS proxy error: ${response.status} ${errorBody}`);
    }

    const json = await response.json();
    logger.log(`[TTS] fetchChunk: got base64 audio, size=${json.size}`);

    if (!json.audio) {
      throw new Error('TTS proxy returned empty audio');
    }

    const bytes = base64ToUint8Array(json.audio);
    logger.log(`[TTS] fetchChunk: decoded ${bytes.length} bytes`);
    return bytes;
  } catch (error) {
    logger.log(`[TTS] fetchChunk ERROR:`, error);
    throw error;
  }
}

/**
 * Check if an ArrayBuffer starts with an ID3v2 header and return the offset past it.
 * ID3v2 starts with "ID3" and the header size is in bytes 6-9 (syncsafe integer).
 */
function id3HeaderSize(buf: Uint8Array): number {
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

/**
 * Core download logic — splits text into chunks, fetches each from proxy in parallel,
 * concatenates MP3 bytes, writes to cache.
 * Not exported — use streamDevotionalAudio or prefetchDevotionalAudio instead.
 */
async function downloadAudio(text: string, voiceId: string, cacheKey: string): Promise<TTSResult> {
  const cachedFile = new File(Paths.cache, `tts_${cacheKey}.mp3`);

  logger.log(`[TTS] downloadAudio START — textLen=${text.length}, voiceId=${voiceId}, cacheKey=${cacheKey}`);

  try {
    // Apply SSML narration — speed, volume, and break tags for expressive reading
    const ssmlText = addSSMLNarration(text);
    logger.log(`[TTS] SSML narration applied — ${text.length} → ${ssmlText.length} chars`);
    const chunks = splitTextIntoChunks(ssmlText);
    logger.log(`[TTS] split into ${chunks.length} chunks (${chunks.map(c => c.length).join(', ')} chars)`);

    const fetchStart = Date.now();
    let finalBytes: Uint8Array;

    if (chunks.length === 1) {
      // Short text — single request
      finalBytes = await fetchChunk(chunks[0], voiceId);
      logger.log(`[TTS] single chunk done — ${finalBytes.length} bytes, ${Date.now() - fetchStart}ms`);
    } else {
      // Long text — parallel requests (Promise.all preserves order for concatenation)
      logger.log(`[TTS] fetching ${chunks.length} chunks in parallel (${chunks.map(c => c.length).join(', ')} chars)...`);
      const chunkBytes = await Promise.all(
        chunks.map((chunk, i) => {
          logger.log(`[TTS] chunk ${i + 1}/${chunks.length} starting (${chunk.length} chars)...`);
          return fetchChunk(chunk, voiceId);
        })
      );
      logger.log(`[TTS] all ${chunkBytes.length} chunks done — ${Date.now() - fetchStart}ms`);

      // Concatenate: keep first chunk's ID3 header, strip from subsequent chunks
      const parts: Uint8Array[] = [];
      let totalSize = 0;
      for (let i = 0; i < chunkBytes.length; i++) {
        const bytes = chunkBytes[i];
        if (i === 0) {
          parts.push(bytes);
          totalSize += bytes.length;
        } else {
          const headerSize = id3HeaderSize(bytes);
          const stripped = headerSize > 0 ? bytes.subarray(headerSize) : bytes;
          parts.push(stripped);
          totalSize += stripped.length;
        }
      }

      // Merge into single Uint8Array
      finalBytes = new Uint8Array(totalSize);
      let offset = 0;
      for (const part of parts) {
        finalBytes.set(part, offset);
        offset += part.length;
      }
      logger.log(`[TTS] concatenated ${totalSize} bytes from ${parts.length} chunks`);
    }

    cachedFile.write(finalBytes);
    logger.log(`[TTS] ✅ cache written — ${cachedFile.size} bytes, total ${Date.now() - fetchStart}ms`);

    return {
      audioUrl: cachedFile.uri,
      wordTimestamps: [],
      duration: 0,
    };
  } catch (error) {
    logger.log(`[TTS] ❌ downloadAudio ERROR:`, error);
    throw error;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Fetch audio from Cartesia TTS bytes endpoint.
 * Caches audio per text+voice combo — replay costs zero API tokens.
 * If a prefetch is already in progress, piggybacks on it instead of starting a new request.
 */
export async function streamDevotionalAudio(
  text: string,
  voiceId: string = '694f9389-aac1-45b6-b726-9d9369183238',
  onProgress?: (word: string, timestamp: number) => void
): Promise<TTSResult> {
  try {
    const key = hashKey(text, voiceId);
    const cachedFile = new File(Paths.cache, `tts_${key}.mp3`);

    logger.log(`[TTS] streamDevotionalAudio — key=${key}, textLen=${text.length}`);

    // Return cached audio if it exists and has content
    if (cachedFile.exists && cachedFile.size > 0) {
      logger.log(`[TTS] cache HIT — size=${cachedFile.size}, uri=${cachedFile.uri}`);
      return {
        audioUrl: cachedFile.uri,
        wordTimestamps: [],
        duration: 0,
      };
    }
    logger.log('[TTS] cache MISS — downloading');

    // Rate limit check before making any network request
    try {
      const rateCheck = await checkRateLimit('tts');
      if (!rateCheck.allowed) {
        throw new Error('TTS rate limit reached. Please try again later.');
      }
    } catch (rateLimitError) {
      // If the error is our own rate limit message, propagate it
      if (rateLimitError instanceof Error && rateLimitError.message.includes('rate limit')) {
        throw rateLimitError;
      }
      // Otherwise fail open — don't block TTS if rate limit storage fails
      logger.warn('[TTS] Rate limit check failed, proceeding:', rateLimitError);
    }

    // If a prefetch (or prior call) is already downloading this exact audio, await it
    const existing = inFlightRequests.get(key);
    if (existing) {
      logger.log('[TTS] in-flight request found — piggybacking');
      try {
        return await existing;
      } catch {
        inFlightRequests.delete(key);
        logger.log('[TTS] piggybacked request failed — retrying');
      }
    }

    // Start fresh download and increment rate limit on success
    const promise = downloadAudio(text, voiceId, key).then(async (result) => {
      await incrementRateLimit('tts');
      return result;
    });
    inFlightRequests.set(key, promise);
    return promise;
  } catch (error) {
    reportError('tts-audio', error, { voiceId });
    throw error;
  }
}

/**
 * Prefetch audio in the background.
 * Call when the reading screen mounts — by the time the user taps play,
 * the audio is likely already cached and playback starts instantly.
 * Safe to call multiple times — deduped via in-flight map.
 */
export function prefetchDevotionalAudio(
  text: string,
  voiceId: string = '694f9389-aac1-45b6-b726-9d9369183238',
): void {
  const key = hashKey(text, voiceId);
  const cachedFile = new File(Paths.cache, `tts_${key}.mp3`);

  // Already cached — nothing to do
  if (cachedFile.exists && cachedFile.size > 0) return;

  // Already downloading — nothing to do
  if (inFlightRequests.has(key)) return;

  // Fire and forget — errors are swallowed (play will retry if needed)
  const promise = downloadAudio(text, voiceId, key);
  inFlightRequests.set(key, promise);
  promise.catch(() => {
    // Silently fail — the user hasn't asked to play yet
  });
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
