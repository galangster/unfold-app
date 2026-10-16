/**
 * What the app already wrote for this reader, kept so the next request can
 * tell the model not to repeat it.
 *
 * Each feature records its new lines when it caches an entry: one capped
 * JSON array, newest first, under a fixed key in that feature's own MMKV
 * instance. A full reset clears the instance and its history together.
 */

import { sanitizeForPrompt } from '@/lib/api-config';
import { trimTrailing } from '@/lib/bridge-text';
import { logger } from '@/lib/logger';

/** The part of an MMKV instance a history needs, so this module stays free of MMKV. */
export interface HistoryStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

export interface PromptHistory<T> {
  /** The recorded entries, newest first. A missing or unreadable history reads as empty. */
  read(): T[];
  /** Puts `entry` first and keeps the newest entries up to the limit. */
  record(entry: T): void;
}

/**
 * The history kept under `key`. A storage failure costs only the avoid list,
 * never the entry the feature is writing.
 */
export function promptHistory<T>(
  store: HistoryStore,
  key: string,
  limit: number,
  isEntry: (value: unknown) => value is T,
): PromptHistory<T> {
  const read = (): T[] => {
    try {
      const raw = store.getString(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch (error) {
      logger.warn(`[PromptHistory] could not read ${key}`, error instanceof Error ? error.message : error);
      return [];
    }
  };
  return {
    read,
    record(entry) {
      try {
        store.set(key, JSON.stringify([entry, ...read()].slice(0, limit)));
      } catch (error) {
        logger.warn(`[PromptHistory] could not record ${key}`, error instanceof Error ? error.message : error);
      }
    },
  };
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

const OPENING_END = '.,;:!?…"\'”’)]';

/** The first `count` words of `text`, without the punctuation that ends them. */
export function openingWords(text: string, count = 4): string {
  return trimTrailing(text.trim().split(/\s+/).slice(0, count).join(' '), OPENING_END);
}

/**
 * `line` with the reader's name replaced by "[name]", so a line kept from a
 * morning that used the name cannot carry it into a request on a morning
 * that withholds it. The whole name and each of its words count, as whole
 * words in any case, unless the match starts with a lowercase letter: a
 * name is written with a capital, and "grace" in a sentence is not Grace.
 * A straight apostrophe in the name matches a curly one too.
 */
export function withoutName(line: string, name: string | null | undefined): string {
  const full = (name ?? '').trim();
  const forms = [...new Set([full, ...full.split(/\s+/)])]
    .filter((form) => form.length > 1)
    .sort((a, b) => b.length - a.length);
  return forms.reduce((text, form) => {
    const body = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+');
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?![\\p{L}\\p{N}])`, 'giu');
    return text.replace(pattern, (whole: string, before: string, found: string) =>
      found[0] === found[0].toUpperCase() ? `${before}[name]` : whole,
    );
  }, line);
}

/** The lines with repeats removed, in first-seen order. Case and punctuation do not make two lines different. */
function uniqueLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const identity = trimmed.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    unique.push(trimmed);
  }
  return unique;
}

/**
 * The lines as one prompt block under `heading`: each sanitized and cut to
 * `maxChars`, with repeats removed. '' when there are no lines.
 */
export function avoidList(heading: string, lines: readonly string[], maxChars: number): string {
  const unique = uniqueLines(lines.map((line) => sanitizeForPrompt(line, maxChars)));
  return unique.length > 0 ? `${heading}\n${unique.map((line) => `- ${line}`).join('\n')}` : '';
}
