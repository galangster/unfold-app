import { getScripturePractice } from '@/constants/scripture-practices';
import { PRACTICE_ANSWER_MAX_CHARS } from '@/lib/scripture-practice';
import { isScripturePracticeEnabled } from '@/lib/scripture-practice-feature';

export const QA_SAMPLE_NOTE_LABEL =
  'Sample note. It lasts until the app restarts. It is not a journal note.';
export const QA_SAMPLE_NOTE_PLACEHOLDER = 'Sample note. Not saved to your journal.';

const notes = new Map<string, string>();

function isMethodId(value: unknown): value is string {
  return typeof value === 'string' && getScripturePractice(value) != null;
}

function noteKey(methodId: string, sectionId: string): string {
  return `${methodId}:${sectionId}`;
}

export function getQaMethodReadingNote(methodId: string, sectionId: string): string {
  if (!isScripturePracticeEnabled() || !isMethodId(methodId) || sectionId.length === 0) {
    return '';
  }
  return notes.get(noteKey(methodId, sectionId)) ?? '';
}

export function setQaMethodReadingNote(methodId: string, sectionId: string, value: string): boolean {
  if (!isScripturePracticeEnabled() || !isMethodId(methodId) || sectionId.length === 0) {
    return false;
  }
  const next = value.slice(0, PRACTICE_ANSWER_MAX_CHARS);
  if (next.length === 0) {
    notes.delete(noteKey(methodId, sectionId));
    return true;
  }
  notes.set(noteKey(methodId, sectionId), next);
  return true;
}

export function clearQaMethodReadingNotes(): void {
  notes.clear();
}
