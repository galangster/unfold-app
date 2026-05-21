import type { ScriptureExplainRequest } from './scripture-explain-api';

interface BibleVerseForExplanation {
  verse: number;
  text: string;
}

interface BuildSelectedPassageForExplanationInput {
  verses: BibleVerseForExplanation[] | null | undefined;
  selectedVerses: Set<number>;
  bookName: string;
  chapter: number;
  translation: string;
}

export function buildSelectedPassageForExplanation({
  verses,
  selectedVerses,
  bookName,
  chapter,
  translation,
}: BuildSelectedPassageForExplanationInput): ScriptureExplainRequest | null {
  if (!verses || selectedVerses.size === 0 || !bookName.trim()) return null;

  const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
  const selectedTexts = sorted
    .map((verseNumber) => verses.find((verse) => verse.verse === verseNumber)?.text.trim() ?? '')
    .filter((text) => text.length > 0);

  if (selectedTexts.length === 0) return null;

  const verseStart = sorted[0];
  const verseEnd = sorted[sorted.length - 1];
  const reference = verseStart === verseEnd
    ? `${bookName.trim()} ${chapter}:${verseStart}`
    : `${bookName.trim()} ${chapter}:${verseStart}-${verseEnd}`;

  return {
    reference,
    passageText: selectedTexts.join(' '),
    translation: translation.trim().toUpperCase() || 'BSB',
    source: 'bible-reader',
  };
}
