import { BIBLE_STUDY_METHODS } from '../bible-study-methods';

const sentenceLikePattern = /^[A-Z0-9"“]/;
const terminalPunctuationPattern = /[.!?"”]$/;

describe('Bible study method user-facing copy', () => {
  it('keeps every method description and texture ready for direct display', () => {
    const methods = Object.values(BIBLE_STUDY_METHODS);

    expect(methods).toHaveLength(32);

    for (const method of methods) {
      expect(method.name).toBeTruthy();
      expect(method.description).toMatch(sentenceLikePattern);
      expect(method.description).toMatch(terminalPunctuationPattern);
      expect(method.description).not.toMatch(/\bOT\b|cross-refs/i);

      expect(method.emotionalTexture).toMatch(sentenceLikePattern);
      expect(method.emotionalTexture).toMatch(terminalPunctuationPattern);
    }
  });

  it('keeps the prophetic literature sheet bullet sentence-cased', () => {
    expect(BIBLE_STUDY_METHODS.prophetic_study.description).toBe(
      'Forth-telling before foretelling — historical context first, then a bridge to today.',
    );
    expect(BIBLE_STUDY_METHODS.prophetic_study.emotionalTexture).toBe(
      'Urgent — bridging past and present.',
    );
  });
});
