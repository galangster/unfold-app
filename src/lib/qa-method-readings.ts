import { getScripturePractice } from '@/constants/scripture-practices';
import rawArtifact from '@/data/qa-method-readings.json';
import { expectedVerseNumbers, versesMatchExpected } from '@/lib/bible-verse-integrity';
import { isScripturePracticeEnabled } from '@/lib/scripture-practice-feature';

export const QA_METHOD_READINGS_EMPTY_COPY =
  'No sample readings are available yet.';
export const QA_METHOD_READINGS_MALFORMED_COPY =
  'This sample library could not be read.';

export const QA_METHOD_SECTION_KINDS = [
  'reading',
  'notice',
  'reflection',
  'response',
  'prayer',
  'pause',
] as const;

export type QaMethodSectionKind = (typeof QA_METHOD_SECTION_KINDS)[number];

export interface QaMethodReadingVerse {
  verse: number;
  text: string;
}

export interface QaMethodReadingPassage {
  reference: string;
  translation: 'BSB' | 'KJV';
  bookId: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  verses: QaMethodReadingVerse[];
}

export interface QaMethodReadingSection {
  id: string;
  label: string;
  kind: QaMethodSectionKind;
  text: string;
  prompt: string;
}

export interface QaMethodReadingExample {
  id: string;
  methodId: string;
  methodName: string;
  title: string;
  introduction: string;
  passage: QaMethodReadingPassage;
  supportingPassages: QaMethodReadingPassage[];
  sections: QaMethodReadingSection[];
  provenance: {
    model: string;
    generatedAt: string;
  };
}

export const QA_METHOD_READINGS_MAX_EXAMPLES = 32;
export const QA_METHOD_READINGS_MAX_SECTIONS = 16;
export const QA_METHOD_READINGS_MAX_SUPPORTING_PASSAGES = 8;
export const QA_METHOD_READINGS_MAX_VERSES = 50;

export interface QaMethodReadingsCatalog {
  enabled: boolean;
  examples: QaMethodReadingExample[];
  error: string | null;
}

const SECTION_KIND_SET: ReadonlySet<string> = new Set(QA_METHOD_SECTION_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isMethodId(value: unknown): value is string {
  return typeof value === 'string' && getScripturePractice(value) != null;
}

function parseVerse(value: unknown): QaMethodReadingVerse | null {
  if (!isRecord(value)) return null;
  if (!Number.isInteger(value.verse) || (value.verse as number) < 1) return null;
  if (typeof value.text !== 'string' || value.text.length === 0) return null;
  return { verse: value.verse as number, text: value.text };
}

function parseSection(value: unknown): QaMethodReadingSection | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.label !== 'string' || value.label.length === 0) return null;
  if (typeof value.kind !== 'string' || !SECTION_KIND_SET.has(value.kind)) return null;
  if (typeof value.text !== 'string' || typeof value.prompt !== 'string') return null;
  return {
    id: value.id,
    label: value.label,
    kind: value.kind as QaMethodSectionKind,
    text: value.text,
    prompt: value.prompt,
  };
}

function parsePassage(value: unknown): QaMethodReadingPassage | null {
  if (!isRecord(value)) return null;
  if (typeof value.reference !== 'string' || value.reference.length === 0) return null;
  if (value.translation !== 'BSB' && value.translation !== 'KJV') return null;
  if (!Number.isInteger(value.bookId) || (value.bookId as number) < 1 || (value.bookId as number) > 66) {
    return null;
  }
  if (!Number.isInteger(value.chapter) || (value.chapter as number) < 1) return null;
  if (!Number.isInteger(value.verseStart) || (value.verseStart as number) < 1) return null;
  if (!Number.isInteger(value.verseEnd) || (value.verseEnd as number) < (value.verseStart as number)) {
    return null;
  }
  if (!Array.isArray(value.verses)) return null;
  const verses: QaMethodReadingVerse[] = [];
  for (const item of value.verses) {
    const verse = parseVerse(item);
    if (!verse) return null;
    verses.push(verse);
  }
  if (verses.length === 0 || verses.length > QA_METHOD_READINGS_MAX_VERSES) return null;
  const expected = expectedVerseNumbers({
    translation: value.translation,
    bookId: value.bookId as number,
    chapter: value.chapter as number,
    verseStart: value.verseStart as number,
    verseEnd: value.verseEnd as number,
  });
  if (!expected || !versesMatchExpected(verses, expected)) return null;
  return {
    reference: value.reference,
    translation: value.translation,
    bookId: value.bookId as number,
    chapter: value.chapter as number,
    verseStart: value.verseStart as number,
    verseEnd: value.verseEnd as number,
    verses,
  };
}

function parseSupportingPassages(value: unknown): QaMethodReadingPassage[] | null {
  if (!Array.isArray(value) || value.length > QA_METHOD_READINGS_MAX_SUPPORTING_PASSAGES) {
    return null;
  }
  const passages: QaMethodReadingPassage[] = [];
  for (const item of value) {
    const passage = parsePassage(item);
    if (!passage) return null;
    passages.push(passage);
  }
  return passages;
}

function parseExample(value: unknown, seen: Set<string>): QaMethodReadingExample | null {
  if (!isRecord(value)) return null;
  if (!isMethodId(value.methodId) || value.id !== value.methodId) return null;
  if (seen.has(value.methodId)) return null;
  if (typeof value.methodName !== 'string' || value.methodName.length === 0) return null;
  if (typeof value.title !== 'string' || value.title.length === 0) return null;
  if (typeof value.introduction !== 'string') return null;
  if (!isRecord(value.provenance)) return null;
  if (typeof value.provenance.model !== 'string' || value.provenance.model.length === 0) return null;
  if (typeof value.provenance.generatedAt !== 'string' || value.provenance.generatedAt.length === 0) {
    return null;
  }
  const passage = parsePassage(value.passage);
  const supportingPassages = parseSupportingPassages(value.supportingPassages);
  if (
    !passage
    || passage.translation !== 'BSB'
    || !supportingPassages
    || !Array.isArray(value.sections)
    || value.sections.length === 0
    || value.sections.length > QA_METHOD_READINGS_MAX_SECTIONS
  ) {
    return null;
  }
  const sections: QaMethodReadingSection[] = [];
  const sectionIds = new Set<string>();
  for (const item of value.sections) {
    const section = parseSection(item);
    if (!section || sectionIds.has(section.id)) return null;
    sectionIds.add(section.id);
    sections.push(section);
  }
  seen.add(value.methodId);
  return {
    id: value.methodId,
    methodId: value.methodId,
    methodName: value.methodName,
    title: value.title,
    introduction: value.introduction,
    passage,
    supportingPassages,
    sections,
    provenance: {
      model: value.provenance.model,
      generatedAt: value.provenance.generatedAt,
    },
  };
}

/** Pure seam. Accepts any JSON value and never throws. */
export function parseQaMethodReadingsArtifact(value: unknown): {
  examples: QaMethodReadingExample[];
  error: string | null;
} {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.examples)) {
    return { examples: [], error: QA_METHOD_READINGS_MALFORMED_COPY };
  }

  const examples: QaMethodReadingExample[] = [];
  const seen = new Set<string>();
  for (const item of value.examples) {
    if (examples.length >= QA_METHOD_READINGS_MAX_EXAMPLES) break;
    const example = parseExample(item, seen);
    if (example) examples.push(example);
  }

  if (value.examples.length > 0 && examples.length === 0) {
    return { examples: [], error: QA_METHOD_READINGS_MALFORMED_COPY };
  }

  return { examples, error: null };
}

export function loadQaMethodReadings(): QaMethodReadingsCatalog {
  if (!isScripturePracticeEnabled()) {
    return { enabled: false, examples: [], error: null };
  }
  const parsed = parseQaMethodReadingsArtifact(rawArtifact);
  return { enabled: true, ...parsed };
}

export function findQaMethodReading(
  examples: readonly QaMethodReadingExample[],
  methodId: string | null | undefined,
): QaMethodReadingExample | null {
  if (!isMethodId(methodId)) return null;
  return examples.find((example) => example.methodId === methodId) ?? null;
}

export function buildQaMethodBibleHref(passage: QaMethodReadingPassage): string {
  return `/(tabs)/(bible)/reader?bookId=${passage.bookId}&chapter=${passage.chapter}&verse=${passage.verseStart}`;
}

export function sectionAllowsSampleInput(prompt: string): boolean {
  return prompt.length > 0;
}
