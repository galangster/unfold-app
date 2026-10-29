import { crisisMentions, withCrisisLines } from '@/lib/crisis-words';

describe('crisisMentions', () => {
  it.each([
    'I feel suicidal tonight',
    'thinking about self harm again',
    'I keep thinking about killing myself',
    'I want to take my own life',
    'I want to end my own life',
    'I want to kill myself',
    'I don’t want to live anymore',
    'thinking about su1c1de',
    'thinking about s u i c i d e',
    'thinking about s.u.i.c.i.d.e',
    'thinking about s-u-i-c-i-d-e',
    'Some nights I want to k i l l myself',
    'Some nights I want to k i l l m y s e l f',
    'I want to e n d m y l i f e',
    'I want to d o n t w a n t t o l i v e',
    'thinking about s_u_i_c_i_d_e',
    'I feel s_u_i_c_i_d_a_l',
  ])('finds self-harm words in %p', (text) => {
    expect(crisisMentions(text)).toEqual({ selfHarm: true, abuse: false });
  });

  it.each([
    'My husband hits me when he drinks',
    'I am scared of my partner',
    'I am scared o f m y partner',
    'He b e a t s m e at night',
    'I am afraid to go home',
  ])('finds abuse words in %p', (text) => {
    expect(crisisMentions(text)).toEqual({ selfHarm: false, abuse: true });
  });

  it('reports both kinds together', () => {
    expect(crisisMentions('He hurts me and I feel suicidal')).toEqual({ selfHarm: true, abuse: true });
  });

  it.each(['', 'A quiet morning with Psalm 23.', 'I prayed for my sister today.', 'I am a b c learner', 'I am a b c learner, still starting out.', 'I admire the skill my self-taught brother has', 'Some o f m y friends came over', 'I renamed my_file_name today', 'I wrote a test in k_i_t_e_s.ts'])(
    'finds nothing in %p',
    (text) => {
      expect(crisisMentions(text)).toEqual({ selfHarm: false, abuse: false });
    },
  );
});

describe('withCrisisLines', () => {
  it('adds 988 and 741741 to text that has neither', () => {
    const out = withCrisisLines('I could not reach the server.');
    expect(out.startsWith('I could not reach the server.')).toBe(true);
    expect(out).toMatch(/\b988\b/);
    expect(out).toContain('741741');
    expect(out).not.toContain('799-7233');
  });

  it('adds the abuse hotline only for abuse', () => {
    expect(withCrisisLines('Sorry.', true)).toContain('1-800-799-7233');
  });

  it('leaves text that already names 988 and 741741 alone', () => {
    const text = 'Please call or text 988, or text HOME to 741741.';
    expect(withCrisisLines(text)).toBe(text);
  });

  it('still adds the lines when only 988 is named', () => {
    expect(withCrisisLines('Please call 988.')).toContain('741741');
  });
});
