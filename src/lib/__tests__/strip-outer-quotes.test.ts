import { stripOuterQuotes } from '@/lib/cn';

describe('stripOuterQuotes', () => {
  it('strips paired curly double quotes', () => {
    expect(stripOuterQuotes('“Be still and know.”')).toBe('Be still and know.');
  });

  it('strips paired straight double quotes', () => {
    expect(stripOuterQuotes('"Be still and know."')).toBe('Be still and know.');
  });

  it('strips an unbalanced leading double quote (dialogue opening mid-passage)', () => {
    expect(stripOuterQuotes('“Come to me, all who are weary')).toBe(
      'Come to me, all who are weary',
    );
  });

  it('strips paired single quotes', () => {
    expect(stripOuterQuotes('‘Peace I leave with you.’')).toBe('Peace I leave with you.');
    expect(stripOuterQuotes("'Peace I leave with you.'")).toBe('Peace I leave with you.');
  });

  it('preserves trailing possessive apostrophes', () => {
    expect(stripOuterQuotes('the disciples’')).toBe('the disciples’');
    expect(stripOuterQuotes('Jesus’')).toBe('Jesus’');
  });

  it('leaves internal quotes untouched', () => {
    expect(stripOuterQuotes('He said “rest” and meant it')).toBe(
      'He said “rest” and meant it',
    );
  });

  it('passes through empty and quote-free text', () => {
    expect(stripOuterQuotes('')).toBe('');
    expect(stripOuterQuotes('No quotes here.')).toBe('No quotes here.');
  });

  it('trims whitespace exposed by stripping', () => {
    expect(stripOuterQuotes('“ Be still ”')).toBe('Be still');
  });

  it('strips quote marks after leading scripture verse markers', () => {
    expect(stripOuterQuotes('¹⁰ "Be still and know that I am God."')).toBe(
      '¹⁰ Be still and know that I am God.',
    );
    expect(stripOuterQuotes('10 “Be still.”')).toBe('10 Be still.');
  });
});
