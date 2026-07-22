import { isStructuredWordStudy, normalizeWordStudy } from '@/lib/word-study';

describe('word study contract normalization', () => {
  it('accepts the prose shape emitted by the generation backend', () => {
    expect(normalizeWordStudy('  The Greek word describes a shared burden.  ')).toBe(
      'The Greek word describes a shared burden.',
    );
  });

  it('keeps the legacy structured mobile shape readable', () => {
    const result = normalizeWordStudy({
      term: 'yoke',
      original: 'zygos',
      meaning: 'A crossbar used to share a load.',
    });

    expect(isStructuredWordStudy(result)).toBe(true);
    expect(result).toEqual({
      term: 'yoke',
      original: 'zygos',
      meaning: 'A crossbar used to share a load.',
    });
  });

  it('drops partial or non-text shapes before they reach a renderer', () => {
    const partial = { term: 'yoke', original: 'zygos' };
    const wrongType = { term: 'yoke', original: 'zygos', meaning: 42 };

    expect(isStructuredWordStudy(partial)).toBe(false);
    expect(isStructuredWordStudy(wrongType)).toBe(false);
    expect(isStructuredWordStudy([])).toBe(false);
    expect(normalizeWordStudy(partial)).toBeUndefined();
    expect(normalizeWordStudy(wrongType)).toBeUndefined();
    expect(normalizeWordStudy([])).toBeUndefined();
    expect(normalizeWordStudy(null)).toBeUndefined();
  });
});
