/**
 * Rotating copy for the screens a reader sees every day: the completion
 * overlay, the Today header, cards and rhythm box, the home composer, the
 * act note in the reader, the companion's empty state, the generating screen
 * and the evening quiet ending.
 *
 * Every draw goes through the seeded shuffle bag (lib/variation-bag.ts) with
 * its own field salt, so a line does not come back on the next day and two
 * readers are on different sequences. The completion overlay, its next step
 * and the act note step once per completion instead (completionVariation).
 * Keep each pool's length fixed in code: the bag's spacing holds only while
 * the length stays the same.
 */

import { drawCopy, drawRotation, type CopyVariation } from '@/lib/variation-bag';

// ─── Completion overlay ─────────────────────────────────────────────────────
// God/Jesus-focused: glory goes to Him, not to the reader.

export const DAY_COMPLETE_MESSAGES = [
  'He is faithful, even when you’re not sure you are.',
  'The word that went out will not return empty.',
  'His mercies are new every morning.',
  'God is closer than your next breath.',
  'Jesus intercedes for you right now.',
  'He who began a good work will finish it.',
  'His grace was here before you were.',
  'The Good Shepherd knows your name.',
  'God does not waste a single word.',
  'Christ in you. The hope of glory.',
  'He is the same yesterday, today, and forever.',
  'The Father sees what is done in secret.',
  'His love is not earned. It just is.',
  'God is doing something you cannot see yet.',
  'Jesus sat with sinners. He sits with you.',
  'The Spirit helps when you don’t have the words.',
  'His faithfulness reaches to the clouds.',
  'God is not distant. He is here.',
  'The cross says everything about His love.',
  'He gives strength to the weary.',
  'Jesus is the author and the finisher.',
  'God’s kindness leads to real change.',
  'His promises do not expire.',
  'The Lord is near to the brokenhearted.',
  'He makes all things new. Including you.',
  'God speaks. Even in the quiet.',
  'His plans for you are not fragile.',
  'Jesus carried the weight so you don’t have to.',
  'The Father’s love is not performance-based.',
  'God is patient with you. Endlessly so.',
  'His word is a lamp. Not a floodlight. A lamp.',
  'Christ died while you were still figuring it out.',
  'The Spirit is moving, even now.',
  'He does not grow tired or weary.',
  'God knows the end of the story. Rest in that.',
  'Jesus is not ashamed to call you His.',
  'His compassion does not run out.',
  'God is working all things together.',
  'The risen Christ holds everything.',
  'He heals the brokenhearted and binds up wounds.',
  'God is not surprised by where you are.',
  'Jesus is the way. Not a suggestion.',
  'His peace passes understanding for a reason.',
  'The Lord fights for you. Be still.',
  'God remembers His covenant. Always.',
  'Jesus is enough. That’s the whole gospel.',
  'His love endures forever. That word means forever.',
  'God delights in you. Not in your output.',
  'The grace that saved you sustains you too.',
  'He is the vine. You are connected.',
];

export const SERIES_COMPLETE_MESSAGES = [
  'He who began this work in you\nwill carry it to completion.',
  'God was faithful through every day of this.',
  'His word accomplished what He sent it to do.',
  'From start to finish, He was with you.',
  'God doesn’t start things He won’t finish.',
  'Every day of this series, His grace showed up.',
  'The Lord sustained you through all of it.',
  'His faithfulness carried you here.',
  'God gave you this word, day by day.',
  'Christ was in every page of this.',
  'He walked with you through the whole thing.',
  'God’s promises held. Every single day.',
  'The Spirit guided you through it all.',
  'His word will keep working in you\nlong after today.',
];

export const DAY_COMPLETE_TITLES = [
  'Day Complete',
  'Done for Today',
  'Today’s Reading, Done',
  'Finished',
  'Reading Done',
  'Day Finished',
  'Reading Complete',
  'Reading Finished',
  'Complete',
  'Read and Received',
];

export const SERIES_COMPLETE_TITLES = [
  'Series Complete',
  'Series Finished',
  'Every Day Complete',
  'Last Day Finished',
  'All the Way Through',
];

/**
 * The draw for a finished reading. The completion overlay, its "Up next"
 * paragraph and the act note step once per completion, not once per day:
 * `ordinal` is the number of readings finished before this one, across every
 * series (countReadsBefore). Two completions in a row are next to each other
 * in the bag, so they never share an entry, whether they fall on one day or
 * on either side of midnight.
 */
export function completionVariation(seed: string, ordinal: number): CopyVariation {
  return { seed, dayIndex: ordinal };
}

/** Title and line for the completion overlay, for one completion (completionVariation). */
export function completionCopy(
  type: 'day' | 'series',
  variation: CopyVariation,
): { title: string; message: string } {
  return type === 'series'
    ? {
      title: drawCopy(SERIES_COMPLETE_TITLES, variation, 'series-complete-title'),
      message: drawCopy(SERIES_COMPLETE_MESSAGES, variation, 'series-complete'),
    }
    : {
      title: drawCopy(DAY_COMPLETE_TITLES, variation, 'day-complete-title'),
      message: drawCopy(DAY_COMPLETE_MESSAGES, variation, 'day-complete'),
    };
}

/**
 * The paragraph under "Up next" (lib/completion-next-step.ts), per state of
 * the next day. Each entry keeps the facts of the line it varies: a day that
 * opens tomorrow says so, a day still being prepared says so, and a day not
 * on the device names no date.
 */
export const NEXT_STEP_DETAILS = {
  ready: [
    'Your next reading is ready whenever you are.',
    'The next day is open now, if you want to keep going.',
    'Your next reading is here when you want it.',
    'You can go on to the next day now, or come back later.',
    'The next day is ready. There is no hurry.',
  ],
  opensTomorrow: [
    'Your next reading opens tomorrow. Take today’s words with you.',
    'The next day opens tomorrow. Carry one line from today until then.',
    'The next reading comes tomorrow. Let today’s settle first.',
    'Your next reading opens tomorrow. Today’s is yours to keep thinking about.',
    'The next day opens tomorrow. For now, today’s reading is enough.',
  ],
  preparing: [
    'Your next reading is being prepared. You can find it on Today when it is ready.',
    'The next day is being prepared. It will be on Today when it is ready.',
    'Your next reading is being prepared now. Look for it on Today.',
    'The next day is being prepared for you. Today will show it when it is ready.',
  ],
  ahead: [
    'There is more ahead in this series. Return to Today for your next reading.',
    'This series has more to come. Your next reading will be on Today.',
    'More of this series is ahead. Look for the next reading on Today.',
    'The series goes on from here. Find your next reading on Today.',
    'There is more of this series to read. Today is where it will be.',
  ],
  series: [
    'Your streak continues across series. On Today, choose a recommended study or a new direction. Prepare it now or tomorrow, then read tomorrow. Your completed series stays in your library.',
    'Your completed series stays in your library, and your streak carries on. On Today, choose a recommended study or a new direction. Prepare it now or tomorrow, then read tomorrow.',
    'On Today, choose a recommended study or a new direction. Prepare it now or tomorrow, then read tomorrow. Your streak continues, and this series stays in your library.',
  ],
} as const;

// ─── Today ──────────────────────────────────────────────────────────────────

/**
 * Bold titles of the Today card stack, and the bridge card's loading line.
 * Evening and midday titles stay questions: the card's spoken label reads
 * the title straight into the body.
 */
export const TODAY_CARD_COPY = {
  evening: [
    'How has your day been?',
    'How did today go?',
    'What did today hold?',
    'How was your day, honestly?',
    'What has today been like?',
    'How are you ending the day?',
    'What happened today?',
    'How did the day treat you?',
  ],
  midday: [
    'What’s happening in your life?',
    'What’s going on for you?',
    'What’s on your plate today?',
    'What’s new with you?',
    'How’s life right now?',
    'What are you carrying today?',
    'What’s been happening?',
    'Anything new going on?',
  ],
  bridge: [
    'A thread from yesterday to today',
    'From yesterday into today',
    'What yesterday hands to today',
    'A bridge into today’s reading',
    'Where yesterday meets today',
    'Picking up from yesterday',
    'Before today’s reading',
    'Yesterday, carried forward',
  ],
  bridgeLoading: [
    'Preparing today’s thread…',
    'Writing today’s bridge…',
    'Connecting yesterday and today…',
    'Finding today’s thread…',
  ],
  bridgeLoadingBody: [
    'A quiet bridge from yesterday to today will appear here when it is ready.',
    'Your bridge into today’s reading will appear here when it is ready.',
    'A few words linking yesterday to today will appear here when they are ready.',
    'A short note from yesterday into today’s reading will appear here when it is ready.',
  ],
  rememberThis: [
    'A line worth carrying',
    'From your highlights',
    'Something you saved',
    'A line you kept',
    'Back from your highlights',
    'You marked this',
    'Worth reading again',
    'A highlight to revisit',
  ],
} as const;

/** Today's card copy, one draw per field. */
export function todayCardCopy(variation: CopyVariation): Record<keyof typeof TODAY_CARD_COPY, string> {
  return {
    evening: drawCopy(TODAY_CARD_COPY.evening, variation, 'card-evening-title'),
    midday: drawCopy(TODAY_CARD_COPY.midday, variation, 'card-midday-title'),
    bridge: drawCopy(TODAY_CARD_COPY.bridge, variation, 'card-bridge-title'),
    bridgeLoading: drawCopy(TODAY_CARD_COPY.bridgeLoading, variation, 'card-bridge-loading-title'),
    bridgeLoadingBody: drawCopy(TODAY_CARD_COPY.bridgeLoadingBody, variation, 'card-bridge-loading-body'),
    rememberThis: drawCopy(TODAY_CARD_COPY.rememberThis, variation, 'card-remember-this-title'),
  };
}

/** The rhythm box line, by streak tier. The tier with no end has the longest pool. */
export const RHYTHM_LINES = {
  begin: [
    'Begin with today’s reading.',
    'Today’s reading is a good place to start.',
    'One reading starts the rhythm.',
    'Start your rhythm with today’s reading.',
    'A new rhythm can start today.',
    'Today is a good day to begin.',
  ],
  first: [
    'One faithful day at a time.',
    'One day in. Keep it simple.',
    'A first day, counted.',
    'The rhythm has started.',
    'Day one of a new rhythm.',
  ],
  rooting: [
    'Your rhythm is taking root.',
    'A few days in, and it’s holding.',
    'Day by day, it’s becoming a habit.',
    'Keep showing up. It adds up.',
    'The rhythm is forming.',
    'Steady days are adding up.',
    'A rhythm is starting to form.',
  ],
  steady: [
    'A steady devotional rhythm.',
    'A week or more of faithful days.',
    'Your rhythm is holding steady.',
    'This is becoming part of your days.',
    'Faithful in the small things.',
    'Steady, day after day.',
    'Showing up is becoming natural.',
    'The habit has roots now.',
    'A rhythm worth keeping.',
    'Unhurried and consistent.',
    'Day after day, you keep coming back.',
    'Your days have a quiet center now.',
  ],
  long: [
    'A long obedience, one morning at a time.',
    'A long obedience in the same direction.',
    'A rhythm that has lasted.',
    'A month or more of faithful days.',
    'This rhythm is part of you now.',
    'Faithful, day after day.',
    'Your rhythm has deep roots.',
    'Steady for a long stretch now.',
    'Day after day, for a long while now.',
    'A well-worn path to Scripture.',
    'Still showing up, still listening.',
    'Long and steady.',
    'You keep coming back to the Word.',
    'A rhythm that keeps going.',
    'Many days, one direction.',
    'Scripture has become a daily place for you.',
    'The Word is part of your days now.',
    'Faithful in the ordinary, for a long time.',
    'Still here, still reading.',
    'Your rhythm has weathered a lot of days.',
  ],
} as const;

type RhythmTier = keyof typeof RHYTHM_LINES;

/** The rhythm box line for a streak of `streak` days. */
export function rhythmLine(streak: number, variation: CopyVariation): string {
  let tier: RhythmTier = 'long';
  if (streak === 0) tier = 'begin';
  else if (streak === 1) tier = 'first';
  else if (streak < 7) tier = 'rooting';
  else if (streak < 30) tier = 'steady';
  return drawCopy(RHYTHM_LINES[tier], variation, `rhythm-${tier}`);
}

/**
 * The unread hero button, by streak tier. Each opens the current reading.
 * No label is in two tiers, so a streak that moves to another tier overnight
 * cannot show yesterday's label.
 */
export const HERO_CTA_LABELS = {
  practiced: [
    'Deepen Your Practice',
    'Open Today’s Reading',
    'Return to the Reading',
    'Read On',
    'Continue the Series',
    'Keep Reading',
  ],
  rooted: [
    'Stay Rooted',
    'Keep the Rhythm',
    'Open the Reading',
    'Continue the Reading',
    'Back to the Reading',
  ],
  going: [
    'Keep Going',
    'Read Today',
    'Take the Next Step',
    'Go to Today’s Reading',
  ],
  returning: [
    'Continue Reading',
    'Pick Up the Reading',
    'Resume the Series',
    'Return to Today’s Reading',
  ],
} as const;

/** The unread hero label for a streak of `streak` days. */
export function heroCtaLabel(streak: number, variation: CopyVariation): string {
  let tier: keyof typeof HERO_CTA_LABELS = 'returning';
  if (streak >= 7) tier = 'practiced';
  else if (streak >= 3) tier = 'rooted';
  else if (streak >= 1) tier = 'going';
  return drawCopy(HERO_CTA_LABELS[tier], variation, `hero-cta-${tier}`);
}

/**
 * The line above the reader's name on Today, by local hour. No line is in
 * two parts of the day, so a reader who opens Today at a different hour
 * tomorrow cannot get today's greeting back.
 */
export const TODAY_GREETINGS = {
  late: [
    'Still awake?',
    'Up late?',
    'Late night',
    'The quiet hours',
    'Grace for the small hours',
    'Hello, night owl',
  ],
  morning: [
    'Good morning',
    'Morning',
    'Grace and peace',
    'Peace to you this morning',
    'A good morning to you',
    'A new morning',
  ],
  afternoon: [
    'Good afternoon',
    'Afternoon',
    'Good to see you',
    'Peace to you today',
    'Hello again',
    'Good day to you',
  ],
  evening: [
    'Good evening',
    'Evening',
    'The day is winding down',
    'Peace to you this evening',
    'A good evening to you',
    'Evening is here',
  ],
  night: [
    'Wind down',
    'Winding down',
    'Rest is close',
    'Peace to you tonight',
    'The day is almost done',
    'A quiet night to you',
  ],
} as const;

/** The greeting for local hour `hour`. Each part of the day has its own lines and its own sequence. */
export function todayGreeting(hour: number, variation: CopyVariation): string {
  let slot: keyof typeof TODAY_GREETINGS = 'night';
  if (hour < 5) slot = 'late';
  else if (hour < 12) slot = 'morning';
  else if (hour < 17) slot = 'afternoon';
  else if (hour < 21) slot = 'evening';
  return drawCopy(TODAY_GREETINGS[slot], variation, `greeting-${slot}`);
}

/** Placeholder of the free-write field on a completed Today card. */
export const REFLECTION_COMPOSER_PLACEHOLDERS = [
  'What stayed with you today?',
  'What’s one thing you want to remember?',
  'Write a line about today’s reading.',
  'What did today’s reading stir up?',
  'What do you want to say back to God?',
  'What surprised you today?',
  'Where did the reading meet you?',
  'A few words about what you read…',
];

export function reflectionComposerPlaceholder(variation: CopyVariation): string {
  return drawCopy(REFLECTION_COMPOSER_PLACEHOLDERS, variation, 'composer-placeholder');
}

/** The note under the day's act once the reader marks it. */
export const ACT_OUTCOME_NOTES = {
  done: [
    'Done. Well held.',
    'Done, and done well.',
    'Marked done.',
    'You did it. Well done.',
    'Done. A small, faithful step.',
  ],
  skipped: [
    'Set aside for now.',
    'Set aside. No pressure.',
    'Left for another time.',
    'Skipped for today.',
    'Not this time.',
  ],
} as const;

/** The note under a day's act, for that day's completion (completionVariation). */
export function actOutcomeNote(outcome: keyof typeof ACT_OUTCOME_NOTES, variation: CopyVariation): string {
  return drawCopy(ACT_OUTCOME_NOTES[outcome], variation, `act-${outcome}`);
}

// ─── Companion empty state ──────────────────────────────────────────────────
// 25 greetings per pool. A reader sees one pool: with a name or without.

export const COMPANION_GREETINGS_WITH_NAME = [
  (n: string) => `Hey ${n}, what’s on your heart?`,
  (n: string) => `Good to see you, ${n}.`,
  (n: string) => `What are you thinking about, ${n}?`,
  (n: string) => `Hey ${n}. What’s stirring in you?`,
  (n: string) => `${n}, what’s been on your mind?`,
  (n: string) => `Welcome back, ${n}.`,
  (n: string) => `Hey ${n}. Anything weighing on you?`,
  (n: string) => `What’s God been putting on your heart, ${n}?`,
  (n: string) => `${n}, what’s been hard lately?`,
  (n: string) => `Hey ${n}. I’m here whenever you’re ready.`,
  (n: string) => `What brought you here, ${n}?`,
  (n: string) => `${n}, what do you want to explore?`,
  (n: string) => `Hey ${n}. Let’s dig into something.`,
  (n: string) => `What are you curious about, ${n}?`,
  (n: string) => `${n}, what are you wondering about?`,
  (n: string) => `Hey ${n}. Where should we start?`,
  (n: string) => `What do you need right now, ${n}?`,
  (n: string) => `${n}, I’m glad you’re here.`,
  (n: string) => `Hey ${n}. What’s pulling at you?`,
  (n: string) => `Talk to me, ${n}. What’s going on?`,
  (n: string) => `${n}, anything on your mind?`,
  (n: string) => `Hey ${n}. What would be helpful right now?`,
  (n: string) => `What’s stirring in your spirit, ${n}?`,
  (n: string) => `${n}, what do you want to talk about?`,
  (n: string) => `Hey ${n}. Ask me anything.`,
];

export const COMPANION_GREETINGS = [
  'What’s on your heart?',
  'What are you thinking about?',
  'What’s been on your mind?',
  'Anything weighing on you?',
  'What brought you here?',
  'What are you curious about?',
  'Where should we start?',
  'What do you need right now?',
  'What’s stirring in you?',
  'What’s been hard lately?',
  'What questions are on your mind?',
  'What do you want to explore?',
  'What would be helpful right now?',
  'Talk to me. What’s going on?',
  'I’m here. Ask me anything.',
  'What do you want to talk about?',
  'What’s pulling at you?',
  'What’s God been putting on your heart?',
  'Glad you’re here. What’s up?',
  'Let’s dig into something.',
  'I’m here whenever you’re ready.',
  'Anything on your mind?',
  'What’s stirring in your spirit?',
  'What brought you here today?',
  'Ready when you are.',
];

/** The companion's opening line for today. */
export function companionGreeting(name: string | null, variation: CopyVariation): string {
  return name
    ? drawCopy(COMPANION_GREETINGS_WITH_NAME, variation, 'companion-greeting')(name)
    : drawCopy(COMPANION_GREETINGS, variation, 'companion-greeting');
}

/** Placeholder of the companion's message field on the Ask tab. */
export const COMPANION_INPUT_PLACEHOLDERS = [
  'What’s on your mind?',
  'Ask me anything…',
  'What are you thinking about?',
  'How can I help today?',
];

export function companionInputPlaceholder(variation: CopyVariation): string {
  return drawCopy(COMPANION_INPUT_PLACEHOLDERS, variation, 'companion-placeholder');
}

// ─── Generating screen ──────────────────────────────────────────────────────

/**
 * Status lines while a series is written. Each wait shows each line once.
 * They claim no step the screen already shows as done (the series title
 * appears once the server names it) and no day the series opens on. A
 * no-break space holds the last word to the one before it, so a large text
 * size never leaves it alone on a line.
 */
export const GENERATING_STATUS_LINES = [
  'Reading your\u00A0story',
  'Choosing\u00A0scripture',
  'Finding the right\u00A0words',
  'Weaving your\u00A0narrative',
  'Crafting something\u00A0personal',
  'Reading what you\u00A0shared',
  'Looking for the right\u00A0passage',
  'Planning the days\u00A0ahead',
  'Shaping the first\u00A0day',
  'Writing your first\u00A0reading',
  'Choosing questions for\u00A0you',
  'Thinking about where to\u00A0begin',
  'Weighing a few\u00A0passages',
  'Writing a closing\u00A0prayer',
  'Finding a line worth\u00A0keeping',
  'Drafting the\u00A0reflection',
  'Choosing a small\u00A0act',
  'Laying out the\u00A0series',
  'Finding a way into the\u00A0text',
  'Matching scripture to your\u00A0story',
  'Keeping your words in\u00A0mind',
  'Building the first\u00A0day',
  'Checking the\u00A0details',
];

/** Shown last, and held for the rest of a long wait. */
export const GENERATING_FINAL_LINE = 'Putting it all\u00A0together';

/**
 * The lines for a wait on `variation`'s local day: the pool once through
 * from a start the bag picks, so a wait on another day opens on a different
 * line, then the final line, held. Two waits on one day share the draw.
 */
export function generatingStatusLines(variation: CopyVariation): string[] {
  return [...drawRotation(GENERATING_STATUS_LINES, variation, 'generating-status'), GENERATING_FINAL_LINE];
}

// ─── Evening quiet ending ───────────────────────────────────────────────────
// The verse stays Psalm 4:8 (KJV): the app bundles no King James text to
// rotate from. The Bible database is an optional download.

export const QUIET_ENDING_COPY = {
  heading: [
    'Let that be enough\nfor tonight.',
    'That is enough\nfor one day.',
    'The day is\nin God’s hands.',
    'Rest well\ntonight.',
    'Nothing left\nto prove tonight.',
    'Lay the day\ndown here.',
    'Goodnight,\nand peace.',
    'Sleep in\npeace.',
    'The day can\nclose now.',
    'Done for\ntonight.',
    'Let the day\ngo quiet.',
    'Peace for\nthe night.',
  ],
  body: [
    'Your reflection has a place here.\nReturn whenever you need.',
    'Whatever is unfinished\ncan wait for tomorrow.',
    'God keeps watch\nwhile you sleep.',
    'You can come back here\nany night you need.',
    'The day is done.\nYou can let it go.',
    'Nothing else is asked of you\ntonight.',
    'Rest is a gift.\nYou can receive it.',
    'Leave the rest\nwith God.',
    'Tomorrow has its own grace.\nFor now, rest.',
    'You brought the day to God.\nNow rest.',
    'Whatever today was,\nit is held.',
    'Let your shoulders drop.\nThe day is over.',
  ],
  quietHeading: [
    'A little longer\nin the quiet.',
    'Stay as long\nas you like.',
    'No hurry\nhere.',
    'Quiet,\nfor a while.',
    'Rest here\na moment.',
    'A few more\nquiet minutes.',
    'Stay here\na while.',
    'Slow down.\nYou can stay.',
  ],
  quietBody: [
    'Nothing more to finish.\nStay here with God for a moment.',
    'No more to do tonight.\nBreathe, and rest.',
    'You don’t have to say anything.\nGod is near.',
    'Let your breathing slow.\nGod is with you.',
    'Rest in the quiet.\nGod is in no hurry.',
    'The day is finished.\nRest with God a little longer.',
    'Stay as long as you need.\nThe night can be quiet.',
    'There is nothing left to carry.\nGod has it.',
  ],
} as const;

/** The quiet ending's lines for tonight, drawn per field. */
export function quietEndingCopy(variation: CopyVariation): Record<keyof typeof QUIET_ENDING_COPY, string> {
  return {
    heading: drawCopy(QUIET_ENDING_COPY.heading, variation, 'quiet-ending-heading'),
    body: drawCopy(QUIET_ENDING_COPY.body, variation, 'quiet-ending-body'),
    quietHeading: drawCopy(QUIET_ENDING_COPY.quietHeading, variation, 'quiet-ending-quiet-heading'),
    quietBody: drawCopy(QUIET_ENDING_COPY.quietBody, variation, 'quiet-ending-quiet-body'),
  };
}
