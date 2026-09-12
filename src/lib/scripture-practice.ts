import { getScripturePractice } from '../constants/scripture-practices';
import { BOOK_BY_ID, formatScriptureReference, referenceToRoute } from './bible-constants';
import { isDevotionalDaySelectable } from './devotional-day-access';
import { isDevotionalArchived } from './devotional-lifecycle';
import type { Devotional } from './store';

export const PRACTICE_ANSWER_MAX_CHARS = 2000;
export const PRACTICE_SESSION_LIMIT = 64;

export type PracticeHostTab = '(today)' | '(study)';
export type PracticeDestination = 'practice' | 'reading';
export type PracticeReadingMode = 'app' | 'physical';

export interface PracticeTarget {
  devotionalId: string;
  dayNumber: number;
  hostTab: PracticeHostTab;
  methodId: string;
}

export interface PracticeSession {
  step: number;
  answers: Record<string, string>;
  completed: boolean;
  readingMode: PracticeReadingMode | null;
}

export interface PracticeReturn {
  target: PracticeTarget;
  destination: PracticeDestination;
}

export interface PracticePassage {
  reference: string;
  chapterReference: string;
  bookId: number;
  chapter: number;
  verse: number;
}

export function practiceSessionKey(target: PracticeTarget): string {
  return `${target.devotionalId}:${target.dayNumber}:${target.methodId}`;
}

export function getPracticePassage(reference: string): PracticePassage | null {
  const parsed = referenceToRoute(reference);
  if (!parsed) return null;

  const book = BOOK_BY_ID[parsed.bookId];
  if (!book) return null;

  const verse = parsed.verse && parsed.verse > 0 ? parsed.verse : 1;

  return {
    reference: formatScriptureReference(book.name, parsed.chapter, parsed.verse, parsed.verseEnd),
    chapterReference: formatScriptureReference(book.name, parsed.chapter),
    bookId: parsed.bookId,
    chapter: parsed.chapter,
    verse,
  };
}

function isHostTab(value: unknown): value is PracticeHostTab {
  return value === '(today)' || value === '(study)';
}

function isDestination(value: unknown): value is PracticeDestination {
  return value === 'practice' || value === 'reading';
}

function isPracticeTarget(value: unknown): value is PracticeTarget {
  if (value == null || typeof value !== 'object') return false;
  const target = value as PracticeTarget;
  return (
    typeof target.devotionalId === 'string'
    && target.devotionalId.length > 0
    && Number.isInteger(target.dayNumber)
    && target.dayNumber >= 1
    && isHostTab(target.hostTab)
    && typeof target.methodId === 'string'
    && getScripturePractice(target.methodId) != null
  );
}

export function resolvePracticeReturn(
  context: PracticeReturn | null,
  devotionals: Devotional[],
  currentDevotionalId: string | null,
): PracticeReturn | null {
  if (!context || !isDestination(context.destination) || !isPracticeTarget(context.target)) {
    return null;
  }

  const { target } = context;
  if (currentDevotionalId == null || target.devotionalId !== currentDevotionalId) {
    return null;
  }

  const devotional = devotionals.find((item) => item.id === target.devotionalId);
  if (!devotional || isDevotionalArchived(devotional)) {
    return null;
  }

  if (!isDevotionalDaySelectable(devotional, target.dayNumber)) {
    return null;
  }

  return context;
}

/** Preserve an interrupted practice when its reader regains focus. */
export function readingPracticeReturn(previous: PracticeReturn | null, target: PracticeTarget): PracticeReturn {
  if (previous?.destination === 'practice' && isPracticeTarget(previous.target)
    && previous.target.devotionalId === target.devotionalId
    && previous.target.dayNumber === target.dayNumber
    && previous.target.hostTab === target.hostTab) return previous;
  return { target, destination: 'reading' };
}

function boundAnswer(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length <= PRACTICE_ANSWER_MAX_CHARS
    ? value
    : value.slice(0, PRACTICE_ANSWER_MAX_CHARS);
}

function boundAnswers(
  answers: Record<string, string> | undefined,
  allowedStepIds: ReadonlySet<string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  if (!answers) return next;

  for (const [key, value] of Object.entries(answers)) {
    if (!allowedStepIds.has(key)) continue;
    next[key] = boundAnswer(value);
  }

  return next;
}

function boundReadingMode(value: unknown, fallback: PracticeReadingMode | null): PracticeReadingMode | null {
  if (value === 'app' || value === 'physical' || value === null) return value;
  return fallback;
}

export function applyPracticeSessionPatch(
  target: PracticeTarget,
  current: PracticeSession | undefined,
  patch: Partial<PracticeSession>,
): PracticeSession | null {
  if (!isPracticeTarget(target)) return null;

  const practice = getScripturePractice(target.methodId);
  if (!practice) return null;

  const allowedStepIds = new Set(practice.steps.flatMap((step) => step.choices?.length ? [step.id, `${step.id}__choice`] : [step.id]));
  const base: PracticeSession = current ?? {
    step: 0,
    answers: {},
    completed: false,
    readingMode: null,
  };

  const mergedAnswers = patch.answers
    ? boundAnswers({ ...base.answers, ...patch.answers }, allowedStepIds)
    : boundAnswers(base.answers, allowedStepIds);

  const maxStep = Math.max(0, practice.steps.length - 1);
  const requestedStep = patch.step ?? base.step;
  const step = Number.isInteger(requestedStep)
    ? Math.min(Math.max(0, requestedStep), maxStep)
    : base.step;

  return {
    step,
    answers: mergedAnswers,
    completed: typeof patch.completed === 'boolean' ? patch.completed : base.completed,
    readingMode: boundReadingMode(
      patch.readingMode !== undefined ? patch.readingMode : base.readingMode,
      base.readingMode,
    ),
  };
}

export function boundPracticeSessions(
  sessions: Record<string, PracticeSession>,
  nextKey: string,
  nextSession: PracticeSession,
): Record<string, PracticeSession> {
  const ordered = Object.keys(sessions).filter((key) => key !== nextKey);
  ordered.push(nextKey);

  const overflow = Math.max(0, ordered.length - PRACTICE_SESSION_LIMIT);
  const kept = ordered.slice(overflow);
  const next: Record<string, PracticeSession> = {};

  for (const key of kept) {
    next[key] = key === nextKey ? nextSession : sessions[key];
  }

  return next;
}
