/**
 * Centralized API configuration
 *
 * Single source of truth for backend URLs and authenticated request headers.
 * All service files should import from here instead of defining their own URLs.
 */
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Backend URL (single definition — used by all service files)
// ---------------------------------------------------------------------------

export const RAILWAY_BACKEND_URL = 'https://unfold-backend-production.up.railway.app';

export const PRIMARY_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || RAILWAY_BACKEND_URL;

export function getBackendCandidates(): string[] {
  const candidates = [PRIMARY_BACKEND_URL];
  if (!candidates.includes(RAILWAY_BACKEND_URL)) {
    candidates.push(RAILWAY_BACKEND_URL);
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Authenticated headers — sends Firebase ID token when available
// ---------------------------------------------------------------------------

/**
 * Build request headers with Firebase ID token for backend authentication.
 * Falls back gracefully to unauthenticated headers if Firebase is unavailable
 * (local-only mode, anonymous users).
 */
export async function getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const auth = require('@react-native-firebase/auth').default;
    const user = auth().currentUser;
    if (user) {
      const idToken = await user.getIdToken(forceRefresh);
      headers['Authorization'] = `Bearer ${idToken}`;
    }
  } catch {
    // Firebase not available — continue without auth header (local-only mode)
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Prompt sanitization — defends against prompt injection
// ---------------------------------------------------------------------------

/**
 * Sanitize user-provided text before interpolating into AI prompts.
 *
 * Defends against prompt injection by:
 * 1. Truncating to a reasonable length
 * 2. Stripping common injection patterns
 * 3. Removing delimiter-like syntax that could break prompt structure
 *
 * This is defense-in-depth — the backend should also validate, but
 * client-side sanitization reduces the attack surface.
 */
export function sanitizeForPrompt(text: string, maxLength = 2000): string {
  let cleaned = text.slice(0, maxLength);

  // Normalize Unicode to catch homoglyph bypass attacks (Cyrillic 'о' → Latin 'o', etc.)
  // Wrapped in try-catch: Hermes may not support String.prototype.normalize()
  try { cleaned = cleaned.normalize('NFKC'); } catch {};

  // Remove code fence markers that could break prompt structure
  cleaned = cleaned.replace(/```/g, '');

  // Remove XML/HTML-like tags that could interfere with prompt delimiters
  cleaned = cleaned.replace(/<\/?(?:system|user|assistant|prompt|instruction)[^>]*>/gi, '');

  // Remove LLM prompt delimiters used by various models
  cleaned = cleaned.replace(/\[(?:SYSTEM|INST|\/INST|SYS|\/SYS)\]/gi, '');
  cleaned = cleaned.replace(/<<\/?SYS>>/gi, '');
  cleaned = cleaned.replace(/<\|(?:im_start|im_end|system|user|assistant)\|>/gi, '');

  // Remove "ignore previous instructions" patterns
  cleaned = cleaned.replace(
    /\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions?|prompts?|rules?|guidelines?)/gi,
    ''
  );

  // Remove "you are now" role reassignment attempts
  cleaned = cleaned.replace(
    /\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as|switch\s+to)\b/gi,
    ''
  );

  // Remove attempts to extract system prompts
  cleaned = cleaned.replace(
    /\b(?:output|print|show|reveal|display|repeat)\s+(?:the\s+)?(?:system\s+)?(?:prompt|instructions?|rules?)\b/gi,
    ''
  );

  // Clean up excess whitespace from removals
  cleaned = cleaned.replace(/\s{3,}/g, '  ').trim();

  return cleaned;
}
