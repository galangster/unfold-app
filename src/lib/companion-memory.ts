/**
 * Companion Memory — persistent topic tracking across conversations.
 *
 * Extracts verse references and themes from chat messages,
 * stores in MMKV, and provides a compact prompt fragment
 * for system prompt injection (Phase 4: Companion Intelligence).
 *
 * No AI calls — simple keyword + regex extraction.
 */
import { mmkvStorage } from './mmkv-storage';
import { sanitizeForPrompt } from '@/lib/api-config';

const MEMORY_KEY = 'companion-conversation-memory';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PrayerRequest {
  text: string;
  addedAt: number;
}

interface CompanionMemory {
  topics: string[];
  versesMentioned: string[];
  prayerRequests: (string | PrayerRequest)[];  // supports legacy string format
  lastUpdated: number;
}

// ── Topic keywords ─────────────────────────────────────────────────────────────

const TOPIC_KEYWORDS = [
  'anxiety', 'stress', 'grief', 'loss', 'doubt', 'faith', 'prayer',
  'marriage', 'family', 'work', 'purpose', 'calling', 'forgiveness',
  'anger', 'fear', 'gratitude', 'worship', 'baptism', 'church',
  'relationship', 'loneliness', 'depression', 'hope', 'healing',
  'temptation', 'sin', 'grace', 'love', 'patience', 'suffering',
  'joy', 'peace', 'trust', 'salvation', 'parenting', 'finances',
  'identity', 'shame', 'guilt', 'courage', 'obedience', 'waiting',
];

const PRAYER_INDICATORS = [
  'pray for', 'pray about', 'pray with me', 'prayer request',
  'need prayer', 'praying for', 'please pray',
];

// ── Core functions ─────────────────────────────────────────────────────────────

export function getCompanionMemory(): CompanionMemory | null {
  try {
    const raw = mmkvStorage.getItem(MEMORY_KEY) as string | null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Extract and persist topics, verses, and prayer requests from conversation.
 * Called after each completed conversation exchange.
 */
export function updateCompanionMemory(
  messages: Array<{ role: string; content: string }>
): void {
  const existing = getCompanionMemory() || {
    topics: [],
    versesMentioned: [],
    prayerRequests: [],
    lastUpdated: 0,
  };

  // Extract verse references from all messages
  const versePattern = /\[([A-Z1-3][a-z]+ \d+:\d+(?:-\d+)?)\]/g;
  const newVerses: string[] = [];
  for (const msg of messages) {
    let match;
    while ((match = versePattern.exec(msg.content)) !== null) {
      const ref = match[1];
      if (!existing.versesMentioned.includes(ref) && !newVerses.includes(ref)) {
        newVerses.push(ref);
      }
    }
  }

  // Extract topics from user messages
  const userTexts = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.toLowerCase());

  const newTopics: string[] = [];
  for (const keyword of TOPIC_KEYWORDS) {
    if (
      userTexts.some((text) => text.includes(keyword)) &&
      !existing.topics.includes(keyword)
    ) {
      newTopics.push(keyword);
    }
  }

  // Extract prayer requests from user messages (sanitized to prevent prompt injection)
  const newPrayers: PrayerRequest[] = [];
  const existingTexts = existing.prayerRequests.map((p) =>
    typeof p === 'string' ? p : p.text
  );
  for (const text of userTexts) {
    for (const indicator of PRAYER_INDICATORS) {
      const idx = text.indexOf(indicator);
      if (idx >= 0) {
        const raw = text
          .slice(idx + indicator.length)
          .trim()
          .slice(0, 80)
          .split(/[.!?]/)[0]
          .trim();
        const rest = sanitizeForPrompt(raw, 80);
        if (rest && !existingTexts.includes(rest)) {
          newPrayers.push({ text: rest, addedAt: Date.now() });
        }
      }
    }
  }

  // Update — keep recent items, trim old
  const updated: CompanionMemory = {
    topics: [...existing.topics, ...newTopics].slice(-20),
    versesMentioned: [...existing.versesMentioned, ...newVerses].slice(-15),
    prayerRequests: [...existing.prayerRequests, ...newPrayers].slice(-5),
    lastUpdated: Date.now(),
  };

  mmkvStorage.setItem(MEMORY_KEY, JSON.stringify(updated));
}

/**
 * Clear all conversation memory.
 */
export function clearCompanionMemory(): void {
  mmkvStorage.removeItem(MEMORY_KEY);
}
