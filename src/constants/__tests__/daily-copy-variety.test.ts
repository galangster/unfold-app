/**
 * The rotating copy a daily reader sees: every line passes the app's
 * banned-phrase list and house rules, and no field repeats on the next day.
 * variation-bag.test.ts owns the bag's own guarantees; this file checks that
 * each surface actually draws through it, salted per field.
 */

import { expectCopyRules } from '@/lib/__tests__/fixtures/copy-rules';
import {
  ACT_OUTCOME_NOTES,
  COMPANION_GREETINGS,
  COMPANION_GREETINGS_WITH_NAME,
  COMPANION_INPUT_PLACEHOLDERS,
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
  companionInputPlaceholder,
  completionCopy,
  completionVariation,
  generatingStatusLines,
  heroCtaLabel,
  quietEndingCopy,
  reflectionComposerPlaceholder,
  rhythmLine,
  todayCardCopy,
  todayGreeting,
} from '../daily-copy';
import {
  FIRST_DAY_BODIES,
  FIRST_DAY_TITLES,
  IDLE_BODIES,
  IDLE_TITLES,
  NEXT_DAY_BODIES,
  NEXT_DAY_TITLES,
  OVERDUE_BODIES,
  OVERDUE_TITLES,
  PAST_END_BODIES,
  PAUSED_NO_SERIES_BODIES,
  PAUSED_SERIES_BODIES,
  PAUSED_TITLES,
} from '../reading-reminder-messages';
import {
  CHECK_IN_TAP_CUES,
  EVENING_CONTENT_TEMPLATES,
  EVENING_MESSAGES,
  EVENING_TITLES,
  MIDDAY_CONTENT_TEMPLATES,
  MIDDAY_MESSAGES,
  MIDDAY_TITLES,
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
import { countReadsBefore } from '@/lib/devotional-day-access';
import type { Devotional, DevotionalDay } from '@/lib/store';
import { dayIndexFor, minimumGapFor } from '@/lib/variation-bag';

const START = dayIndexFor(new Date(2026, 0, 1));
const LONG_RANGE = 1500;
const day = (dayIndex: number, seed = 'install-a'): CopyVariation => ({ seed, dayIndex });

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

/** A day with no quotable line, so some frames cannot be filled. */
const NO_QUOTE_DAY: DayContext = { title: SAMPLE_DAY.title, scriptureReference: SAMPLE_DAY.scriptureReference };

/** Six words is the arc generator's cap for a series title (its STRICT MAX 6). These are long ones. */
const LONGEST_SERIES_TITLE = 'Unshakeable Faithfulness Throughout Extraordinary Unexpected Wilderness';
/** About what one line of a lock-screen banner title holds. */
const BANNER_TITLE_CHARS = 44;

const frame = (render: (day: number, series: string) => string) => render(6, 'Psalm Walk');
const firstDayFrame = (render: (day: number, series: string) => string) => render(1, 'Psalm Walk');

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
  reminderPausedSeriesBodies: PAUSED_SERIES_BODIES,
  reminderPausedNoSeriesBodies: PAUSED_NO_SERIES_BODIES,
  reminderIdleTitles: IDLE_TITLES,
  reminderIdleBodies: IDLE_BODIES,
  reminderFirstDayTitles: FIRST_DAY_TITLES,
  reminderFirstDayBodies: FIRST_DAY_BODIES.map(firstDayFrame),
  reminderPastEndBodies: PAST_END_BODIES,
  companionPlaceholders: COMPANION_INPUT_PLACEHOLDERS,
  middayTemplates: MIDDAY_CONTENT_TEMPLATES.map((template) => template(SAMPLE_DAY)),
  eveningTemplates: EVENING_CONTENT_TEMPLATES.map((template) => template(SAMPLE_DAY)),
  tapCues: CHECK_IN_TAP_CUES,
};

describe('rotating copy — house style', () => {
  it.each(Object.entries(NEW_LINES))('%s passes the banned-phrase list and house rules', (_name, lines) => {
    for (const line of lines) expectCopyRules(line);
  });

  it.each(Object.entries(NEW_LINES))('%s has no duplicate entry', (_name, lines) => {
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('names no time of day where the surface fires at a time the reader picks', () => {
    // The reminder time is the reader's own; the other surfaces show at any hour.
    const timeless = [
      ...NEW_LINES.reminderNextTitles, ...NEW_LINES.reminderNextBodies,
      ...NEW_LINES.reminderOverdueTitles, ...NEW_LINES.reminderOverdueBodies,
      ...NEW_LINES.reminderPausedTitles, ...NEW_LINES.reminderPausedSeriesBodies,
      ...NEW_LINES.reminderPausedNoSeriesBodies,
      ...NEW_LINES.reminderIdleTitles, ...NEW_LINES.reminderIdleBodies,
      ...NEW_LINES.reminderFirstDayTitles, ...NEW_LINES.reminderFirstDayBodies,
      ...NEW_LINES.reminderPastEndBodies,
      ...DAY_COMPLETE_TITLES, ...SERIES_COMPLETE_TITLES,
      ...Object.values(NEXT_STEP_DETAILS).flat(),
      ...Object.values(TODAY_CARD_COPY).flat(),
      ...Object.values(HERO_CTA_LABELS).flat(),
      ...Object.values(ACT_OUTCOME_NOTES).flat(),
      ...REFLECTION_COMPOSER_PLACEHOLDERS, ...COMPANION_INPUT_PLACEHOLDERS,
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
    for (const body of [...PAUSED_SERIES_BODIES, ...PAUSED_NO_SERIES_BODIES]) {
      expect(body).toMatch(/Premium/);
      expect(body).not.toMatch(/generat|prepar|created|next day/i);
    }
  });

  it('names no series in a paused reminder for a reader without one, and shares no line between the paused pools', () => {
    for (const body of PAUSED_NO_SERIES_BODIES) expect(body).not.toMatch(/series|devotional/i);
    expect(PAUSED_NO_SERIES_BODIES.filter((body) => PAUSED_SERIES_BODIES.includes(body))).toEqual([]);
  });

  it('claims no return or progress for an unread Day 1, and no more of a series past its end', () => {
    const continuation = /\b(again|back|left off|stopped|return\w*|resume\w*|catch\w* up|kept|still|picks? up|continue\w*|keep going|more ahead|next day|next reading)\b/i;
    for (const line of [...FIRST_DAY_TITLES, ...NEW_LINES.reminderFirstDayBodies]) {
      expect(line).not.toMatch(continuation);
      // Day 1 may still be on its way to the device, so nothing says it is ready.
      expect(line).not.toMatch(/\b(is ready|is here|is open|waiting)\b/i);
    }
    for (const line of PAST_END_BODIES) {
      expect(line).not.toMatch(continuation);
      // The pointer can pass the end without every day read.
      expect(line).not.toMatch(/\b(finished|complete\w*|done)\b/i);
    }
  });

  it('never pairs a reminder title with a body that repeats it', () => {
    const states: [readonly string[], readonly string[]][] = [
      [NEW_LINES.reminderNextTitles, NEXT_DAY_BODIES],
      [OVERDUE_TITLES, NEW_LINES.reminderOverdueBodies],
      [PAUSED_TITLES, PAUSED_SERIES_BODIES],
      [PAUSED_TITLES, PAUSED_NO_SERIES_BODIES],
      [IDLE_TITLES, IDLE_BODIES],
      [FIRST_DAY_TITLES, NEW_LINES.reminderFirstDayBodies],
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
    for (const title of [...OVERDUE_TITLES, ...PAUSED_TITLES, ...IDLE_TITLES, ...FIRST_DAY_TITLES]) {
      expect(title.length).toBeLessThanOrEqual(BANNER_TITLE_CHARS);
    }
  });

  it('puts the day number and the frame ahead of the longest series name, so only the name can run off the banner', () => {
    // 30 days is the longest series. However long the name, at least 14 of
    // its characters show after the frame and the day number.
    for (const render of NEXT_DAY_TITLES) {
      const title = render(30, LONGEST_SERIES_TITLE);
      expect(title.endsWith(LONGEST_SERIES_TITLE)).toBe(true);
      expect(title.length - LONGEST_SERIES_TITLE.length).toBeLessThanOrEqual(BANNER_TITLE_CHARS - 14);
    }
  });

  it('gives each reminder state at least 30 bodies, and each generic title pool 30 titles', () => {
    for (const pool of [NEXT_DAY_BODIES, OVERDUE_BODIES, PAUSED_SERIES_BODIES, PAUSED_NO_SERIES_BODIES, IDLE_BODIES]) {
      expect(pool.length).toBeGreaterThanOrEqual(30);
    }
    for (const pool of [OVERDUE_TITLES, IDLE_TITLES]) expect(pool.length).toBeGreaterThanOrEqual(30);
  });

  it('puts no greeting in two parts of the day, and no hero label in two streak tiers', () => {
    for (const pools of [Object.values(TODAY_GREETINGS), Object.values(HERO_CTA_LABELS)]) {
      const lines: readonly string[] = pools.flat();
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it('words every tap cue as an update, never as an answer to the banner', () => {
    // The tap opens the life update, which asks its own question.
    for (const cue of CHECK_IN_TAP_CUES) {
      expect(cue).toMatch(/^Tap to /);
      expect(cue).not.toMatch(/\b(answer|reply|respond)\b/i);
    }
  });

  it('titles the completion overlay with what is finished, in words that cannot read as a command', () => {
    for (const title of [...DAY_COMPLETE_TITLES, ...SERIES_COMPLETE_TITLES]) expect(title).not.toMatch(/\bRead$/);
    // A day overlay sits above "Up next", so it never claims everything is read.
    for (const title of DAY_COMPLETE_TITLES) expect(title).not.toMatch(/\b(All|Every)\b/);
  });

  it('claims no step the generating screen shows as done, and keeps each last word on its line', () => {
    for (const line of [...GENERATING_STATUS_LINES, GENERATING_FINAL_LINE]) {
      // The series title shows under the line once the server names it, and
      // a new series is often read tomorrow.
      expect(line).not.toMatch(/\bnam(e|ing)\b|\btoday\b/i);
      expect(line).toMatch(/\u00A0\S+$/);
      expect(line.split('\u00A0')).toHaveLength(2);
    }
  });

  it('removes the companion greetings that used banned phrases', () => {
    for (const greeting of [...NEW_LINES.companion, ...NEW_LINES.companionNamed]) {
      expect(greeting).not.toMatch(/wrestl|sit(ting)? with/i);
    }
    expect([COMPANION_GREETINGS.length, COMPANION_GREETINGS_WITH_NAME.length]).toEqual([25, 25]);
  });
});

/** One hour in each part of the day, and one streak in each hero tier. */
const GREETING_HOURS = [2, 9, 14, 19, 22];
const CTA_STREAKS = [0, 1, 4, 9];

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
  ...Object.fromEntries(CTA_STREAKS.map((streak) => [`cta@${streak}`, (v: CopyVariation) => heroCtaLabel(streak, v)])),
  ...Object.fromEntries(GREETING_HOURS.map((hour) => [`greeting@${hour}h`, (v: CopyVariation) => todayGreeting(hour, v)])),
  composer: reflectionComposerPlaceholder,
  companionPlaceholder: companionInputPlaceholder,
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
  eveningCardNoQuote: (v) => getContentAwareEveningMessage(NO_QUOTE_DAY, v),
  middayCardNoQuote: (v) => getContentAwareMiddayMessage(NO_QUOTE_DAY, v),
};

const INSTALLS = ['install-a', 'install-b'];

describe('rotating copy — no repeats', () => {
  it.each(Object.entries(FIELDS))('%s never repeats on consecutive days', (_name, draw) => {
    expectNoRepeatWithin(Array.from({ length: LONG_RANGE }, (_, offset) => draw(day(START + offset))), 2);
  });

  it.each(Object.entries(FIELDS))('%s puts two installs on different sequences', (_name, draw) => {
    const sequence = (seed: string) => Array.from({ length: 60 }, (_, offset) => draw(day(START + offset, seed))).join('\n');
    expect(sequence('install-a')).not.toBe(sequence('install-b'));
  });

  it('never repeats the greeting when Today opens in another part of the day the next day', () => {
    // An evening open on one day and a morning open on the next, and every
    // other pair of parts of the day.
    for (const seed of INSTALLS) {
      for (let offset = 0; offset < 150; offset += 1) {
        for (const earlier of GREETING_HOURS) {
          for (const later of GREETING_HOURS) {
            expect(todayGreeting(later, day(START + offset + 1, seed))).not.toBe(todayGreeting(earlier, day(START + offset, seed)));
          }
        }
      }
    }
  });

  it('never repeats the hero label when the streak moves to another tier overnight', () => {
    // Up a tier as the streak grows, or down to the returning tier after a missed day.
    for (const seed of INSTALLS) {
      for (let offset = 0; offset < 150; offset += 1) {
        for (const before of CTA_STREAKS) {
          for (const after of CTA_STREAKS) {
            expect(heroCtaLabel(after, day(START + offset + 1, seed))).not.toBe(heroCtaLabel(before, day(START + offset, seed)));
          }
        }
      }
    }
  });

  it('never repeats a check-in card when the reading context changes overnight', () => {
    const contexts: (DayContext | null)[] = [SAMPLE_DAY, NO_QUOTE_DAY, null, { title: 'Bread for the Road' }, { scriptureReference: 'John 6:35' }];
    for (let offset = 0; offset < 100; offset += 1) {
      for (const before of contexts) {
        for (const after of contexts) {
          expect(getContentAwareEveningMessage(after, day(START + offset + 1))).not.toBe(getContentAwareEveningMessage(before, day(START + offset)));
          expect(getContentAwareMiddayMessage(after, day(START + offset + 1))).not.toBe(getContentAwareMiddayMessage(before, day(START + offset)));
        }
      }
    }
  });
});

describe('content-aware check-in frames', () => {
  it('has at least 30 frames per slot', () => {
    expect(MIDDAY_CONTENT_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    expect(EVENING_CONTENT_TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  it('falls back to the generic pool when the day cannot fill the drawn frame, and never shows an empty slot', () => {
    let generic = 0;
    for (let offset = 0; offset < 400; offset += 1) {
      const evening = getContentAwareEveningMessage(NO_QUOTE_DAY, day(START + offset));
      const midday = getContentAwareMiddayMessage(NO_QUOTE_DAY, day(START + offset));
      for (const message of [evening, midday]) expect(message).not.toMatch(/undefined|""/);
      if (EVENING_MESSAGES.includes(evening)) generic += 1;
      if (MIDDAY_MESSAGES.includes(midday)) generic += 1;
    }
    expect(generic).toBeGreaterThan(0);
  });

  it('closes a quotable line that has no end punctuation before the frame goes on', () => {
    const open: DayContext = { ...SAMPLE_DAY, quotableLine: 'Grace meets you first' };
    const quoted = Array.from({ length: 200 }, (_, offset) => getContentAwareEveningMessage(open, day(START + offset)))
      .filter((message) => message.includes('Grace meets you first'));
    expect(quoted.length).toBeGreaterThan(0);
    for (const message of quoted) expect(message).toContain('"Grace meets you first."');
  });
});

/** The tap cue a banner body ends with, if any. */
const cueOf = (body: string) => CHECK_IN_TAP_CUES.find((cue) => body.endsWith(cue));

describe('check-in banners', () => {
  it('never shows a title that repeats its own body', () => {
    for (let offset = 0; offset < LONG_RANGE; offset += 1) {
      for (const copy of [
        getMiddayCheckInCopy(null, null, day(START + offset)),
        getEveningWindDownCopy(null, day(START + offset)),
        getEveningWindDownCopy({ eveningScriptureRef: 'Psalm 4:8' }, day(START + offset)),
      ]) {
        expect(echoes(copy.title, copy.body)).toBe(false);
      }
    }
  });

  it('swaps an echoing title for one outside the bag’s minimum gap', () => {
    // 'Before rest' would echo the evening scripture line, so it never shows
    // above it, and the swap brings no title back within 11 days.
    const eveningScriptureRef = 'Psalm 4:8';
    const titles = Array.from({ length: 400 }, (_, offset) => getEveningWindDownCopy({ eveningScriptureRef }, day(START + offset)).title);
    expect(titles).not.toContain('Before rest');
    expect(EVENING_TITLES).toContain('Before rest');
    expectNoRepeatWithin(titles, 11);
  });

  it('keeps two swapped titles apart when the days around them swap too', () => {
    // Banners with no reading context, as every day but today is scheduled.
    // On these two days both drawn titles echo their bodies ('The day is
    // done', 'A soft landing'), and both swaps used to land on one title.
    const [first, second] = [22207, 22208].map((dayIndex) => getEveningWindDownCopy(null, { seed: 'synthetic-install-9', dayIndex }));
    expect(first.title).not.toBe(second.title);
    for (const copy of [first, second]) expect(echoes(copy.title, copy.body)).toBe(false);
    for (let install = 0; install < 3; install += 1) {
      const seed = `synthetic-install-${install}`;
      const midday = Array.from({ length: 400 }, (_, offset) => getMiddayCheckInCopy(null, null, day(START + offset, seed)).title);
      const evening = Array.from({ length: 400 }, (_, offset) => getEveningWindDownCopy(null, day(START + offset, seed)).title);
      expectNoRepeatWithin(midday, minimumGapFor(MIDDAY_TITLES.length));
      expectNoRepeatWithin(evening, minimumGapFor(EVENING_TITLES.length));
    }
  });

  it('counts the tap cue inside the 150-character body and drops it only when no cue fits', () => {
    const bodies = Array.from({ length: 200 }, (_, offset) => getMiddayCheckInCopy(null, null, day(START + offset)).body);
    const withCue = bodies.filter((body) => cueOf(body));
    // Every banner keeps the cue when it fits (PR #166), and the cue rotates.
    expect(withCue.length).toBe(bodies.length);
    expect(new Set(withCue.map(cueOf)).size).toBe(CHECK_IN_TAP_CUES.length);

    const long = 'Before the meeting with your manager, ask God for one honest sentence and the courage to say it kindly, then say it, and leave the outcome with Him.';
    for (let offset = 0; offset < 50; offset += 1) {
      const copy = getMiddayCheckInCopy({ companionNudge: long }, null, day(START + offset));
      expect(copy.body.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY);
      expect(cueOf(copy.body)).toBeUndefined();
    }
    for (const body of bodies) expect(body.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY);
  });

  it('keeps a cue for a 110 to 119 character sentence on every day, stepping to one that fits', () => {
    const shortest = Math.min(...CHECK_IN_TAP_CUES.map((cue) => cue.length));
    for (let length = 110; length <= 119; length += 1) {
      const nudge = `${'a'.repeat(length - 1)}.`;
      expect(length + 1 + shortest).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY);
      for (let offset = 0; offset < 60; offset += 1) {
        const { body } = getMiddayCheckInCopy({ companionNudge: nudge }, null, day(START + offset));
        expect(body.length).toBeLessThanOrEqual(MAX_NOTIFICATION_BODY);
        expect(body.startsWith(`${nudge} `)).toBe(true);
        expect(CHECK_IN_TAP_CUES).toContain(body.slice(nudge.length + 1));
      }
    }
  });

  /**
   * The banners of a run of fire dates, each given the cue the one before it
   * carried, as the notification batch does. A null length is a day with no
   * reading context.
   */
  function cueRun(lengths: readonly (number | null)[], seed: string, days: number) {
    let previousCue: string | undefined;
    return Array.from({ length: days }, (_, offset) => {
      const length = lengths[offset % lengths.length];
      const context: DayContext | null = length === null ? null : { companionNudge: `${'a'.repeat(length - 1)}.` };
      const copy = getMiddayCheckInCopy(context, null, day(START + offset, seed), previousCue);
      expect(copy.body.endsWith(copy.cue ?? '')).toBe(true);
      previousCue = copy.cue;
      return copy.cue;
    });
  }

  it('never repeats the cue the fire date before carried while two or more cues fit', () => {
    // Lengths that change from day to day, a day with no reading context,
    // and runs of one length. From 110 to 119 characters two or more cues fit.
    const runs: (number | null)[][] = [
      [105, 116, 112, 118, null, 119, 110, 117, 114, null, 111, 115, 118, 113],
      [118], [119], [116], [112],
    ];
    for (const lengths of runs) {
      for (const seed of INSTALLS) expectNoRepeatWithin(cueRun(lengths, seed, 120), 2);
    }
  });

  it('shows the one cue that fits a sentence of 120 to 123 characters, even two days running', () => {
    const cues = new Set(cueRun([120, 121, 122, 123], 'install-a', 30));
    expect(cues.size).toBe(1);
  });

  it('keeps the cue alone when the day’s sentence is empty', () => {
    for (let offset = 0; offset < 30; offset += 1) {
      const { body } = getMiddayCheckInCopy({ checkInQuestion: '   ' }, null, day(START + offset));
      expect(CHECK_IN_TAP_CUES).toContain(body);
    }
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

/** Noon on the first test day, for a step whose next day is not on the device. */
const NOON = new Date(2026, 0, 1, 12);

/**
 * When a synthetic reader finished each reading: on day i, `perDay[i]`
 * readings an hour apart from 09:00, then one sitting from 23:55 to 00:05.
 */
function readingTimes(perDay: readonly number[]): Date[] {
  const days = perDay.length;
  return [
    ...perDay.flatMap((count, offset) => Array.from({ length: count }, (_, i) => new Date(2026, 0, 1 + offset, 9 + i))),
    new Date(2026, 0, days, 23, 55),
    new Date(2026, 0, days + 1, 0, 5),
  ];
}

/** Every completion field, drawn for one completion. */
const COMPLETION_FIELDS: Record<string, (variation: CopyVariation) => string> = {
  dayTitle: (v) => completionCopy('day', v).title,
  dayLine: (v) => completionCopy('day', v).message,
  seriesTitle: (v) => completionCopy('series', v).title,
  seriesLine: (v) => completionCopy('series', v).message,
  nextStepAhead: (v) => getCompletionNextStep(null, 2, 'day', NOON, v.seed, v.dayIndex).detail,
  nextStepSeries: (v) => getCompletionNextStep(null, 2, 'series', NOON, v.seed, v.dayIndex).detail,
  actDone: (v) => actOutcomeNote('done', v),
  actSkipped: (v) => actOutcomeNote('skipped', v),
};

describe('completion copy by completion order', () => {
  it('places each reading by the readings finished before it, across every series', () => {
    const times = readingTimes([2, 1, 3]);
    const readAt = (at: Date, i: number) => ({ dayNumber: i + 1, isRead: true, readAt: at.toISOString() });
    // Two series, read in turns, and one day marked read with no timestamp.
    const series = [
      { days: [...times.filter((_, i) => i % 2 === 0).map(readAt), { dayNumber: 99, isRead: true }] },
      { days: times.filter((_, i) => i % 2 === 1).map(readAt) },
    ];
    expect(times.map((at) => countReadsBefore(series, at))).toEqual(times.map((_, i) => i));
  });

  it.each(Object.entries(COMPLETION_FIELDS))(
    '%s never repeats from one completion to the next, after a day of several or across midnight',
    (_name, draw) => {
      // Days with 2, 1, 3, 1, 4 and 2 completions, then a sitting across midnight.
      const times = readingTimes([2, 1, 3, 1, 4, 2]);
      const history = [{ days: times.map((at, i) => ({ dayNumber: i + 1, isRead: true, readAt: at.toISOString() })) }];
      for (const seed of INSTALLS) {
        const shown = times.map((at) => draw(completionVariation(seed, countReadsBefore(history, at))));
        for (let i = 1; i < shown.length; i += 1) expect(shown[i]).not.toBe(shown[i - 1]);
        // One completion keeps its words on every render.
        expect(times.map((at) => draw(completionVariation(seed, countReadsBefore(history, at))))).toEqual(shown);
      }
    },
  );
});

describe('completion next step', () => {
  it('varies the paragraph by completion and keeps the day-not-on-device facts', () => {
    const details = Array.from({ length: LONG_RANGE }, (_, ordinal) => getCompletionNextStep(null, 2, 'day', NOON, 'install-a', ordinal).detail);
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
  const seriesStartDate = new Date(2026, 4, 1, 7).toISOString();

  /** Each state, and the body pool its fire dates draw from. */
  const states = {
    nextDay: { input: { currentDevotional: devotional(), premiumPolicy: 'granted' as const }, bodies: NEXT_DAY_BODIES },
    overdue: { input: { currentDevotional: devotional({ currentDay: 6, days: [unreadDay], seriesStartDate }), premiumPolicy: 'granted' as const }, bodies: NEW_LINES.reminderOverdueBodies },
    firstDayOverdue: {
      input: { currentDevotional: devotional({ currentDay: 1, days: [{ ...unreadDay, id: 'day-1', dayNumber: 1 }], seriesStartDate }), premiumPolicy: 'granted' as const },
      bodies: NEW_LINES.reminderFirstDayBodies,
    },
    firstDayPending: { input: { currentDevotional: devotional({ currentDay: 1 }), premiumPolicy: 'granted' as const }, bodies: NEW_LINES.reminderFirstDayBodies },
    paused: { input: { currentDevotional: devotional(), premiumPolicy: 'denied' as const }, bodies: PAUSED_SERIES_BODIES },
    pausedNoSeries: { input: { currentDevotional: null, premiumPolicy: 'denied' as const }, bodies: PAUSED_NO_SERIES_BODIES },
    idle: { input: { currentDevotional: null, premiumPolicy: 'granted' as const }, bodies: IDLE_BODIES },
  };

  const fireDates = (count: number) => Array.from({ length: count }, (_, offset) => new Date(2026, 4, 10 + offset, 8));

  it.each(Object.entries(states))('gives the %s state its own title and body on each fire date', (_state, { input }) => {
    const contents = fireDates(400).map((now) => getDailyReminderContent({ ...input, now, seed: 'install-a' }));
    expectNoRepeatWithin(contents.map((content) => content.title), 2);
    expectNoRepeatWithin(contents.map((content) => content.body), 2);
  });

  it.each(Object.entries(states))('puts two installs on different %s sequences', (_state, { input }) => {
    const sequence = (seed: string) => fireDates(14).map((now) => {
      const content = getDailyReminderContent({ ...input, now, seed });
      return `${content.title}\n${content.body}`;
    }).join('\n');
    expect(sequence('install-a')).not.toBe(sequence('install-b'));
  });

  it.each(Object.entries(states))('in the %s state, draws from its own pool and never repeats a body inside the bag’s minimum gap', (_state, { input, bodies }) => {
    const drawn = fireDates(400).map((now) => getDailyReminderContent({ ...input, now, seed: 'install-a' }).body);
    for (const body of drawn) expect(bodies).toContain(body);
    // A lap boundary holds a quarter of the pool apart; a lap holds all of it.
    expectNoRepeatWithin(drawn, minimumGapFor(bodies.length));
  });

  it('gives an unread Day 1 its own titles, overdue or not yet on the device', () => {
    for (const { input } of [states.firstDayOverdue, states.firstDayPending]) {
      for (const now of fireDates(30)) {
        const content = getDailyReminderContent({ ...input, now, seed: 'install-a' });
        expect(FIRST_DAY_TITLES).toContain(content.title);
        expect(content.body).toContain('Psalm Walk');
      }
    }
  });

  it('past the series end keeps the series title and rotates a body that promises no next day', () => {
    const pastEnd = devotional({ currentDay: 15, days: [{ ...unreadDay, id: 'day-14', dayNumber: 14, isRead: true }] });
    const contents = fireDates(200).map((now) => getDailyReminderContent({ currentDevotional: pastEnd, premiumPolicy: 'granted', now, seed: 'install-a' }));
    for (const content of contents) {
      expect(content.title).toBe('Psalm Walk');
      expect(PAST_END_BODIES).toContain(content.body);
    }
    expectNoRepeatWithin(contents.map((content) => content.body), minimumGapFor(PAST_END_BODIES.length));
  });
});
