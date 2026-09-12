import { ALL_METHOD_IDS, BIBLE_STUDY_METHODS } from '../bible-study-methods';
import {
  SCRIPTURE_PRACTICES,
  getScripturePractice,
  type ScripturePracticeKind,
} from '../scripture-practices';

const KINDS: ReadonlySet<ScripturePracticeKind> = new Set([
  'notes',
  'sequence',
  'notice',
  'pause',
  'memory',
  'compare',
  'retell',
  'trace',
]);

function practiceText(id: string): string {
  const practice = SCRIPTURE_PRACTICES[id];
  return [
    practice.title,
    practice.intro,
    ...practice.steps.flatMap((step) => [step.title, step.prompt, step.inputLabel ?? '', ...(step.choices ?? [])]),
  ].join('\n');
}

describe('scripture practice catalog', () => {
  it('covers every current method id exactly once', () => {
    expect(Object.keys(SCRIPTURE_PRACTICES).sort()).toEqual([...ALL_METHOD_IDS].sort());
    expect(ALL_METHOD_IDS).toHaveLength(32);
  });

  it('keeps 2-4 compact authored steps with reusable kinds, not identical copy', () => {
    const signatures = new Set<string>();

    for (const id of ALL_METHOD_IDS) {
      const practice = getScripturePractice(id);
      expect(practice).not.toBeNull();
      expect(practice?.id).toBe(id);
      expect(KINDS.has(practice!.kind)).toBe(true);
      expect(practice!.steps.length).toBeGreaterThanOrEqual(2);
      expect(practice!.steps.length).toBeLessThanOrEqual(4);

      const stepIds = practice!.steps.map((step) => step.id);
      expect(new Set(stepIds).size).toBe(stepIds.length);

      const signature = practice!.steps.map((step) => `${step.title}\n${step.prompt}`).join('||');
      expect(signatures.has(signature)).toBe(false);
      signatures.add(signature);

      expect(practiceText(id)).not.toMatch(/STUDY METHOD:/);
    }

    expect(signatures.size).toBe(32);
    expect(new Set(Object.values(SCRIPTURE_PRACTICES).map((practice) => practice.kind)).size).toBe(8);
  });

  it('does not reuse generation promptModifier as reader copy', () => {
    for (const id of ALL_METHOD_IDS) {
      const modifier = BIBLE_STUDY_METHODS[id].promptModifier;
      const firstLine = modifier.split('\n')[0]?.trim();
      const reader = practiceText(id);
      expect(reader).not.toContain(modifier);
      if (firstLine) expect(reader).not.toContain(firstLine);
    }
  });

  it('keeps word study inside the local wording', () => {
    expect(practiceText('word_study')).not.toMatch(/greek|hebrew|lemma|strong'?s/i);
    expect(practiceText('verse_mapping')).not.toMatch(/greek|hebrew/i);
  });

  it('lets lament remain unresolved', () => {
    const lament = practiceText('lament_study');
    expect(lament).not.toMatch(/must praise|now praise|force(?:d)? praise|required praise/i);
    expect(lament).toMatch(/if not, let the lament stand/i);
  });

  it('compares only installed BSB and KJV', () => {
    const compare = SCRIPTURE_PRACTICES.comparative_translation;
    expect(compare.kind).toBe('compare');
    expect(practiceText('comparative_translation')).toMatch(/BSB/);
    expect(practiceText('comparative_translation')).toMatch(/KJV/);

    for (const id of ALL_METHOD_IDS) {
      if (id === 'comparative_translation') continue;
      expect(practiceText(id)).not.toMatch(/\bESV\b|\bNLT\b|\bMSG\b|The Message/);
    }
  });

  it('selects memory and cross-reference controls for the relevant methods', () => {
    expect(SCRIPTURE_PRACTICES.scripture_meditation.kind).toBe('memory');

    for (const id of ['typological', 'cross_reference', 'thematic_thread', 'redemptive_historical', 'covenant_study']) {
      expect(SCRIPTURE_PRACTICES[id].kind).toBe('trace');
    }
  });

  it('returns null for missing or unknown methods', () => {
    expect(getScripturePractice()).toBeNull();
    expect(getScripturePractice('not_a_method')).toBeNull();
  });
});
