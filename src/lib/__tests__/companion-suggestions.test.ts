import { copyRuleBreaks } from './fixtures/copy-rules';
import {
  FALLBACK_SUGGESTIONS,
  FALLBACK_SUGGESTIONS_PER_REPLY,
  fallbackSuggestions,
  readSuggestionList,
  replySuggestions,
  sharesCrisisLine,
  type FallbackChipDraw,
} from '../companion-suggestions';
import { drawsStayApart } from '../variation-bag';

const DRAW: FallbackChipDraw = { seed: 'test-install', conversationId: 'conversation-1', replyIndex: 0 };
const OLD_TRIO = ['Tell me more', 'How do I apply this?', 'Help me with a prayer'];

describe('readSuggestionList', () => {
  it('reads an absent or malformed field as no list', () => {
    expect(readSuggestionList(undefined)).toBeUndefined();
    expect(readSuggestionList(null)).toBeUndefined();
    expect(readSuggestionList('Tell me more')).toBeUndefined();
  });

  it('keeps an explicit empty list empty', () => {
    expect(readSuggestionList([])).toEqual([]);
  });

  it('keeps only non-blank strings', () => {
    expect(readSuggestionList(['Keep going', 3, null, '  ', 'Pray with me'])).toEqual([
      'Keep going',
      'Pray with me',
    ]);
  });

  it('reads the server’s fixed trio as no list, in any order', () => {
    expect(readSuggestionList(OLD_TRIO)).toBeUndefined();
    expect(readSuggestionList([...OLD_TRIO].reverse())).toBeUndefined();
    expect(readSuggestionList([' Tell me more ', ...OLD_TRIO.slice(1)])).toBeUndefined();
  });

  it('keeps a list that only shares chips with the trio', () => {
    expect(readSuggestionList(OLD_TRIO.slice(0, 2))).toEqual(OLD_TRIO.slice(0, 2));
    expect(readSuggestionList([...OLD_TRIO, 'Keep going'])).toEqual([...OLD_TRIO, 'Keep going']);
  });
});

describe('sharesCrisisLine', () => {
  it.each([
    // The server's own wording.
    'If you are not safe tonight, please call or text 988 to reach someone, any time.',
    'Reach out to the 988 Suicide and Crisis Lifeline right now.',
    'You can dial 988 from any phone.',
    'Text HOME to 741741 to reach the Crisis Text Line.',
    'Call the National Domestic Violence Hotline at 1-800-799-7233.',
    // A model's rewordings: inflected verbs and both word orders around 988.
    'You can reach the Lifeline any time by calling or texting 988.',
    'Please reach out by calling or texting 988 right now.',
    'Please consider calling 988 tonight.',
    'Texting 988 connects you with someone right now.',
    'Please contact 988 tonight.',
    'You can reach 988 by call or text, day or night.',
    'Reach out to 988 (call or text) whenever you need to.',
    // Lines by name.
    'Please reach out to the Lifeline.',
    'Reach the Lifeline at 988 any time.',
    'The Crisis Text Line is there tonight.',
    'The National DV Hotline can help you plan a safe way out.',
    // Numbers on their own.
    'You can text HOME to 741741 right now.',
    'Call the National Domestic Violence Hotline at 1-800-799-SAFE.',
    'If you are not safe at home, 1-800-799-SAFE (7233) answers all day.',
    'You can also text START to 88788.',
    'You can still call 1-800-273-8255 any time.',
    '1-800-273-TALK still connects you with someone tonight.',
    'If you are in danger right now, call 911.',
    // Round 2: any 988 counts unless a year cue sits next to it.
    'Please reach out to 988 right now.',
    'If tonight feels unsafe, please reach out to 988, and tell one person you trust.',
    '988 connects you with a trained counselor any time.',
    'Talk to someone at 988 tonight.',
    'Please speak with a counselor at 988 tonight.',
    'You can reach the 988 line any time, day or night.',
    'Message 988 tonight.',
    'Please call the free, confidential, around-the-clock support number at 988.',
    'Would you be willing to reach out to 988 tonight?',
    '988 is still there tonight if things get darker.',
    'You can call, text, or chat with someone trained to listen, any hour of the day, at 988.',
    'You can reach 988 any time, day or night.',
    'Please talk to someone at 988 tonight.',
    '988 is free and confidential, and someone will answer.',
    'Reach out to the 988 line tonight.',
    'Get help from 988 right away.',
    'Please call the U.S. 988 line.',
    'Please call\n988 tonight.',
    // 988 before or after suicide or crisis, as the base pattern had it.
    'Please reach out to 988 Suicide Prevention tonight.',
    'The 988 crisis team is there tonight.',
    'Reach the 988 crisis counselors now.',
    '988 (Suicide and Crisis) answers all night.',
    'You can reach 988 Suicide and Crisis any hour.',
    // Names in the plural and inside addresses.
    'Please contact one of the crisis lines in your area.',
    'There are free hotlines you can call tonight.',
    'Crisis helplines are open all night.',
    'You can chat online at 988lifeline.org any time.',
    'Visit 988lifeline.org to talk with someone.',
    'Help is at thehotline.org tonight.',
    // Numbers with a space or any dash inside.
    'Text HOME to 741 741.',
    'Text HOME to 741-741.',
    'Call 1\u2011800\u2011799\u20117233.',
    'Call 1\u2013800\u2013799\u20137233.',
    'Call 1\u2011800\u2011273\u20118255.',
    'Call 1\u2013800\u2013273\u20138255.',
    'If you are in danger, call\n911.',
    'In the U.S., call 911 if you are in danger.',
  ])('finds a crisis line in: %s', (reply) => {
    expect(sharesCrisisLine(reply)).toBe(true);
  });

  it.each([
    'Vladimir of Kyiv was baptized in 988, and his people followed.',
    'In 988 AD the faith reached Kyiv.',
    'The year 988 marks the baptism of the Rus.',
    'Since 988 the church in Kyiv has sung those psalms.',
    'The chronicle dates it to around 988.',
    'Prince Vladimir was baptized circa 988.',
    'The baptism of the Rus, 988 CE, is still remembered.',
    'In 1988 the parish built a new hall.',
    'Psalm 98:8 asks the rivers to clap their hands.',
    'Start with one honest sentence to God about today.',
  ])('finds none in: %s', (reply) => {
    expect(sharesCrisisLine(reply)).toBe(false);
  });
});

describe('replySuggestions', () => {
  const fallback = DRAW;

  it('shows no chips when the server sends an explicit empty list', () => {
    expect(replySuggestions([], 'Here is a short answer about Romans 8.', fallback)).toEqual([]);
  });

  it('shows no chips under a refusal or crisis reply, even when chips were sent', () => {
    const crisisReply =
      'You do not have to carry this alone. Please call or text 988 (Suicide and Crisis Lifeline) tonight.';
    expect(replySuggestions([], crisisReply, fallback)).toEqual([]);
    expect(replySuggestions(['How do I apply this?'], crisisReply, fallback)).toEqual([]);
    expect(replySuggestions(undefined, crisisReply, fallback)).toEqual([]);
  });

  it('keeps the chips the server sent', () => {
    expect(replySuggestions(['Keep going'], 'An answer.', fallback)).toEqual(['Keep going']);
  });

  it('draws fallback chips only when the reply carried no list', () => {
    const chips = replySuggestions(undefined, 'An answer.', fallback);
    expect(chips).toHaveLength(FALLBACK_SUGGESTIONS_PER_REPLY);
    for (const chip of chips) expect(FALLBACK_SUGGESTIONS).toContain(chip);
  });

  it('draws its own chips in place of the server’s fixed trio, and none under a crisis line', () => {
    const chips = replySuggestions(readSuggestionList(OLD_TRIO), 'An answer.', fallback);
    expect(chips).toHaveLength(FALLBACK_SUGGESTIONS_PER_REPLY);
    expect(chips).not.toEqual(OLD_TRIO);
    for (const chip of chips) expect(FALLBACK_SUGGESTIONS).toContain(chip);
    expect(replySuggestions(readSuggestionList(OLD_TRIO), 'Please consider calling 988 tonight.', fallback)).toEqual([]);
  });
});

describe('fallbackSuggestions', () => {
  it('holds the pool size the no-repeat guarantee rests on', () => {
    expect(drawsStayApart(FALLBACK_SUGGESTIONS.length, FALLBACK_SUGGESTIONS_PER_REPLY)).toBe(true);
    expect(new Set(FALLBACK_SUGGESTIONS).size).toBe(FALLBACK_SUGGESTIONS.length);
  });

  it('never repeats a chip on two consecutive replies for one install', () => {
    const conversations: Omit<FallbackChipDraw, 'replyIndex'>[] = [
      DRAW,
      { seed: 'other-install', conversationId: 'conversation-1' },
      { seed: 'x', conversationId: 'y' },
    ];
    for (const conversation of conversations) {
      for (let replyIndex = 0; replyIndex < 200; replyIndex += 1) {
        const current = fallbackSuggestions({ ...conversation, replyIndex });
        const next = fallbackSuggestions({ ...conversation, replyIndex: replyIndex + 1 });
        expect(new Set(current).size).toBe(FALLBACK_SUGGESTIONS_PER_REPLY);
        expect(next.filter((chip) => current.includes(chip))).toEqual([]);
      }
    }
  });

  it('is never the old fixed trio, and the same reply always shows the same chips', () => {
    for (let replyIndex = 0; replyIndex < 40; replyIndex += 1) {
      const chips = fallbackSuggestions({ ...DRAW, replyIndex });
      expect(chips).not.toEqual(OLD_TRIO);
      expect(chips).not.toContain('How do I apply this?');
      expect(fallbackSuggestions({ ...DRAW, replyIndex })).toEqual(chips);
    }
  });
});

describe('fallback chip copy', () => {
  it.each([...FALLBACK_SUGGESTIONS])('follows the copy rules: %s', (chip) => {
    expect(copyRuleBreaks(chip)).toEqual([]);
  });

  it('catches a broken rule', () => {
    expect(copyRuleBreaks('Let that sink in — truly!')).toEqual(
      expect.arrayContaining(['Let that sink in', 'truly', 'em dash', 'exclamation mark']),
    );
    expect(copyRuleBreaks('That’s valid – I\u00A0hear you ')).toEqual(
      expect.arrayContaining(["that's valid", 'i hear you', 'en dash', 'stray spaces']),
    );
    expect(copyRuleBreaks('What a damn good question from the AI')).toEqual(
      expect.arrayContaining(['damn', 'good question', 'AI mention']),
    );
    expect(copyRuleBreaks('Go a little deeper')).toEqual([]);
  });
});
