/* eslint-disable import/first */
const mockIsScripturePracticeEnabled = jest.fn(() => true);
jest.mock('../scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => mockIsScripturePracticeEnabled(),
}));

import { PRACTICE_ANSWER_MAX_CHARS } from '../scripture-practice';
import {
  QA_SAMPLE_NOTE_LABEL,
  QA_SAMPLE_NOTE_PLACEHOLDER,
  clearQaMethodReadingNotes,
  getQaMethodReadingNote,
  setQaMethodReadingNote,
} from '../qa-method-reading-notes';

describe('qa method reading sample notes', () => {
  beforeEach(() => {
    mockIsScripturePracticeEnabled.mockReturnValue(true);
    clearQaMethodReadingNotes();
  });

  it('keeps notes local, labeled as samples, and bounded', () => {
    expect(QA_SAMPLE_NOTE_LABEL.toLowerCase()).toContain('sample');
    expect(QA_SAMPLE_NOTE_LABEL.toLowerCase()).toContain('restarts');
    expect(QA_SAMPLE_NOTE_LABEL.toLowerCase()).toContain('journal');
    expect(QA_SAMPLE_NOTE_PLACEHOLDER.toLowerCase()).toContain('not saved');
    expect(setQaMethodReadingNote('lectio_divina', 'notice', 'a'.repeat(PRACTICE_ANSWER_MAX_CHARS + 8))).toBe(true);
    expect(getQaMethodReadingNote('lectio_divina', 'notice')).toHaveLength(PRACTICE_ANSWER_MAX_CHARS);
    expect(setQaMethodReadingNote('not_a_method', 'notice', 'nope')).toBe(false);
    expect(getQaMethodReadingNote('not_a_method', 'notice')).toBe('');
    expect(setQaMethodReadingNote('lectio_divina', 'notice', '')).toBe(true);
    expect(getQaMethodReadingNote('lectio_divina', 'notice')).toBe('');
  });

  it('keeps identical section ids isolated by method', () => {
    expect(setQaMethodReadingNote('lectio_divina', 'notice', 'lectio draft')).toBe(true);
    expect(setQaMethodReadingNote('inductive_oia', 'notice', 'inductive draft')).toBe(true);
    expect(getQaMethodReadingNote('lectio_divina', 'notice')).toBe('lectio draft');
    expect(getQaMethodReadingNote('inductive_oia', 'notice')).toBe('inductive draft');
  });

  it('refuses writes when the QA gate is off', () => {
    expect(setQaMethodReadingNote('lectio_divina', 'notice', 'kept')).toBe(true);
    mockIsScripturePracticeEnabled.mockReturnValue(false);
    expect(setQaMethodReadingNote('lectio_divina', 'notice', 'changed')).toBe(false);
    expect(getQaMethodReadingNote('lectio_divina', 'notice')).toBe('');
  });
});
