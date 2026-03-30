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

interface TimestampedEntry {
  text: string;
  addedAt: number;
}

interface PrayerRequest {
  text: string;
  addedAt: number;
  resolvedAt?: number;
}

interface CompanionMemory {
  topics: (string | TimestampedEntry)[];              // supports legacy string format
  versesMentioned: (string | TimestampedEntry)[];     // supports legacy string format
  prayerRequests: (string | PrayerRequest)[];         // supports legacy string format
  lastUpdated: number;
}

// ── Entry helpers (backward-compat with plain strings) ────────────────────────

function normalizeEntry(entry: string | TimestampedEntry): TimestampedEntry {
  if (typeof entry === 'string') return { text: entry, addedAt: Date.now() };
  return entry;
}

function entryText(entry: string | TimestampedEntry): string {
  return typeof entry === 'string' ? entry : entry.text;
}

// ── Pruning ───────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove topics and verses older than 30 days.
 * Prayer requests without a `resolvedAt` are kept regardless of age.
 */
export function pruneExpiredMemory(): void {
  const memory = getCompanionMemory();
  if (!memory) return;

  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const pruned: CompanionMemory = {
    topics: (memory.topics ?? [])
      .map(normalizeEntry)
      .filter(t => t.addedAt > cutoff),
    versesMentioned: (memory.versesMentioned ?? [])
      .map(normalizeEntry)
      .filter(v => v.addedAt > cutoff),
    prayerRequests: (memory.prayerRequests ?? [])
      .map(p => typeof p === 'string' ? { text: p, addedAt: Date.now() } as PrayerRequest : p)
      .filter(p => p.addedAt > cutoff || !p.resolvedAt),  // Keep unresolved prayers
    lastUpdated: Date.now(),
  };

  mmkvStorage.setItem(MEMORY_KEY, JSON.stringify(pruned));
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
  const existingVerseTexts = (existing.versesMentioned ?? []).map(entryText);
  const newVerses: TimestampedEntry[] = [];
  for (const msg of messages) {
    let match;
    while ((match = versePattern.exec(msg.content)) !== null) {
      const ref = match[1];
      if (
        !existingVerseTexts.includes(ref) &&
        !newVerses.some(v => v.text === ref)
      ) {
        newVerses.push({ text: ref, addedAt: Date.now() });
      }
    }
  }

  // Extract topics from user messages
  const userTexts = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.toLowerCase());

  const existingTopicTexts = (existing.topics ?? []).map(entryText);
  const newTopics: TimestampedEntry[] = [];
  for (const keyword of TOPIC_KEYWORDS) {
    if (
      userTexts.some((text) => text.includes(keyword)) &&
      !existingTopicTexts.includes(keyword)
    ) {
      newTopics.push({ text: keyword, addedAt: Date.now() });
    }
  }

  // Extract prayer requests from user messages (sanitized to prevent prompt injection)
  const newPrayers: PrayerRequest[] = [];
  const existingTexts = (existing.prayerRequests ?? []).map((p) =>
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
    topics: [...(existing.topics ?? []), ...newTopics].slice(-20),
    versesMentioned: [...(existing.versesMentioned ?? []), ...newVerses].slice(-15),
    prayerRequests: [...(existing.prayerRequests ?? []), ...newPrayers].slice(-5),
    lastUpdated: Date.now(),
  };

  mmkvStorage.setItem(MEMORY_KEY, JSON.stringify(updated));
}

/**
 * Returns plain string array of current topics (for conversation summaries).
 */
export function getTopicTags(): string[] {
  const memory = getCompanionMemory();
  if (!memory) return [];
  return (memory.topics ?? []).map(entryText);
}

/**
 * Clear all conversation memory.
 */
export function clearCompanionMemory(): void {
  mmkvStorage.removeItem(MEMORY_KEY);
}
