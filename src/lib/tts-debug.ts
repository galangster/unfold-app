/**
 * TTS Debug Instrumentation
 *
 * Temporary diagnostic module to find where the JS thread freezes
 * during Fish Audio TTS playback. Remove after debugging.
 *
 * Usage: import { ttsDebug } from '@/lib/tts-debug' in tts-service.ts and useGlobalAudioPlayer.ts
 */

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatCount = 0;
let sessionStart = 0;

const PREFIX = '[TTS-DEBUG]';

/** Start a JS thread heartbeat — logs every 500ms. When it stops, the thread is blocked. */
export function startHeartbeat(label: string): void {
  stopHeartbeat();
  heartbeatCount = 0;
  sessionStart = Date.now();
  console.log(`${PREFIX} ===== HEARTBEAT START: ${label} =====`);
  heartbeatInterval = setInterval(() => {
    heartbeatCount++;
    console.log(`${PREFIX} heartbeat #${heartbeatCount} (${Date.now() - sessionStart}ms elapsed)`);
  }, 500);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    console.log(`${PREFIX} ===== HEARTBEAT STOP (${heartbeatCount} beats, ${Date.now() - sessionStart}ms) =====`);
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/** Log a timestamped checkpoint. Use before and after each suspect operation. */
export function checkpoint(step: string, data?: Record<string, unknown>): void {
  const ts = Date.now();
  const elapsed = sessionStart ? `+${ts - sessionStart}ms` : `${ts}`;
  const extra = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`${PREFIX} [${elapsed}] ${step}${extra}`);
}

/** Validate an audio file and log details without loading it into JS. */
export async function validateAudioFile(uri: string): Promise<{ valid: boolean; size: number; headerHex: string }> {
  checkpoint('validateAudioFile START', { uri });

  try {
    const { getInfoAsync, readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');

    const info = await getInfoAsync(uri);
    if (!info.exists) {
      checkpoint('validateAudioFile: FILE DOES NOT EXIST');
      return { valid: false, size: 0, headerHex: '' };
    }

    const size = (info as any).size ?? 0;
    checkpoint('validateAudioFile: file exists', { size });

    // Read first 16 bytes as base64 to check MP3 header
    // MP3 files start with 0xFF 0xFB or 0x49 0x44 0x33 (ID3 tag)
    let headerHex = '';
    try {
      const headerB64 = await readAsStringAsync(uri, {
        encoding: EncodingType.Base64,
        length: 16,
        position: 0,
      });
      // Convert base64 to hex for readable logging
      const bytes = atob(headerB64);
      headerHex = Array.from(bytes, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
      checkpoint('validateAudioFile: header bytes', { headerHex });

      // Check for valid MP3 signatures
      const isMP3Sync = bytes.charCodeAt(0) === 0xFF && (bytes.charCodeAt(1) & 0xE0) === 0xE0;
      const isID3 = bytes.charCodeAt(0) === 0x49 && bytes.charCodeAt(1) === 0x44 && bytes.charCodeAt(2) === 0x33;
      const isValidMP3 = isMP3Sync || isID3;

      checkpoint('validateAudioFile: format check', { isMP3Sync, isID3, isValidMP3 });

      if (!isValidMP3) {
        // Might be an error response (JSON/HTML) saved as .mp3
        try {
          const textContent = await readAsStringAsync(uri, {
            encoding: EncodingType.UTF8,
            length: 200,
            position: 0,
          });
          checkpoint('validateAudioFile: NOT VALID MP3 — file content preview', { textContent });
        } catch { /* ignore */ }
      }

      return { valid: isValidMP3 && size > 1024, size, headerHex };
    } catch (e) {
      checkpoint('validateAudioFile: header read failed', { error: String(e) });
      return { valid: false, size, headerHex: '' };
    }
  } catch (e) {
    checkpoint('validateAudioFile ERROR', { error: String(e) });
    return { valid: false, size: 0, headerHex: '' };
  }
}
