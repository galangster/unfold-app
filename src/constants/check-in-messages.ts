/**
 * Rotating copy for the check-in notifications and the home screen cards.
 *
 * Selection is a seeded shuffle bag (see lib/variation-bag.ts), drawn per
 * install and per local day. Titles and bodies are drawn independently, so
 * ~40 titles against ~100 bodies read as a few thousand distinct banners.
 */

import { stripOuterQuotes } from '@/lib/cn';
import { MAX_NOTIFICATION_BODY, truncateNotificationBody } from '@/lib/daily-reminder-content';
import { drawCopy, drawRotation, minimumGapFor, type CopyVariation } from '@/lib/variation-bag';

export type { CopyVariation };

export const MIDDAY_MESSAGES: string[] = [
  "Hey — how’s today landing?",
  "Quick pulse check. No wrong answers.",
  "Thinking of you. How’s it going?",
  "Midday moment. What’s the vibe?",
  "Just checking in. How are you?",
  "Pause for a sec. How’s your heart?",
  "Quick temperature check.",
  "How’s the day treating you?",
  "A minute for yourself. How are things?",
  "Real talk — how’s today going?",
  "Hey. Take a breath. How are you?",
  "Midday check. What’s the mood?",
  "Just popping in. You good?",
  "How’s your soul doing right now?",
  "Quick honest moment. How’s it going?",
  "What’s the vibe today?",
  "Before the afternoon rush — how are you?",
  "Mental health check. How’s it going?",
  "30 seconds for yourself.",
  "Hey friend. What’s the read today?",
  "Dropping in. How’s the day?",
  "A tiny pause. How are you really?",
  "Where are you at today?",
  "Quick gut check.",
  "How’s your energy right now?",
  "Just a moment. How’s your day?",
  "Taking your pulse. How’s it going?",
  "What would you name today so far?",
  "How are you doing — honestly?",
  "A midday moment of truth.",
  "Checking on you. How’s it going?",
  "Your daily check-in is here.",
  "How’s it going out there?",
  "What’s one word for today so far?",
  "Hey — got 30 seconds?",
  "Quick internal weather report.",
  "How’s the afternoon shaping up?",
  "Got something on your mind?",
  "Pause. Breathe. How are you?",
  "What’s one thing you’re feeling?",
  "Moment of honesty. How’s today?",
  "How are you — the real you?",
  "Quick check: still standing?",
  "What’s on your heart right now?",
  "Tiny moment of self-awareness.",
  "How’s the day unfolding?",
  "Just you and this question: how are you?",
  "Before the day runs away — how are you?",
  "Mental snapshot. How’s it going?",
  "A quiet moment to check in.",
  "Your afternoon check-in.",
  "How’s the world looking right now?",
  "Quick honest check.",
  "Keeping it real — how are you?",
  "One minute for your heart.",
  "What’s the story today?",
  "How are you carrying everything?",
  "How’s your afternoon going?",
  "Hey. No rush. How’s it going?",
  "Life check-in time.",
  "What’s on your mind today?",
  "What’s the honest read right now?",
  "One question. Be honest.",
  "What’s the honest answer today?",
  "Halfway through. How’s it feel?",
  "Just want to know: how are you?",
  "Your mood in three words?",
  "Taking a moment. What’s up?",
  "How’s the heart today?",
  "Real quick — you okay?",
  "What’s today been like so far?",
  "Checking the temperature.",
  "Your afternoon moment.",
  "How’s everything landing today?",
  "A small act of self-care starts here.",
  "What’s one honest thing about today?",
  "Quick — what are you feeling?",
  "Afternoon vibes check.",
  "Hey you. How’s it going?",
  "30 seconds of honesty.",
  "What would today’s soundtrack be?",
  "Mood report. Go.",
  "How’s the middle of your day?",
  "Taking stock. How’s it going?",
  "Your daily emotional check-in.",
  "Running on fumes or full tank?",
  "What’s the prevailing mood?",
  "Quick personal inventory.",
  "How are things — really?",
  "A brief moment of awareness.",
  "What’s weighing on you today?",
  "How’s your peace level?",
  "Just a friendly check-in.",
  "Name the feeling. No judgment.",
  "How’s the day flowing?",
  "What’s going on in there?",
  "Stop scrolling. How are you?",
  "Somewhere between morning and night — how are you?",
  "Before you forget to ask yourself: how are you?",
  "One honest sentence about today — go.",
];

export const EVENING_MESSAGES: string[] = [
  "The day’s winding down. Come sit for a minute.",
  "Before you close your eyes — one last thing.",
  "Tonight’s passage is waiting.",
  "Ready to let today go?",
  "The evening is yours. Take it slow.",
  "Time to breathe. The day is done.",
  "A quiet moment before rest.",
  "Let the day settle.",
  "Your evening wind-down is ready.",
  "Before sleep takes over — a moment of peace.",
  "The noise is fading. Come rest.",
  "One last good thing before bed.",
  "Evening peace, waiting for you.",
  "Let’s close this day gently.",
  "A quiet ending to your day.",
  "The day did its thing. Now rest.",
  "Your evening moment of stillness.",
  "Breathe out the day.",
  "A peaceful close to your day.",
  "The night is kind. Rest in it.",
  "Before tomorrow comes — be here now.",
  "Wind down. You’ve earned it.",
  "A soft landing for today.",
  "Long day? God was in it with you.",
  "Your evening calm awaits.",
  "Let this moment be gentle.",
  "The world can wait. You rest first.",
  "Evening prayer or quiet scripture?",
  "A moment between today and sleep.",
  "Let the day’s weight lift.",
  "Your nighttime ritual is here.",
  "Peace for the final hours.",
  "Slow down. You’re almost there.",
  "The evening hush is here.",
  "One sacred moment before sleep.",
  "You can put today down now.",
  "Before you sleep. One moment.",
  "Let go of what you’re holding.",
  "He watches while you rest.",
  "Your evening exhale.",
  "Before the stars take over — one moment.",
  "You’ve done enough today. Rest.",
  "A gentle transition into night.",
  "The day’s chapter is closing.",
  "Let this be your final good moment today.",
  "Evening grace is here.",
  "Your night deserves this moment.",
  "One more sacred pause.",
  "Winding down with purpose.",
  "The evening light is fading. Rest.",
  "A quiet moment in the dark.",
  "Before dreams come — one more thing.",
  "Your pre-sleep sanctuary.",
  "God’s got the night shift. You rest.",
  "The day is done. Be here.",
  "Evening stillness awaits.",
  "Let the night hold what you can’t.",
  "Your day’s final breath.",
  "A warm close to everything.",
  "Close your eyes. He’s close.",
  "Before you drift — one more moment.",
  "Your nightly wind-down.",
  "Ease into the night.",
  "A moment of peace before rest.",
  "Tomorrow is His problem, not yours.",
  "Your evening is sacred.",
  "Hush. The day is done.",
  "Let tonight be gentle.",
  "Your evening practice awaits.",
  "Before the lights go out — peace.",
  "One last quiet moment.",
  "The quiet hours are here.",
  "Your nightly moment of truth.",
  "Let the evening carry you.",
  "Today’s last gift: a moment of calm.",
  "Wind down. Tomorrow will wait.",
  "A peaceful pause in the dark.",
  "Your evening heart check.",
  "Sleep is an act of trust.",
  "Let this moment be enough.",
  "A soft conclusion to your day.",
  "Your evening retreat is ready.",
  "Breathe in the night.",
  "Nothing left to prove today.",
  "One final sacred moment.",
  "Your nightly debrief with God.",
  "The evening star is out. Rest.",
  "A gentle goodbye to today.",
  "One more thing before you rest.",
  "Let peace write the last page.",
  "Evening has arrived. Be still.",
  "Before sleep: one more moment of grace.",
  "Quiet now. You’re safe.",
  "Your nighttime sanctuary opens.",
  "Rest is not earned. It’s given.",
  "Let this day close well.",
  "One last breath. Then rest.",
  "Your pre-sleep pause.",
  "Let the dark be comforting.",
  "One last breath before tomorrow.",
  "The day is done. You did enough.",
];

export const CHECKIN_CELEBRATION_MESSAGES: string[] = [
  "Noted. Thanks for being honest.",
  "Heard you. That matters.",
  "Showing up counts. Even this.",
  "You took a moment. That’s enough.",
  "Checked in. Well done.",
  "Honesty is its own gift.",
  "That took courage. Thank you.",
  "Your heart was heard.",
  "Small moment. Big faithfulness.",
  "You paused. That’s rare.",
  "Noted with care.",
  "This moment matters.",
  "You showed up for yourself.",
  "Awareness is the first step.",
  "Real and honest. Good.",
  "Your feelings matter.",
  "A brave 30 seconds.",
  "That was worth stopping for.",
  "Self-care in its simplest form.",
  "You checked in. That’s growth.",
];

/** A midday answer that could not be saved: in the check-in sheet, and in Today's alert after an account reset. */
export const CHECKIN_NOT_SAVED_TITLE = 'Check-in not saved';
export const CHECKIN_NOT_SAVED_REASON = 'The reading it belongs to was removed from this device while you were answering.';
/** Follows the reason when the sheet holds words the reader wrote. */
export const CHECKIN_NOT_SAVED_WORDS_HINT = 'Your words are still here. Copy them to keep them.';
/** Asked before the sheet closes with words that are not copied. */
export const CHECKIN_CLOSE_WITHOUT_WORDS = {
  title: 'Close without your words?',
  message: 'They are not saved. Copy them first to keep them.',
  stay: 'Go back',
  close: 'Close',
} as const;

export const EVENING_CELEBRATION_MESSAGES: string[] = [
  "God is near tonight.",
  "He watches while you rest.",
  "His mercy is new every morning.",
  "Jesus carries what you cannot.",
  "God’s faithfulness outlasts the day.",
  "He is working even now.",
  "The Lord gives sleep\u00A0to\u00A0those\u00A0He\u00A0loves.",
  "His peace has no expiration.",
  "God holds tomorrow already.",
  "Christ’s grace covers tonight.",
  "He is the same, yesterday and forever.",
  "The Good Shepherd doesn’t sleep.",
  "His love is the last word tonight.",
  "God finishes what He starts.",
  "Rest in what He has done.",
  "His presence fills the quiet.",
  "God’s promises don’t expire overnight.",
  "He who began a good work will complete it.",
  "The Father never looks away.",
  "His compassions never fail.",
  "God’s grace is wider than today.",
  "He knit this day together for you.",
  "Jesus intercedes while you sleep.",
  "The Spirit prays what words cannot.",
  "His arm is not too short to reach you.",
  "God is writing a story through your life.",
  "He is making all things new.",
  "The cross already said everything.",
  "His kingdom comes while the world sleeps.",
  "God’s love never had a beginning.",
  "He calls you by name.",
  "Christ is risen. That changes tonight.",
  "The Word became flesh for nights like this.",
  "His light shines in the darkness.",
  "God’s ear is turned toward you.",
  "He is closer than your next breath.",
  "The Father runs toward you, not away.",
  "Jesus knows this exact feeling.",
  "His hand holds what yours released.",
  "God is sovereign over your sleep.",
  "He chose you before the world began.",
  "The Shepherd leads beside still waters.",
  "His grace is sufficient. Even now.",
  "God delights in you tonight.",
  "He numbers your days and fills them.",
];

/**
 * Titles for the midday check-in banner.
 *
 * The title is the bold line on the lock screen — the first thing read and
 * the first thing that goes stale. It used to be the single literal
 * "Your midday check-in is ready" on every notification this app has ever
 * sent.
 *
 * These are FRAMES, never questions. The body carries the question (and on a
 * premium day it is the reader's own companion nudge, naming a real person or
 * event from their life). A question in the title on top of a question in the
 * body reads as a nag, and a title that makes a claim about the day would
 * contradict a body drawn independently of it.
 */
export const MIDDAY_TITLES: string[] = [
  'A pause in your day',
  'Midday check-in',
  'One quiet minute',
  'Your afternoon moment',
  'Thirty seconds, just for you',
  'A small pause',
  'Checking in',
  'Halfway through',
  'Take a breath',
  'Your midday moment',
  'A minute of honesty',
  'Still with you',
  'A gentle interruption',
  'Come up for air',
  'One honest minute',
  'The middle of the day',
  'Room to breathe',
  'A moment off the clock',
  'Just checking in',
  'Your daily pause',
  'Between here and evening',
  'A little space to think',
  'Set it down for a minute',
  'Your afternoon pause',
  'One small stop',
  'A breath in the middle',
  'Your minute is here',
  'A quiet interruption',
  'Right here, right now',
  'Before the afternoon',
  'Your daily check-in',
  'A pause, on purpose',
  'Slow down for a second',
  'Nothing to do but answer',
  'A short honest moment',
  'Time to check in',
  'Somewhere in the middle',
  'A pause worth taking',
  'Your check-in is ready',
  'Stop here a second',
];

/**
 * Titles for the evening wind-down banner. Same rule as the midday pool:
 * a frame, not a claim and not a question. These lean on closure and rest,
 * because the body is usually the day's evening scripture.
 */
export const EVENING_TITLES: string[] = [
  'Winding down',
  'The day is closing',
  'Your evening moment',
  'One last thing',
  'Before you sleep',
  'A quiet ending',
  'Let the day settle',
  'Time to rest',
  'The last quiet hour',
  'Your evening pause',
  'Closing out today',
  'Before the lights go out',
  'A soft landing',
  'The day is done',
  'Your wind-down is ready',
  'One last quiet minute',
  'Rest is close',
  'Evening stillness',
  'Put the day down',
  'A gentle close',
  'Before tomorrow',
  'The quiet hours',
  'Your evening prayer',
  'Slow down for the night',
  'The end of today',
  'One more moment',
  'Let today go',
  'Your last pause of the day',
  'Evening has come',
  'Before rest',
  'A quiet close',
  'Today is finished',
  'The night is here',
  'Settle in',
  'One breath before sleep',
  'Come rest a minute',
  'The day can end now',
  'Your evening is here',
  'Nothing left to carry',
  'Tonight',
];

/**
 * What tapping a check-in banner opens: the life update, spoken or typed.
 * Every banner keeps the cue (PR #166), in wording that rotates, because one
 * fixed cue was the sentence a reader saw twice a day. The cue counts inside
 * the 150-character body and drops out only when the day's sentence needs the room.
 * Each wording offers an update, never an answer: the tap opens the life
 * update, which asks its own question, not the banner's.
 */
export const CHECK_IN_TAP_CUES: string[] = [
  'Tap to talk or write an update.',
  'Tap to share an update, spoken or typed.',
  'Tap to record or write a few words.',
  'Tap to tell Unfold what’s going on.',
  'Tap to share what’s happening.',
  'Tap to add a quick update.',
];

/** Lowercase words with curly apostrophes made straight. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/’/g, "'").split(/[^a-z0-9']+/).filter(Boolean);
}

/**
 * True when the body repeats three words of the title in a row, or the
 * whole title when it is shorter ('Let the day settle' over "Let the day
 * settle.").
 */
export function echoes(title: string, body: string): boolean {
  const titleWords = wordsOf(title);
  const bodyText = ` ${wordsOf(body).join(' ')} `;
  const run = Math.min(3, titleWords.length);
  for (let i = 0; i + run <= titleWords.length; i += 1) {
    if (bodyText.includes(` ${titleWords.slice(i, i + run).join(' ')} `)) return true;
  }
  return false;
}

/** The titles every day inside the bag's minimum gap around this one draws, its own included. */
function drawsNear(pool: readonly string[], variation: CopyVariation, field: string): Set<string> {
  const gap = minimumGapFor(pool.length);
  return new Set(Array.from({ length: 2 * gap - 1 }, (_, i) =>
    drawCopy(pool, { ...variation, dayIndex: variation.dayIndex - gap + 1 + i }, field)));
}

/**
 * How many swaps back a banner title follows. Each step back needs an
 * earlier day inside the gap that swapped too, so a chain this long almost
 * never happens, and the cap keeps the work bounded.
 */
const SWAP_LOOKBACK = 8;

/**
 * A banner title that does not repeat its body. Titles and bodies are drawn
 * independently, so a few pairs echo each other. On those days the title
 * steps to the next entry that does not echo the body, that no day inside
 * the bag's minimum gap draws, and that no earlier day inside the gap swapped
 * to. A later day avoids an earlier day's swap, never the other way round, so
 * two days that both swap never meet on one title, and a swap cannot bring a
 * title back early. Every day but today is scheduled with no reading
 * context, so an earlier day's swap is worked out from its context-free body.
 */
function bannerTitle(
  pool: readonly string[],
  variation: CopyVariation,
  field: string,
  body: string,
  contextFreeBody: (variation: CopyVariation) => string,
): string {
  const gap = minimumGapFor(pool.length);
  const shown = new Map<number, string>();
  const titleOn = (day: CopyVariation, dayBody: string, lookback: number): string => {
    const known = shown.get(day.dayIndex);
    if (known !== undefined) return known;
    const drawn = drawCopy(pool, day, field);
    let title = drawn;
    if (echoes(drawn, dayBody)) {
      const taken = drawsNear(pool, day, field);
      for (let back = 1; lookback > 0 && back < gap; back += 1) {
        const earlier = { ...day, dayIndex: day.dayIndex - back };
        taken.add(titleOn(earlier, contextFreeBody(earlier), lookback - 1));
      }
      title = drawRotation(pool, day, field).slice(1)
        .find((candidate) => !taken.has(candidate) && !echoes(candidate, dayBody)) ?? drawn;
    }
    shown.set(day.dayIndex, title);
    return title;
  };
  return titleOn(variation, body, SWAP_LOOKBACK);
}

/**
 * The tap cue for a sentence of `length` characters: the first cue from the
 * day's draw onward that fits and is not `previousCue`, the cue the slot's
 * fire date before this one carried. The notification batch works its fire
 * dates out in order and carries each cue to the next, and it keeps the
 * last cues it wrote, so the next batch's first banner knows the one before
 * it (lib/copy-variation.ts). When only one cue fits, it shows even when the
 * day before carried it too: that repeat stands, because a cue is better
 * than none. Undefined when no cue fits.
 */
function tapCue(length: number, variation: CopyVariation, field: string, previousCue?: string): string | undefined {
  const fitting = drawRotation(CHECK_IN_TAP_CUES, variation, field)
    .filter((cue) => length + 1 + cue.length <= MAX_NOTIFICATION_BODY);
  return fitting.find((cue) => cue !== previousCue) ?? fitting[0];
}

/**
 * The banner body: the day's sentence, then a tap cue that fits inside the
 * 150 characters (tapCue). The cue drops only when the shortest one does not
 * fit, and a banner with no sentence keeps the cue alone. `cue` is the cue
 * the body carries, for the next fire date to step past.
 */
function bannerBody(
  selected: string,
  variation: CopyVariation,
  field: string,
  previousCue?: string,
): { body: string; cue?: string } {
  const message = selected.trim();
  const cue = tapCue(message.length, variation, field, previousCue);
  if (!message) return { body: cue ?? '', cue };
  return cue ? { body: `${message} ${cue}`, cue } : { body: truncateNotificationBody(message) };
}

/** The line the check-in sheet shows once an answer is saved. */
export function getCheckInCelebrationMessage(variation: CopyVariation): string {
  return drawCopy(CHECKIN_CELEBRATION_MESSAGES, variation, 'check-in-celebration');
}

/** The evening ending's line when ambient audio is off (EveningCelebration). */
export function getEveningCelebrationMessage(variation: CopyVariation): string {
  return drawCopy(EVENING_CELEBRATION_MESSAGES, variation, 'evening-celebration');
}

// ============================================================================
// Content-aware message templates
// Interpolate devotional data for personalized check-in cards.
// Falls back to generic pool when devotional data is unavailable.
// ============================================================================

export interface DayContext {
  title?: string;
  scriptureReference?: string;
  quotableLine?: string;
  checkInQuestion?: string;
  act?: string;
  eveningScriptureRef?: string;
  companionNudge?: string;
}


/**
 * The day's quotable line as a closed sentence, so the frame after it reads
 * as a new sentence. Empty when the day has none, which renders `""` and
 * marks the template as one this day cannot fill.
 */
function quoteOf(ctx: DayContext): string {
  const line = stripOuterQuotes(ctx.quotableLine ?? '').trim();
  return line && !/[.!?…]["'”’)]*$/.test(line) ? `${line}.` : line;
}

/**
 * Frames for the midday card and banner when the day has no nudge, carry
 * line or check-in question. They vary the sentence, not only the slot word:
 * eight frames of one shape read as one line within a fortnight.
 */
export const MIDDAY_CONTENT_TEMPLATES: ((ctx: DayContext) => string)[] = [
  (ctx) => `Still thinking about "${ctx.title}"?`,
  (ctx) => `How is "${ctx.title}" landing for you?`,
  (ctx) => `That passage in ${ctx.scriptureReference}: how’s it landing?`,
  (ctx) => `How is ${ctx.scriptureReference} showing up in your afternoon?`,
  (ctx) => `Anything from "${ctx.title}" worth revisiting?`,
  (ctx) => `"${quoteOf(ctx)}" Is that still with you?`,
  (ctx) => `One thought about ${ctx.scriptureReference} before the day moves on.`,
  (ctx) => `How did "${ctx.title}" meet you today?`,
  (ctx) => `Where has "${ctx.title}" come up so far today?`,
  (ctx) => `${ctx.scriptureReference} is worth a second look.`,
  (ctx) => `What changes if "${ctx.title}" is true today?`,
  (ctx) => `Bring ${ctx.scriptureReference} into whatever comes next.`,
  (ctx) => `"${quoteOf(ctx)}" Where could that matter today?`,
  (ctx) => `Has anything from "${ctx.title}" stayed with you?`,
  (ctx) => `Which part of ${ctx.scriptureReference} keeps coming back to you?`,
  (ctx) => `"${ctx.title}" can come with you into the rest of today.`,
  (ctx) => `What did ${ctx.scriptureReference} stir up in you?`,
  (ctx) => `Is "${ctx.title}" making a difference yet?`,
  (ctx) => `"${quoteOf(ctx)}" Keep that one close.`,
  (ctx) => `Take one phrase from ${ctx.scriptureReference} into the next hour.`,
  (ctx) => `How would you sum up "${ctx.title}" for a friend?`,
  (ctx) => `${ctx.scriptureReference} still has something to say today.`,
  (ctx) => `Where is God in "${ctx.title}" for you right now?`,
  (ctx) => `"${quoteOf(ctx)}" Does that fit where you are today?`,
  (ctx) => `Who else could use the words of ${ctx.scriptureReference} today?`,
  (ctx) => `What part of "${ctx.title}" is hardest to live out?`,
  (ctx) => `A small pause with ${ctx.scriptureReference}.`,
  (ctx) => `What have you seen today that connects to "${ctx.title}"?`,
  (ctx) => `Pray one line of ${ctx.scriptureReference} before you go on.`,
  (ctx) => `"${quoteOf(ctx)}" Where have you seen that today?`,
  (ctx) => `Is there someone you could tell about "${ctx.title}"?`,
  (ctx) => `What does ${ctx.scriptureReference} ask of you today?`,
];

/** Frames for the evening card body, and the evening banner when the day has no evening scripture. */
export const EVENING_CONTENT_TEMPLATES: ((ctx: DayContext) => string)[] = [
  (ctx) => `How did "${ctx.title}" shape your day?`,
  (ctx) => `Before rest, one thought about "${ctx.title}."`,
  (ctx) => `Winding down with ${ctx.scriptureReference} on your mind.`,
  (ctx) => `How did ${ctx.scriptureReference} meet you today?`,
  (ctx) => `"${quoteOf(ctx)}" How did that land?`,
  (ctx) => `A quiet moment to reflect on "${ctx.title}."`,
  (ctx) => `Looking back on ${ctx.scriptureReference} tonight.`,
  (ctx) => `One last thought about "${ctx.title}" before sleep.`,
  (ctx) => `Where did "${ctx.title}" show up today?`,
  (ctx) => `${ctx.scriptureReference}, at the end of the day.`,
  (ctx) => `What stayed with you from "${ctx.title}"?`,
  (ctx) => `Did "${ctx.title}" change anything today?`,
  (ctx) => `Let ${ctx.scriptureReference} have the last word today.`,
  (ctx) => `"${quoteOf(ctx)}" Was that true for you today?`,
  (ctx) => `One honest look back at "${ctx.title}."`,
  (ctx) => `What would you keep from ${ctx.scriptureReference}?`,
  (ctx) => `Close the day with ${ctx.scriptureReference}.`,
  (ctx) => `Where did you need "${ctx.title}" most today?`,
  (ctx) => `"${quoteOf(ctx)}" Take that with you into rest.`,
  (ctx) => `What surprised you in ${ctx.scriptureReference}?`,
  (ctx) => `Did "${ctx.title}" come back to you today?`,
  (ctx) => `${ctx.scriptureReference} is a good place to end the day.`,
  (ctx) => `Thank God for one thing in "${ctx.title}."`,
  (ctx) => `"${quoteOf(ctx)}" Hold on to that tonight.`,
  (ctx) => `What did ${ctx.scriptureReference} ask of you today?`,
  (ctx) => `Was there a moment today that fit "${ctx.title}"?`,
  (ctx) => `Pray through ${ctx.scriptureReference} before bed.`,
  (ctx) => `A last look at "${ctx.title}" before you rest.`,
  (ctx) => `What do you want to remember about ${ctx.scriptureReference}?`,
  (ctx) => `"${quoteOf(ctx)}" Did today bear that out?`,
  (ctx) => `Rest with "${ctx.title}" in mind.`,
  (ctx) => `Which part of ${ctx.scriptureReference} goes with you into tomorrow?`,
  (ctx) => `What would you tell God about "${ctx.title}" tonight?`,
  (ctx) => `Where was ${ctx.scriptureReference} true today?`,
];

/** True when the rendered frame filled every field it interpolates. */
function isViable(rendered: string): boolean {
  return !rendered.includes('undefined') && !rendered.includes('""');
}

/**
 * A message that names the day when the day gives us something to name, and
 * otherwise draws from the slot's generic pool.
 *
 * The bag draws over the whole template list, whose length never changes, so
 * its spacing holds (audit APP-29). A template the day cannot fill gives way
 * to the generic pool instead of the next template: that pool keeps its own
 * spacing and shares no line with the templates, so a day missing a field
 * cannot land on the line the day before or after shows.
 */
function contentAwareMessage(
  pool: string[],
  templates: ((ctx: DayContext) => string)[],
  slot: 'midday' | 'evening',
  day: DayContext | null | undefined,
  variation: CopyVariation,
): string {
  if (day) {
    const message = drawCopy(templates, variation, `${slot}-template`)(day);
    if (isViable(message)) return message;
  }
  return drawCopy(pool, variation, `${slot}-body`);
}

/**
 * Content-aware midday message. The AI-generated check-in question wins when
 * generation produced one — it is already specific to this reader's day.
 */
export function getContentAwareMiddayMessage(
  day: DayContext | null | undefined,
  variation: CopyVariation,
): string {
  if (day?.checkInQuestion) return day.checkInQuestion;
  return contentAwareMessage(MIDDAY_MESSAGES, MIDDAY_CONTENT_TEMPLATES, 'midday', day, variation);
}

/** Content-aware evening message. */
export function getContentAwareEveningMessage(
  day: DayContext | null | undefined,
  variation: CopyVariation,
): string {
  return contentAwareMessage(EVENING_MESSAGES, EVENING_CONTENT_TEMPLATES, 'evening', day, variation);
}

/**
 * Selected midday check-in sentence. The Companion card and the notification
 * share this exact choice. Truncation belongs only on the OS banner.
 */
export function getMiddayCheckInBody(
  day: DayContext | null | undefined,
  carryLine: string | null | undefined,
  variation: CopyVariation,
): string {
  const nudge = day?.companionNudge?.trim();
  if (nudge) return nudge;
  const carry = carryLine?.trim();
  if (carry) return carry;
  return getContentAwareMiddayMessage(day, variation);
}

/**
 * Selected evening wind-down sentence: the evening scripture line, else the
 * content-aware evening message. Never the day's act: the act has its own
 * reminder, and on its day the wind-down steps aside for it (design call 1,
 * 2026-10-29). Truncation belongs only on the OS banner.
 */
export function getEveningWindDownBody(
  day: DayContext | null | undefined,
  variation: CopyVariation,
): string {
  const ref = day?.eveningScriptureRef?.trim();
  if (ref) return `Before rest, sit with ${ref} for a minute.`;
  return getContentAwareEveningMessage(day, variation);
}

/**
 * One check-in banner: its title and body, and the tap cue the body carries
 * (none when the sentence needs the room), for the next fire date.
 */
export interface CheckInBannerCopy {
  title: string;
  body: string;
  cue?: string;
}

/**
 * A slot's banner for its selected sentence: the title, and the body with its
 * tap cue. `contextFreeBody` is the sentence the slot selects for a day with
 * no reading context, which is how every day but today is scheduled.
 * `previousCue` is the cue the slot's fire date before this one carried.
 */
function bannerCopy(
  titles: readonly string[],
  body: string,
  contextFreeBody: (variation: CopyVariation) => string,
  variation: CopyVariation,
  slot: 'midday' | 'evening',
  previousCue?: string,
): CheckInBannerCopy {
  return {
    title: bannerTitle(titles, variation, `${slot}-title`, body, contextFreeBody),
    ...bannerBody(body, variation, `${slot}-cue`, previousCue),
  };
}

/** Title and truncated body for one midday notification occurrence. */
export function getMiddayCheckInCopy(
  day: DayContext | null | undefined,
  carryLine: string | null | undefined,
  variation: CopyVariation,
  previousCue?: string,
): CheckInBannerCopy {
  return bannerCopy(
    MIDDAY_TITLES,
    getMiddayCheckInBody(day, carryLine, variation),
    (other) => getMiddayCheckInBody(null, null, other),
    variation,
    'midday',
    previousCue,
  );
}

/** Title and truncated body for one evening notification occurrence. */
export function getEveningWindDownCopy(
  day: DayContext | null | undefined,
  variation: CopyVariation,
  previousCue?: string,
): CheckInBannerCopy {
  return bannerCopy(
    EVENING_TITLES,
    getEveningWindDownBody(day, variation),
    (other) => getEveningWindDownBody(null, other),
    variation,
    'evening',
    previousCue,
  );
}
