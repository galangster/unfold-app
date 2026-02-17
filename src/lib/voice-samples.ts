import { CARTESIA_VOICES } from './cartesia';

// Sample text for voice previews
const SAMPLE_TEXT = "Let the peace of Christ rule in your hearts, since as members of one body you were called to peace.";

// Generate sample audio URLs (these would be pre-generated and hosted)
// For now, we'll generate them on-demand or use a placeholder approach
export const VOICE_SAMPLES: Record<string, string> = {
  // These would be actual URLs to pre-generated MP3 files
  // Example: 'voice-id': 'https://cdn.unfold.app/voices/sample-katie.mp3'
};

// Function to generate a sample audio using Cartesia API
export async function generateVoiceSample(voiceId: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.cartesia.ai/tts/sse', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: SAMPLE_TEXT,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 24000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate sample: ${response.status}`);
    }

    // For SSE streaming, we'd need to handle the stream properly
    // This is a simplified version - in production, you'd want to:
    // 1. Stream the audio to a file
    // 2. Upload to your CDN
    // 3. Return the CDN URL
    
    return null; // Placeholder
  } catch (error) {
    console.error('Error generating voice sample:', error);
    return null;
  }
}

// For now, we'll use a simple approach: generate samples on first play
// In production, these should be pre-generated and hosted on a CDN