import {
  getEveningWindDownBody,
  getMiddayCheckInBody,
  MIDDAY_MESSAGES,
  EVENING_MESSAGES,
} from '../check-in-messages';
import { truncateNotificationBody } from '@/lib/daily-reminder-content';

// A fixed draw. These tests are about the fallback ORDER, not about which
// entry the bag returns — variation-bag.test.ts owns that.
const V = { seed: 'test-install', dayIndex: 20_000 };

const LONG_ACT =
  'Tonight after your toddler is down, sit in the quiet for two full minutes before picking up your phone or your to-do list. Pray Psalm 132:1-5 slowly out loud, naming your own unfinished house where David names his oath.';

describe('truncateNotificationBody', () => {
  it('leaves short text alone and trims whitespace', () => {
    expect(truncateNotificationBody('  Read Psalm 23.  ')).toBe('Read Psalm 23.');
  });

  it('cuts long text at a word boundary with an ellipsis and never past the limit', () => {
    const out = truncateNotificationBody(LONG_ACT);
    expect(out.length).toBeLessThanOrEqual(150);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
    expect(out.startsWith('Tonight after your toddler is down')).toBe(true);
  });
});

describe('getEveningWindDownBody', () => {
  it('leads with the day\'s act, the thing the devotional asked the reader to do', () => {
    const body = getEveningWindDownBody({ title: 'The Unfinished House', act: LONG_ACT, eveningScriptureRef: 'Psalm 132:1-5' }, V);
    expect(body.startsWith('Tonight after your toddler is down')).toBe(true);
  });

  it('falls back to the evening scripture, then to a template that names the day', () => {
    expect(getEveningWindDownBody({ title: 'Rest', eveningScriptureRef: 'Psalm 4:8' }, V)).toBe(
      'Before rest, sit with Psalm 4:8 for a minute.',
    );
    const templated = getEveningWindDownBody({ title: 'Rest', scriptureReference: 'Psalm 4' }, V);
    expect(templated).toMatch(/Rest|Psalm 4/);
  });

  it('uses the generic pool when nothing about the day is known', () => {
    expect(EVENING_MESSAGES).toContain(getEveningWindDownBody(null, V));
  });
});

describe('getMiddayCheckInBody', () => {
  it('leads with the companion nudge when generation produced one', () => {
    expect(
      getMiddayCheckInBody(
        { companionNudge: 'Before Thursday\'s interview, remember whose name you carry.', checkInQuestion: 'Q?' },
        'Carry line',
        V,
      ),
    ).toBe('Before Thursday\'s interview, remember whose name you carry.');
  });

  it('prefers the carry line from the day finished today', () => {
    expect(getMiddayCheckInBody({ checkInQuestion: 'Where did you notice grace?' }, 'Carry this: you are already home.', V)).toBe(
      'Carry this: you are already home.',
    );
  });

  it('then uses the day\'s own check-in question', () => {
    expect(getMiddayCheckInBody({ checkInQuestion: 'Where did you notice grace?' }, null, V)).toBe(
      'Where did you notice grace?',
    );
  });

  it('uses the generic pool when nothing about the day is known', () => {
    expect(MIDDAY_MESSAGES).toContain(getMiddayCheckInBody(null, null, V));
  });
});
