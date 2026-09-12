/**
 * Rotating copy for the check-in notifications and the home screen cards.
 *
 * Selection is a seeded shuffle bag (see lib/variation-bag.ts), drawn per
 * install and per local day. Titles and bodies are drawn independently, so
 * ~40 titles against ~100 bodies read as a few thousand distinct banners.
 */

import { stripOuterQuotes } from '@/lib/cn';
import { truncateNotificationBody } from '@/lib/daily-reminder-content';
import { pickFromBag } from '@/lib/variation-bag';

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
 * because the body is usually the day's "act" or its evening scripture.
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
 * Which draw a piece of copy belongs to.
 *
 * `seed` is the stable per-install identity, so two readers are never on the
 * same sequence. `dayIndex` is the local calendar day (see `dayIndexFor`), so
 * the copy turns over at the reader's own midnight — and so a notification
 * being SCHEDULED for a day five days out can be given that day's copy now,
 * rather than today's copy baked into every future occurrence.
 */
export interface CopyVariation {
  seed: string;
  dayIndex: number;
}

/**
 * Draw from `pool` for this day, salted so each field moves independently.
 * The `?? pool[0]` floor only fires if a pool is emptied by a bad edit.
 */
function draw<T>(pool: readonly T[], variation: CopyVariation, field: string): T {
  return pickFromBag(pool, `${variation.seed}|${field}`, variation.dayIndex) ?? pool[0];
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


const MIDDAY_CONTENT_TEMPLATES: ((ctx: DayContext) => string)[] = [
  (ctx) => `Still thinking about "${ctx.title}"?`,
  (ctx) => `How is "${ctx.title}" landing for you?`,
  (ctx) => `That passage in ${ctx.scriptureReference} — how’s it landing?`,
  (ctx) => `How is ${ctx.scriptureReference} showing up in your afternoon?`,
  (ctx) => `Anything from "${ctx.title}" worth revisiting?`,
  (ctx) => `"${stripOuterQuotes(ctx.quotableLine ?? '')}" — still resonating?`,
  (ctx) => `One thought about ${ctx.scriptureReference} before the day moves on.`,
  (ctx) => `How did "${ctx.title}" meet you today?`,
];

const EVENING_CONTENT_TEMPLATES: ((ctx: DayContext) => string)[] = [
  (ctx) => `How did "${ctx.title}" shape your day?`,
  (ctx) => `Before rest — one thought about "${ctx.title}."`,
  (ctx) => `Winding down with ${ctx.scriptureReference} on your mind.`,
  (ctx) => `How did ${ctx.scriptureReference} meet you today?`,
  (ctx) => `"${stripOuterQuotes(ctx.quotableLine ?? '')}" — how did that land?`,
  (ctx) => `A quiet moment to reflect on "${ctx.title}."`,
  (ctx) => `Looking back on ${ctx.scriptureReference} tonight.`,
  (ctx) => `One last thought about "${ctx.title}" before sleep.`,
];

/** Templates whose every interpolated field is actually present on `day`. */
function viableTemplates(
  templates: ((ctx: DayContext) => string)[],
  day: DayContext,
): ((ctx: DayContext) => string)[] {
  return templates.filter((template) => {
    const rendered = template(day);
    return !rendered.includes('undefined') && !rendered.includes('""');
  });
}

/**
 * A message that names the day when the day gives us something to name, and
 * otherwise draws from the slot's generic pool.
 */
function contentAwareMessage(
  pool: string[],
  templates: ((ctx: DayContext) => string)[],
  slot: 'midday' | 'evening',
  day: DayContext | null | undefined,
  variation: CopyVariation,
): string {
  if (!day) return draw(pool, variation, `${slot}-body`);
  const viable = viableTemplates(templates, day);
  if (viable.length === 0) return draw(pool, variation, `${slot}-body`);
  return draw(viable, variation, `${slot}-template`)(day);
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
 * Body of the midday check-in notification. The companion nudge wins when
 * generation produced one (it names something from the reader's own life),
 * then the carry line of the day finished today, then the day's check-in
 * question, then a template that names the day, then the generic pool.
 */
export function getMiddayCheckInBody(
  day: DayContext | null | undefined,
  carryLine: string | null | undefined,
  variation: CopyVariation,
): string {
  const nudge = day?.companionNudge?.trim();
  if (nudge) return truncateNotificationBody(nudge);
  const carry = carryLine?.trim();
  if (carry) return truncateNotificationBody(carry);
  return truncateNotificationBody(getContentAwareMiddayMessage(day, variation));
}

/**
 * Body of the evening wind-down notification. The day's "act" is the one
 * thing the devotional asked the reader to do later, so it leads. Then the
 * evening scripture, then a template that names the day, then the pool.
 */
export function getEveningWindDownBody(
  day: DayContext | null | undefined,
  variation: CopyVariation,
): string {
  const act = day?.act?.trim();
  if (act) return truncateNotificationBody(act);
  const ref = day?.eveningScriptureRef?.trim();
  if (ref) return truncateNotificationBody(`Before rest, sit with ${ref} for a minute.`);
  return truncateNotificationBody(getContentAwareEveningMessage(day, variation));
}

/** Title and body for one midday occurrence. */
export function getMiddayCheckInCopy(
  day: DayContext | null | undefined,
  carryLine: string | null | undefined,
  variation: CopyVariation,
): { title: string; body: string } {
  return {
    title: draw(MIDDAY_TITLES, variation, 'midday-title'),
    body: getMiddayCheckInBody(day, carryLine, variation),
  };
}

/** Title and body for one evening occurrence. */
export function getEveningWindDownCopy(
  day: DayContext | null | undefined,
  variation: CopyVariation,
): { title: string; body: string } {
  return {
    title: draw(EVENING_TITLES, variation, 'evening-title'),
    body: getEveningWindDownBody(day, variation),
  };
}
