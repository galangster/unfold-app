/**
 * The rotating copy a daily reader sees: every line passes the app's
 * banned-phrase list and house rules, and no field repeats on the next day.
 * variation-bag.test.ts owns the bag's own guarantees; this file checks that
 * each surface actually draws through it, salted per field.
 */

import { BANNED_PHRASES } from '../persona';
import {
  ACT_OUTCOME_NOTES,
  COMPANION_GREETINGS,
  COMPANION_GREETINGS_WITH_NAME,
  DAY_COMPLETE_MESSAGES,
  DAY_COMPLETE_TITLES,
  GENERATING_FINAL_LINE,
  GENERATING_STATUS_LINES,
  HERO_CTA_LABELS,
  NEXT_STEP_DETAILS,
  QUIET_ENDING_COPY,
  REFLECTION_COMPOSER_PLACEHOLDERS,
  RHYTHM_LINES,
  SERIES_COMPLETE_MESSAGES,
  SERIES_COMPLETE_TITLES,
  TODAY_CARD_COPY,
  TODAY_GREETINGS,
  actOutcomeNote,
  companionGreeting,
  completionCopy,
  generatingStatusLines,
  heroCtaLabel,
  quietEndingCopy,
  reflectionComposerPlaceholder,
  rhythmLine,
  todayCardCopy,
  todayGreeting,
} from '../daily-copy';
import {
  IDLE_BODIES,
  IDLE_TITLES,
  NEXT_DAY_BODIES,
  NEXT_DAY_TITLES,
  OVERDUE_BODIES,
  OVERDUE_TITLES,
  PAUSED_BODIES,
  PAUSED_TITLES,
} from '../reading-reminder-messages';
import {
  CHECK_IN_TAP_CUES,
  EVENING_CONTENT_TEMPLATES,
  EVENING_TITLES,
  MIDDAY_CONTENT_TEMPLATES,
  echoes,
  getCheckInCelebrationMessage,
  getContentAwareEveningMessage,
  getContentAwareMiddayMessage,
  getEveningCelebrationMessage,
  getEveningWindDownCopy,
  getMiddayCheckInCopy,
  type CopyVariation,
  type DayContext,
} from '../check-in-messages';
import { getCompletionNextStep } from '@/lib/completion-next-step';
import { getDailyReminderContent, MAX_NOTIFICATION_BODY } from '@/lib/daily-reminder-content';
import type { Devotional, DevotionalDay } from '@/lib/store';
import { dayIndexFor, minimumGapFor } from '@/lib/variation-bag';

const START = dayIndexFor(new Date(2026, 0, 1));
const LONG_RANGE = 1500;
const day = (dayIndex: number, seed = 'install-a'): CopyVariation => ({ seed, dayIndex });

/** Extra tells from the companion's and the bridge's lists, and variants of banned phrases. */
const EXTRA_BANNED = [
  'I hear you', 'That’s valid', "That's valid", 'It’s okay to feel', "It's okay to feel",
  'I want you to know', 'sitting with', 'wrestling with',
];

/** Fails with the offending line, so a new entry that breaks a rule names itself. */
function expectHouseStyle(line: string) {
  const lower = line.toLowerCase();
  for (const phrase of [...BANNED_PHRASES, ...EXTRA_BANNED]) {
    if (lower.includes(phrase.toLowerCase())) throw new Error(`"${line}" uses "${phrase}"`);
  }
  if (/[—–]/.test(line)) throw new Error(`"${line}" uses a dash`);
  if (line.includes('!')) throw new Error(`"${line}" uses an exclamation mark`);
  if (/\p{Extended_Pictographic}/u.test(line)) throw new Error(`"${line}" uses an emoji`);
  if (line !== line.trim() || / {2}/.test(line)) throw new Error(`"${line}" has stray spaces`);
}

const TIME_OF_DAY = /\b(morning|afternoon|evening|night|tonight|noon|midday|bed|bedtime|sleep|dawn|sunrise|sunset|breakfast|lunch|dinner)\b/i;

function expectNoTimeOfDay(line: string) {
  if (TIME_OF_DAY.test(line)) throw new Error(`"${line}" names a time of day`);
}

/** No entry comes back inside any `gap` entries in a row. A gap of 2 is "never on consecutive days". */
function expectNoRepeatWithin(sequence: readonly unknown[], gap: number) {
  for (let i = 0; i + gap <= sequence.length; i += 1) {
    expect(new Set(sequence.slice(i, i + gap)).size).toBe(gap);
  }
}

const SAMPLE_DAY: DayContext = {
  title: 'The Unfinished House',
  scriptureReference: 'Psalm 132:1-5',
  quotableLine: 'Grace meets you before you finish explaining yourself.',
};

const frame = (render: (day: number, series: string) => string) => render(6, 'Psalm Walk');

/** Each pool of a keyed copy table, named `prefix.key`. */
const prefixed = (prefix: string, pools: Record<string, readonly string[]>): Record<string, readonly string[]> =>
  Object.fromEntries(Object.entries(pools).map(([key, pool]) => [`${prefix}.${key}`, pool]));

/** Every new line a reader can see, rendered with invented sample values. */
const NEW_LINES: Record<string, readonly string[]> = {
  dayCompleteTitles: DAY_COMPLETE_TITLES,
  dayCompleteMessages: DAY_COMPLETE_MESSAGES,
  seriesCompleteTitles: SERIES_COMPLETE_TITLES,
  seriesCompleteMessages: SERIES_COMPLETE_MESSAGES,
  ...prefixed('nextStep', NEXT_STEP_DETAILS),
  ...prefixed('card', TODAY_CARD_COPY),
  ...prefixed('rhythm', RHYTHM_LINES),
  ...prefixed('cta', HERO_CTA_LABELS),
  ...prefixed('greeting', TODAY_GREETINGS),
  ...prefixed('quiet', QUIET_ENDING_COPY),
  ...prefixed('act', ACT_OUTCOME_NOTES),
  composer: REFLECTION_COMPOSER_PLACEHOLDERS,
  generating: [...GENERATING_STATUS_LINES, GENERATING_FINAL_LINE],
  companion: COMPANION_GREETINGS,
  companionNamed: COMPANION_GREETINGS_WITH_NAME.map((greet) => greet('Sam')),
  reminderNextTitles: NEXT_DAY_TITLES.map(frame),
  reminderNextBodies: NEXT_DAY_BODIES,
  reminderOverdueTitles: OVERDUE_TITLES,
  reminderOverdueBodies: OVERDUE_BODIES.map(frame),
  reminderPausedTitles: PAUSED_TITLES,
  reminderPausedBodies: PAUSED_BODIES,
  reminderIdleTitles: IDLE_TITLES,
  reminderIdleBodies: IDLE_BODIES,
  middayTemplates: MIDDAY_CONTENT_TEMPLATES.map((template) => template(SAMPLE_DAY)),
  eveningTemplates: EVENING_CONTENT_TEMPLATES.map((template) => template(SAMPLE_DAY)),
  tapCues: CHECK_IN_TAP_CUES,
};

describe('rotating copy — house style', () => {
  it.each(Object.entries(NEW_LINES))('%s passes the banned-phrase list and house rules', (_name, lines) => {
    for (const line of lines) expectHouseStyle(line);
  });

  it.each(Object.entries(NEW_LINES))('%s has no duplicate entry', (_name, lines) => {
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('names no time of day where the surface fires at a time the reader picks', () => {
    // The reminder time is the reader's own; the other surfaces show at any hour.
    const timeless = [
      ...NEW_LINES.reminderNextTitles, ...NEW_LINES.reminderNextBodies,
      ...NEW_LINES.reminderOverdueTitles, ...NEW_LINES.reminderOverdueBodies,
      ...NEW_LINES.reminderPausedTitles, ...NEW_LINES.reminderPausedBodies,
      ...NEW_LINES.reminderIdleTitles, ...NEW_LINES.reminderIdleBodies,
      ...DAY_COMPLETE_TITLES, ...SERIES_COMPLETE_TITLES,
      ...Object.values(NEXT_STEP_DETAILS).flat(),
      ...Object.values(TODAY_CARD_COPY).flat(),
      ...Object.values(HERO_CTA_LABELS).flat(),
      ...Object.values(ACT_OUTCOME_NOTES).flat(),
      ...REFLECTION_COMPOSER_PLACEHOLDERS,
      ...NEW_LINES.generating, ...NEW_LINES.companion, ...NEW_LINES.companionNamed,
      // The one rhythm line that names the morning shipped before this change.
      ...Object.values(RHYTHM_LINES).flat().filter((line) => line !== 'A long obedience, one morning at a time.'),
    ];
    for (const line of timeless) expectNoTimeOfDay(line);
  });

  it('keeps the facts each next-step paragraph varies', () => {
    for (const line of NEXT_STEP_DETAILS.opensTomorrow) expect(line).toContain('tomorrow');
    for (const line of NEXT_STEP_DETAILS.preparing) expect(line).toContain('being prepared');
    for (const line of NEXT_STEP_DETAILS.ahead) expect(line).not.toMatch(/tomorrow/i);
    for (const line of NEXT_STEP_DETAILS.series) {
      expect(line).toContain('recommended study');
      expect(line).toContain('library');
    }
  });

  it('keeps every paused reminder about the Bible and Premium, with no claim of new work', () => {
    for (const title of PAUSED_TITLES) expect(title).toMatch(/Bible/);
    for (const body of PAUSED_BODIES) {
      expect(body).toMatch(/Premium/);
      expect(body).not.toMatch(/generat|prepar|created|next day/i);
    }
  });

  it('never pairs a reminder title with a body that repeats it', () => {
    const states: [readonly string[], readonly string[]][] = [
      [NEW_LINES.reminderNextTitles, NEXT_DAY_BODIES],
      [OVERDUE_TITLES, NEW_LINES.reminderOverdueBodies],
      [PAUSED_TITLES, PAUSED_BODIES],
      [IDLE_TITLES, IDLE_BODIES],
    ];
    for (const [titles, bodies] of states) {
      for (const title of titles) {
        for (const body of bodies) {
          if (echoes(title, body)) throw new Error(`"${title}" repeats in "${body}"`);
        }
      }
    }
  });

  it('keeps reminder titles short enough for a lock-screen banner', () => {
    for (const title of [...NEW_LINES.reminderNextTitles, ...OVERDUE_TITLES, ...PAUSED_TITLES, ...IDLE_TITLES]) {
      expect(title.length).toBeLessThanOrEqual(44);
    }
  });

  it('gives each reminder state at least 30 bodies, and each generic title pool 30 titles', () => {
    for (const pool of [NEXT_DAY_BODIES, OVERDUE_BODIES, PAUSED_BODIES, IDLE_BODIES]) {
      expect(pool.length).toBeGreaterThanOrEqual(30);
    }
    for (const pool of [OVERDUE_TITLES, IDLE_TITLES]) expect(pool.length).toBeGreaterThanOrEqual(30);
  });

  it('removes the companion greetings that used banned phrases', () => {
    for (const greeting of [...NEW_LINES.companion, ...NEW_LINES.companionNamed]) {
      expect(greeting).not.toMatch(/wrestl|sit(ting)? with/i);
    }
    expect([COMPANION_GREETINGS.length, COMPANION_GREETINGS_WITH_NAME.length]).toEqual([25, 25]);
  });
});

/** A draw for every field this change rotates, keyed by field. */
const FIELDS: Record<string, (variation: CopyVariation) => string> = {
  dayCompleteTitle: (v) => completionCopy('day', v).title,
  dayCompleteMessage: (v) => completionCopy('day', v).message,
  seriesCompleteTitle: (v) => completionCopy('series', v).title,
  seriesCompleteMessage: (v) => completionCopy('series', v).message,
  ...Object.fromEntries(
    (Object.keys(TODAY_CARD_COPY) as (keyof typeof TODAY_CARD_COPY)[])
      .map((kind) => [`card.${kind}`, (v: CopyVariation) => todayCardCopy(v)[kind]]),
  ),
  ...Object.fromEntries([0, 1, 4, 12, 45].map((streak) => [`rhythm@${streak}`, (v: CopyVariation) => rhythmLine(streak, v)])),
  ...Object.fromEntries([0, 1, 4, 9].map((streak) => [`cta@${streak}`, (v: CopyVariation) => heroCtaLabel(streak, v)])),
  ...Object.fromEntries([2, 9, 14, 19, 22].map((hour) => [`greeting@${hour}h`, (v: CopyVariation) => todayGreeting(hour, v)])),
  composer: reflectionComposerPlaceholder,
  actDone: (v) => actOutcomeNote('done', v),
  actSkipped: (v) => actOutcomeNote('skipped', v),
  companionNamed: (v) => companionGreeting('Sam', v),
  companion: (v) => companionGreeting(null, v),
  ...Object.fromEntries(
    (Object.keys(QUIET_ENDING_COPY) as (keyof typeof QUIET_ENDING_COPY)[])
      .map((field) => [`quiet.${field}`, (v: CopyVariation) => quietEndingCopy(v)[field]]),
  ),
  generatingFirstLine: (v) => generatingStatusLines(v)[0],
  checkInCelebration: getCheckInCelebrationMessage,
  eveningCelebration: getEveningCelebrationMessage,
  eveningCard: (v) => getContentAwareEveningMessage(SAMPLE_DAY, v),
  middayCard: (v) => getContentAwareMiddayMessage(SAMPLE_DAY, v),
};

describe('rotating copy — no repeats', () => {
  it.each(Object.entries(FIELDS))('%s never repeats on consecutive days', (_name, draw) => {
    expectNoRepeatWithin(Array.from({ length: LONG_RANGE }, (_, offset) => draw(day(START + offset))), 2);
  });

  it.each(Object.entries(FIELDS))('%s puts two installs on different sequences', (_name, draw) => {
    const sequence = (seed: string) => Array.from({ length: 60 }, (_, offset) => draw(day(START + offset, seed))).join('\n');
    expect(sequence('install-a')).not.toBe(sequence('install-b'));
  });

});

describe('content-aware check-in frames', () => {
  it('has at least 30 frames per slot', () => {
    expect(MIDDAY_CONTENT_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    expect(EVENING_CONTENT_TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  it('steps past frames the day cannot fill, and never shows an empty slot', () => {
    const noQuote: DayContext = { title: SAMPLE_DAY.title, scriptureReference: SAMPLE_DAY.scriptureReference };
    for (let offset = 0; offset < 400; offset += 1) {
      for (const message of [
        getContentAwareEveningMessage(noQuote, day(START + offset)),
        getContentAwareMiddayMessage(noQuote, day(START + offset)),
      ]) {
        expect(message).not.toMatch(/undefined|""/);
      }
    }
  });

  it('closes a quotable line that has no end punctuation before the frame goes on', () => {
    const open: DayContext = { ...SAMPLE_DAY, quotableLine: 'Grace meets you first' };
    const quoted = Array.from({ length: 200 }, (_, offset) => getContentAwareEveningMessage(open, day(START + offset)))
      .filter((message) => message.includes('Grace meets you first'));
    expect(quoted.length).toBeGreaterThan(0);
    for (const message of quoted) expect(message).toContain('"Grace meets you first."');
  });
});

describe('check-in banners', () => {
  it('never shows a title that repeats its own body', () => {
    for (let offset = 0; offset < LONG_RANGE; offset += 1) {
      for (const copy of [
        getMiddayCheckInCopy(null, null, day(START + offset)),
        getEveningWindDownCopy(null, day(START + offset)),
        getEveningWindDownCopy({ act: 'Before you sleep, read Psalm 4 once.' }, day(START + offset)),
      ]) {
        expect(echoes(copy.title, copy.body)).toBe(false);
      }
    }
  });

  it('swaps an echoing title for one outside the bag’s minimum gap', () => {
    // 'Before you sleep' would echo this act, so it never shows above it,
    // and the swap brings no title back within 11 days.
    const act = 'Before you sleep, read Psalm 4 once.';
    const titles = Array.from({ length: 400 }, (_, offset) => getEveningWindDownCopy({ act }, day(START + offset)).title);
    expect(titles).not.toContain('Before you sleep');
    expect(EVENING_TITLES).toContain('Before you sleep');
    expectNoRepeatWithin(titles, 11);
  });

  it('counts the tap cue inside the 150-character body and drops it when the sentence needs the room', () => {
    const bodies = Array.from({ length: 200 }, (_, offset) => getMiddayCheckInCopy(null, null, day(START + offset)).body);
    const withCue = bodies.filter((body) => CHECK_IN_TAP_CUES.some((cue) => body.endsWith(cue)));
    // Every banner keeps the cue when it fits (PR #166), and the cue rotates.
    expect(withCue.length).toBe(bodies.filter((body) => body.length > 0).length);
    expect(new Set(withCue.map((body) => CHECK_IN_TAP_CUES.find((cue) => body.endsWith(cue)))).size).toBe(CHECK_IN_TAP_CUES.length);

    const long = 'Before the meeting with your manager, ask God for one honest sentence and the courage to say it kindly, then say it, and leave the outcome with Him.';
    for (let offset = 0; offset < 50; offset += 1) {
      const copy = getMiddayCheckInCopy({ companionNudge: long }, null, day(START + offset));
      expect(copy.body.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY);
      expect(CHECK_IN_TAP_CUES.some((cue) => copy.body.endsWith(cue))).toBe(false);
    }
    for (const body of bodies) expect(body.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY);
  });
});

describe('generating screen lines', () => {
  it('shows each line once from a start the bag picks, then holds the final line', () => {
    const lines = generatingStatusLines(day(START));
    expect(lines).toHaveLength(GENERATING_STATUS_LINES.length + 1);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines[lines.length - 1]).toBe(GENERATING_FINAL_LINE);
    const starts = new Set(Array.from({ length: 30 }, (_, offset) => generatingStatusLines(day(START + offset))[0]));
    expect(starts.size).toBeGreaterThan(15);
  });
});

describe('completion next step', () => {
  it('varies the paragraph by day and keeps the day-not-on-device facts', () => {
    const details = Array.from({ length: LONG_RANGE }, (_, offset) => {
      const date = new Date(2026, 0, 1 + offset, 12);
      return getCompletionNextStep(null, 2, 'day', date, 'install-a').detail;
    });
    expectNoRepeatWithin(details, 2);
    for (const detail of details) {
      expect(NEXT_STEP_DETAILS.ahead).toContain(detail);
      expect(detail).not.toContain('tomorrow');
    }
  });
});

describe('reading reminder', () => {
  function devotional(overrides: Partial<Devotional> = {}): Devotional {
    return {
      id: 'dev-1',
      title: 'Psalm Walk',
      totalDays: 14,
      currentDay: 7,
      days: [],
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-06T00:00:00.000Z',
      userContext: { name: 'Sam', aboutMe: '', currentSituation: '', emotionalState: '' },
      generationMode: 'progressive',
      ...overrides,
    };
  }

  const unreadDay: DevotionalDay = {
    id: 'day-6',
    devotionalId: 'dev-1',
    dayNumber: 6,
    title: 'Title 6',
    scriptureReference: 'Psalm 23:1',
    scriptureText: 'Synthetic scripture text.',
    bodyText: 'Synthetic body.',
    quotableLine: 'Synthetic line.',
    isRead: false,
    generatedAt: new Date(2026, 4, 5, 23).toISOString(),
  };

  const states = {
    nextDay: { currentDevotional: devotional(), premiumPolicy: 'granted' as const },
    overdue: { currentDevotional: devotional({ currentDay: 6, days: [unreadDay], seriesStartDate: new Date(2026, 4, 1, 7).toISOString() }), premiumPolicy: 'granted' as const },
    paused: { currentDevotional: devotional(), premiumPolicy: 'denied' as const },
    idle: { currentDevotional: null, premiumPolicy: 'granted' as const },
  };

  it.each(Object.entries(states))('gives the %s state its own title and body on each fire date', (_state, input) => {
    const contents = Array.from({ length: 400 }, (_, offset) => getDailyReminderContent({
      ...input,
      now: new Date(2026, 4, 10 + offset, 8),
      seed: 'install-a',
    }));
    expectNoRepeatWithin(contents.map((content) => content.title), 2);
    expectNoRepeatWithin(contents.map((content) => content.body), 2);
  });

  it.each(Object.entries(states))('puts two installs on different %s sequences', (_state, input) => {
    const sequence = (seed: string) => Array.from({ length: 14 }, (_, offset) => {
      const content = getDailyReminderContent({ ...input, now: new Date(2026, 4, 10 + offset, 8), seed });
      return `${content.title}\n${content.body}`;
    }).join('\n');
    expect(sequence('install-a')).not.toBe(sequence('install-b'));
  });

  it.each(Object.entries(states))('in the %s state, never repeats a body inside the bag’s minimum gap', (_state, input) => {
    const bodies = Array.from({ length: 400 }, (_, offset) => getDailyReminderContent({
      ...input,
      now: new Date(2026, 4, 10 + offset, 8),
      seed: 'install-a',
    }).body);
    // 30 or more bodies per state: 8 days at a lap boundary, a full lap otherwise.
    expectNoRepeatWithin(bodies, minimumGapFor(30));
  });
});
