import { splitStreamingParagraphs } from '../streaming-paragraphs';

describe('splitStreamingParagraphs (WR-18)', () => {
  it('keeps everything in the tail before the first paragraph completes', () => {
    expect(splitStreamingParagraphs('God loves')).toEqual({ stable: '', tail: 'God loves' });
    expect(splitStreamingParagraphs('')).toEqual({ stable: '', tail: '' });
  });

  it('splits a completed paragraph into the stable prefix', () => {
    expect(splitStreamingParagraphs('First paragraph.\n\nSecond in prog')).toEqual({
      stable: 'First paragraph.',
      tail: 'Second in prog',
    });
  });

  it('always splits at the LAST blank-line boundary', () => {
    expect(splitStreamingParagraphs('One.\n\nTwo.\n\nThree in prog')).toEqual({
      stable: 'One.\n\nTwo.',
      tail: 'Three in prog',
    });
  });

  it('absorbs longer newline runs so the tail never leads with blank lines', () => {
    expect(splitStreamingParagraphs('One.\n\n\n\nTwo in prog')).toEqual({
      stable: 'One.',
      tail: 'Two in prog',
    });
  });

  it('leaves an empty tail right after a boundary arrives', () => {
    expect(splitStreamingParagraphs('One.\n\n')).toEqual({ stable: 'One.', tail: '' });
  });

  it('single newlines are not boundaries (soft-wrapped lines stay in the tail)', () => {
    expect(splitStreamingParagraphs('- a\n- b\n- c')).toEqual({ stable: '', tail: '- a\n- b\n- c' });
  });
});
