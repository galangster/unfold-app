import { deriveLockLine } from '@/lib/widget-lock-line';

/** A one-sentence string of exactly `length` characters, ending in a period. */
const sentenceOf = (length: number) => `${'a'.repeat(length - 1)}.`;

describe('deriveLockLine (UnfoldVerse lock-screen line)', () => {
  it('returns the first sentence when it is 28 to 84 characters long', () => {
    expect(
      deriveLockLine(
        'Come to Me, all you who are weary and burdened, and I will give you rest. Take My yoke upon you...'
      )
    ).toBe('Come to Me, all you who are weary and burdened, and I will give you rest.');
  });

  it('skips short sentences and returns the first one that fits, keeping LORD as written', () => {
    expect(
      deriveLockLine(
        'Do you not know? Have you not heard? The LORD is the everlasting God, the Creator of the ends of the earth. He will not grow tired'
      )
    ).toBe('The LORD is the everlasting God, the Creator of the ends of the earth.');
  });

  it('treats 28 and 84 characters as inside the band', () => {
    expect(deriveLockLine(`${sentenceOf(27)} ${sentenceOf(28)}`)).toBe(sentenceOf(28));
    expect(deriveLockLine(`${sentenceOf(85)} ${sentenceOf(84)}`)).toBe(sentenceOf(84));
  });

  it('cuts a single 150-character sentence at the last ; , or — within 80 characters', () => {
    const sentence =
      'But those who wait on the LORD shall renew their strength; they shall mount up with wings as eagles, they shall run and not be weary, they shall walk.';
    expect(sentence).toHaveLength(150);
    expect(deriveLockLine(sentence)).toBe(
      'But those who wait on the LORD shall renew their strength…'
    );
  });

  it('cuts at the last space before 80 characters when no clause mark is in range', () => {
    expect(
      deriveLockLine(
        'Trust in the LORD with all your heart and lean not on your own understanding but in all your ways acknowledge Him and He will make your paths straight.'
      )
    ).toBe('Trust in the LORD with all your heart and lean not on your own understanding…');
  });

  it('falls back to the space cut when the clause cut would leave under 28 characters', () => {
    expect(
      deriveLockLine(
        'And He said to them, Go into all the world and preach the gospel to every creature and teach them to observe all that I have commanded you each day.'
      )
    ).toBe('And He said to them, Go into all the world and preach the gospel to every…');
  });

  it('keeps a short first sentence whole when no sentence fits the band', () => {
    expect(deriveLockLine('Jesus wept.')).toBe('Jesus wept.');
  });

  it('removes a closing quote that has no opening quote', () => {
    expect(
      deriveLockLine('Take My yoke upon you. For My yoke is easy and My burden is light.”')
    ).toBe('For My yoke is easy and My burden is light.');
  });

  it('keeps a quotation whose marks are paired', () => {
    expect(deriveLockLine('“Be still, and know that I am God.”')).toBe(
      '“Be still, and know that I am God.”'
    );
  });

  it('drops an opening quote that the sentence cut leaves without its partner', () => {
    expect(
      deriveLockLine(
        '“Come to Me, all you who are weary and burdened, and I will give you rest. Take My yoke upon you and learn from Me.”'
      )
    ).toBe('Come to Me, all you who are weary and burdened, and I will give you rest.');
  });

  it('normalizes whitespace before measuring', () => {
    expect(
      deriveLockLine(
        '  Come to Me,\n all you who are weary  and burdened,\tand I will give you rest.  '
      )
    ).toBe('Come to Me, all you who are weary and burdened, and I will give you rest.');
  });

  it('returns an empty string for empty or blank text', () => {
    expect(deriveLockLine('')).toBe('');
    expect(deriveLockLine('  \n\t ')).toBe('');
  });
});
