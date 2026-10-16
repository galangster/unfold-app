/**
 * The mirror-back reflection the app writes itself in onboarding, when the
 * backend's is missing (APP-35).
 *
 * Two line sets exist. The service's set stands in when
 * generateMirrorBackText gets no usable reply from the backend. The
 * onboarding screen's set stands in when that call throws. The two have
 * drifted apart: the screen has a third line for a situation and a hope,
 * another "took courage" sentence, and no-break spaces. Merging them waits
 * on the wording Nick picks. Both name the reader exactly as typed.
 *
 * Pure, so a test calls the builders directly with a fixed pick.
 */
import { pickRandomFromArray } from '@/constants/onboarding-questions';

/** What the mirror-back screen shows: the reflection, a verse, and the line about the series being written. */
export interface MirrorBackContent {
  reflection: string;
  verse: string;
  verseRef: string;
  anticipation: string;
  /** Plain-language read of what seems underneath — shown for ratification. */
  workingRead?: string;
}

/** The onboarding answers a fallback reflection reads. */
export interface MirrorBackAnswers {
  emotionalState?: string;
  currentSituation?: string;
  faithImpact?: string;
  spiritualSeeking?: string;
  name?: string;
}

/** Picks one line of a set. The default picks at random. */
export type LinePick = (lines: string[]) => string;

/** The service's fallback mirror-back, for when the backend gives no usable reply. */
export function buildFallbackMirrorBack(data: MirrorBackAnswers, pick: LinePick = pickRandomFromArray): MirrorBackContent {
  const hasEmotional = !!(data.emotionalState || data.currentSituation);
  const hasSeeking = !!data.spiritualSeeking;
  const nameClause = data.name ? `${data.name}, ` : '';

  let reflection: string;
  if (hasEmotional && hasSeeking) {
    reflection = pick([
      `${nameClause}something real brought you here — a weight you've been carrying, and a hope you haven't let go of.`,
      `Between where you are and where you're reaching, ${nameClause}God is already at work.`,
    ]);
  } else if (hasEmotional) {
    reflection = pick([
      `${nameClause}you named something that matters. That kind of honesty is where God meets us.`,
      `What you shared took courage, ${nameClause}and it's exactly the right place to begin.`,
    ]);
  } else {
    reflection = pick([
      `${nameClause}something drew you here today. Whatever the reason — you're in the right place.`,
      `You showed up${data.name ? `, ${data.name}` : ''}. That's the beginning of everything.`,
    ]);
  }

  return {
    reflection,
    verse: 'Be still, and know that I am God.',
    verseRef: 'Psalm 46:10',
    anticipation: 'Something is being written for you right now — crafted for exactly where you are.',
  };
}

/**
 * The onboarding screen's own reflection, for when generateMirrorBackText
 * throws. The screen pairs it with the verse for the reader's first theme.
 */
export function onboardingMirrorBackReflection(data: MirrorBackAnswers, pick: LinePick = pickRandomFromArray): string {
  const hasEmotional = !!data.currentSituation;
  const hasSeeking = !!data.spiritualSeeking;
  const nameClause = data.name ? `${data.name}, ` : '';

  if (hasEmotional && hasSeeking) {
    return pick([
      `${nameClause}something real brought you here\u00A0\u2014 a weight you've been carrying, and a hope you haven't let go\u00A0of.`,
      `Between where you are and where you're reaching, ${nameClause}God is already at\u00A0work.`,
      `${nameClause}you named what many people never pause long enough to say out\u00A0loud.`,
    ]);
  }
  if (hasEmotional) {
    return pick([
      `${nameClause}you named something that matters. That kind of honesty is where God meets\u00A0us.`,
      `What you shared took courage${data.name ? `, ${data.name}` : ''}. It's exactly the right place to\u00A0begin.`,
    ]);
  }
  return pick([
    `${nameClause}something drew you here today. Whatever the reason\u00A0\u2014 you're in the right\u00A0place.`,
    `You showed up${data.name ? `, ${data.name}` : ''}. That's the beginning of\u00A0everything.`,
  ]);
}
