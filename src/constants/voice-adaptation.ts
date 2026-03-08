// ==========================================
// VOICE ADAPTATION MATRIX
// lifeStage × faithBackground × depth → prompt directives
// Calibrates vocabulary, cultural lens, focus balance,
// application style, and theological framing
// ==========================================

import type { LifeStage, FaithBackground, ContentDepth } from '@/lib/store';

interface VoiceCell {
  vocabulary: string;
  culturalLens: string;
  focusBalance: string;
  applicationStyle: string;
  theologicalFrame: string;
}

const VOICE_MATRIX: Record<string, VoiceCell> = {
  // ── STUDENT ──
  'student-new': {
    vocabulary: 'Short sentences, 8th-grade reading level. Zero jargon — if a theological term appears, define it in the same breath.',
    culturalLens: 'School pressure, social media comparison, identity formation, friendships shifting, figuring out who to trust.',
    focusBalance: '60% internal (identity, belonging, self-worth) / 40% external (how to treat the person next to you, small acts of courage).',
    applicationStyle: 'Micro-challenges that cost nothing — a text to send, a conversation to start, a 2-minute practice. No car or money required.',
    theologicalFrame: 'Discovery — faith as an open door, not a test to pass. God is curious about you, not keeping score.',
  },
  'student-growing': {
    vocabulary: 'Conversational but sharper. Can handle terms like "grace" and "redemption" without hand-holding.',
    culturalLens: 'Pressure to perform, future anxiety, romantic relationships beginning, peer identity vs. faith identity tension.',
    focusBalance: '50% internal (who you are becoming) / 50% external (how your faith changes the way you show up for others).',
    applicationStyle: 'Weekly challenges — one relational risk, one habit shift. Concrete enough to screenshot and remember.',
    theologicalFrame: 'Foundation — building something that holds weight. Faith as a framework, not a feeling.',
  },
  'student-mature': {
    vocabulary: 'Full vocabulary welcome — they read theology for fun. Match their level without being stuffy.',
    culturalLens: 'Leading peers, wrestling with doubt publicly, cultural apologetics, finding mentors, vocation discernment.',
    focusBalance: '40% internal (deepening roots) / 60% external (leadership, advocacy, the friend who is struggling).',
    applicationStyle: 'Leadership-scale actions — start a conversation, mentor someone younger, challenge an unjust norm.',
    theologicalFrame: 'Commissioning — you know enough to be dangerous for good. Now go.',
  },

  // ── BUILDING ──
  'building-new': {
    vocabulary: 'Adult but accessible. Professional tone, no condescension. Explain concepts through everyday parallels.',
    culturalLens: 'Career pressure, new relationships, financial stress, moving cities, loneliness in a crowd, imposter syndrome.',
    focusBalance: '55% internal (finding footing, identity apart from achievement) / 45% external (how to build relationships that matter).',
    applicationStyle: 'One doable thing this week — a conversation, a boundary, a 5-minute practice woven into a commute.',
    theologicalFrame: 'Discovery — faith as a compass during a season where everything is in motion.',
  },
  'building-growing': {
    vocabulary: 'Confident prose. Can reference biblical narrative without over-explaining. Avoid seminary jargon.',
    culturalLens: 'Marriage or serious relationships, career pivots, first major losses, deciding what to build your life on.',
    focusBalance: '45% internal (who am I becoming?) / 55% external (how do I love well under pressure?).',
    applicationStyle: 'Relational challenges — a hard conversation to have, a habit to build with a partner, a generosity stretch.',
    theologicalFrame: 'Foundation — laying stones that will hold weight for decades. Obedience as architecture.',
  },
  'building-mature': {
    vocabulary: 'Full theological register. Dense when the idea demands it, spare when it doesn\'t.',
    culturalLens: 'Vocational calling, systemic justice, mentoring others, church community tensions, theological nuance.',
    focusBalance: '35% internal (refining convictions) / 65% external (pour out what you\'ve been given — who lacks an advocate?).',
    applicationStyle: 'Structural challenges — advocate for someone, change a system, invest in a person nobody else sees.',
    theologicalFrame: 'Deepening roots — your faith is load-bearing now. Test it, trust it, lean on it.',
  },

  // ── MIDLIFE ──
  'midlife-new': {
    vocabulary: 'Mature, unhurried prose. No youth-culture references. Respect their life experience while gently introducing faith vocabulary.',
    culturalLens: 'Parenting weight, aging parents, career plateau or reinvention, marriage fatigue, health shifts, "is this all there is?"',
    focusBalance: '50% internal (rediscovery, permission to wonder again) / 50% external (your household, your influence, the exhausted friend).',
    applicationStyle: 'One shift in perspective this week. A prayer before the hard meeting. A note to the person you\'ve been avoiding.',
    theologicalFrame: 'Discovery — it\'s not too late to begin. God meets you in the middle of the story, not just at the start.',
  },
  'midlife-growing': {
    vocabulary: 'Substantial prose that doesn\'t waste their time. They\'ve heard platitudes — give them something that earns its place.',
    culturalLens: 'Juggling responsibilities, leadership fatigue, legacy questions, friendships thinning, body changing, grief accumulating.',
    focusBalance: '40% internal (sustainability, not burning out) / 60% external (your sphere of influence is wider than you think).',
    applicationStyle: 'Relational investments — who needs your presence this week? What boundary protects your capacity to love?',
    theologicalFrame: 'Deepening roots — faith isn\'t new anymore, but it can be alive. Pruning produces more fruit than planting.',
  },
  'midlife-mature': {
    vocabulary: 'Full theological register. Write for someone who has wrestled with God and stayed.',
    culturalLens: 'Pouring into the next generation, institutional leadership, grief and loss as teachers, simplifying life, legacy.',
    focusBalance: '35% internal (acceptance, gratitude, pruning) / 65% external (who in your sphere has no advocate? Be one this week).',
    applicationStyle: 'Challenge them to spend their accumulated wisdom — mentor, advocate, reconcile, forgive the unforgivable.',
    theologicalFrame: 'Harvest — decades of faithfulness bear fruit you may not see. Trust the long obedience.',
  },

  // ── REFLECTIVE ──
  'reflective-new': {
    vocabulary: 'Gentle, spacious prose. Room to breathe between ideas. Dignity above all — no "it\'s never too late" clichés.',
    culturalLens: 'Retirement or slowing down, health realities, loss of spouse or friends, grandchildren, looking back with questions.',
    focusBalance: '50% internal (making peace, finding meaning in the whole story) / 50% external (blessing, wisdom-sharing, intercession).',
    applicationStyle: 'Contemplative invitations — sit with this truth. Tell someone your story. Write a letter you\'ve been carrying.',
    theologicalFrame: 'Discovery — every season of life has a first day. God is not disappointed by late arrivals.',
  },
  'reflective-growing': {
    vocabulary: 'Mature prose that can hold silence. Unhurried. A sentence that ends and lets the reader sit.',
    culturalLens: 'Legacy and meaning-making, mentoring from experience, health as a spiritual practice, gratitude amid loss.',
    focusBalance: '40% internal (acceptance, gratitude, integration) / 60% external (blessing, intercession, sharing wisdom with someone younger).',
    applicationStyle: 'Share a story from your life with someone younger. Pray for someone by name. Write the thing you wish someone had told you.',
    theologicalFrame: 'Integration — the threads of your life are weaving into something. Trust the Weaver.',
  },
  'reflective-mature': {
    vocabulary: 'The fullest register — allusion, paradox, poetry. They\'ve earned prose that trusts them completely.',
    culturalLens: 'Preparing for the final chapters, deep prayer life, church elder wisdom, suffering as communion, beauty as theology.',
    focusBalance: '30% internal (union with God, surrender) / 70% external (benediction — bless everything you can reach).',
    applicationStyle: 'Benediction-scale actions — write a blessing, forgive completely, release control, pray for the church.',
    theologicalFrame: 'Union — the long journey resolves not in answers but in presence. You are held.',
  },
};

// ==========================================
// MULTI-DIMENSIONAL DEPTH SYSTEM
// 9 dimensions of theological depth — each independently tunable
// The user picks simple/balanced/theological, but under the hood
// we map that × lifeStage × faithBackground to a rich directive
// ==========================================

interface DepthProfile {
  formational: string;       // Informational (facts to extract) → Formational (let the text shape you)
  mysteryTolerance: string;  // Resolve every tension → Hold paradox as a form of knowing
  lamentPermission: string;  // Always positive → Normalize darkness, teach lament as prayer
  propheticChallenge: string; // Therapeutic comfort → Disturb the comfortable, call to justice
  canonicalAwareness: string; // Isolated proof texts → Locate in grand narrative, genre-aware
  communalConnection: string; // Privatized "God and me" → Connected to the Body across centuries
  historicalRootedness: string; // Christianity began yesterday → 2,000 years of tradition
  transformationMode: string; // Behavioral checklists → Interior renovation of will and imagination
  contemplativePosture: string; // Consume more → Less content, held in silence
}

// Build depth profile based on the three user inputs
function buildDepthProfile(
  depth: string,
  lifeStage: string,
  faithBackground: string
): DepthProfile {
  // Base profiles by depth setting
  if (depth === 'simple') {
    return {
      formational: faithBackground === 'new'
        ? 'Lead with one clear truth. State it plainly. The reader should leave with a single sentence they can carry all day.'
        : 'One truth, well-told. Strip to the essential insight. Trust the reader to go deeper on their own if they want to.',
      mysteryTolerance: 'Resolve the main tension — give the reader solid ground to stand on. Save paradox for later.',
      lamentPermission: faithBackground === 'new'
        ? 'Acknowledge pain gently but always point toward hope. They need to know God is safe before they can lament.'
        : 'Name the hard thing honestly. Don\'t rush to fix it — but do end with light visible, even if distant.',
      propheticChallenge: 'Comfort first. One small, kind nudge toward loving a neighbor — never guilt, never obligation language.',
      canonicalAwareness: 'Give just enough context to understand the passage. One sentence of "where this sits in the story" is plenty.',
      communalConnection: lifeStage === 'student'
        ? 'Mention that they\'re not the only one reading this today. Faith is not solo — but keep it light.'
        : 'A brief nod to the larger Body. Don\'t make it a lecture about church attendance.',
      historicalRootedness: 'Stay present-tense. If you reference a historical figure, make it a one-line cameo, not a history lesson.',
      transformationMode: 'One concrete action. Small. Doable before lunch. "Try this" over "become this."',
      contemplativePosture: 'Keep it moving. Short paragraphs, clear direction. They came for clarity, not silence.',
    };
  }

  if (depth === 'theological') {
    const isYounger = lifeStage === 'student' || lifeStage === 'building';
    return {
      formational: 'Let the text read the reader. Pose the question the passage asks of their life before offering interpretation. The devotional should leave them changed, not just informed.',
      mysteryTolerance: faithBackground === 'mature'
        ? 'Hold the paradox open. Sovereignty and suffering. Justice and mercy. Presence and silence. Do NOT resolve what Scripture leaves in tension. Let the reader sit in the mystery — this IS the advanced class.'
        : 'Introduce paradox gently — "Both of these are true, and the Bible holds them together." Show them that tension is not a bug in faith; it\'s a feature.',
      lamentPermission: 'Give full permission for lament. Quote the Psalms of lament. Reference Job\'s friends as a warning against easy answers. Darkness is not the absence of God — it may be the deepest form of encounter.',
      propheticChallenge: faithBackground === 'mature'
        ? 'Full prophetic register. Name complicity. Challenge comfort. "Who in your sphere has no voice? What system benefits you at another\'s cost?" Knowledge without practice is sterile — push them outward hard.'
        : 'Challenge them beyond self-improvement. Faith has an ethical horizon that extends past personal comfort. Introduce justice as a spiritual practice, not just a political position.',
      canonicalAwareness: 'Locate every passage in the grand narrative — Creation, Fall, Israel, Jesus, Church, Restoration. Name the genre (wisdom, prophecy, epistle, apocalyptic) and let that shape interpretation. Show how this text talks to other texts.',
      communalConnection: isYounger
        ? 'Connect to the global and historical Church. "Christians in the Global South read this passage very differently." "The early church understood this as..." Break the bubble of cultural Christianity.'
        : 'Deep ecclesial awareness. Reference the lectionary when relevant. Connect personal devotion to the worshipping community. "This is not just your prayer — it\'s the church\'s prayer across 20 centuries."',
      historicalRootedness: 'Draw freely from 2,000 years. Quote Augustine alongside Keller. Reference the Desert Mothers. Bring in Bonhoeffer, Teresa of Ávila, Howard Thurman, Soong-Chan Rah. The reader should feel the weight of the tradition standing behind every insight.',
      transformationMode: 'Address the will, the imagination, and the affections — not just behavior. "This truth wants to reshape how you see, not just what you do." Spiritual formation is slow interior renovation, not a productivity hack.',
      contemplativePosture: faithBackground === 'mature'
        ? 'Include silence. Literally write "Sit with this for a moment before reading on." Less content, held longer. Trust the reader\'s developing interior life. Sometimes one verse and extended stillness IS the devotional.'
        : 'Slow the pace. Longer sentences that unspool and reward attention. Signal that this is not content to consume but a space to inhabit.',
    };
  }

  // balanced (default)
  return {
    formational: 'Balance insight and formation. Give them something to think about AND something that shifts how they see. One "aha" and one "oh — that\'s about me."',
    mysteryTolerance: faithBackground === 'new'
      ? 'Mostly resolve, but leave one thread open. "There\'s more here than we can hold today." Plant a seed of comfort with not-knowing.'
      : 'Hold some tensions open. Introduce "both/and" thinking where the text supports it. The reader should feel their categories getting gently stretched.',
    lamentPermission: 'Normalize hard seasons without dramatizing them. If the passage touches pain, sit there for a beat before moving on. Don\'t rush past the wound to get to the salve.',
    propheticChallenge: lifeStage === 'reflective' || lifeStage === 'midlife'
      ? 'Balance comfort and challenge. They\'ve earned gentleness, but they also have more capacity to love outward than they think. Nudge them toward their sphere of influence.'
      : 'Balance encouragement with one clear ethical nudge per devotional. Not guilt — invitation. "What would it look like to...?"',
    canonicalAwareness: 'Give enough narrative context to make the passage come alive. Where does this sit in Israel\'s story? In Jesus\' ministry? One sentence of canonical framing transforms a proof text into a living word.',
    communalConnection: 'One touch point connecting personal devotion to the larger Body. A mention of the church calendar, a nod to brothers and sisters in other contexts, a reminder that this faith is not solo.',
    historicalRootedness: 'Drop in one historical voice per devotional — a Church Father, a Reformer, a modern theologian from outside the reader\'s tradition. Make it feel like joining a conversation, not a lecture.',
    transformationMode: 'Mix the practical ("try this") with the formational ("notice this about yourself"). The reader should walk away with something to do AND something to become.',
    contemplativePosture: lifeStage === 'reflective'
      ? 'Spacious pace. Room to breathe. A devotional that doesn\'t fill every moment with words. Include at least one pause or invitation to sit quietly.'
      : 'Moderate pace. Dense enough to reward attention, spacious enough to not feel like homework.',
  };
}

// Format a depth profile into a prompt directive string
function formatDepthDirective(profile: DepthProfile): string {
  return [
    `FORMATIONAL ORIENTATION: ${profile.formational}`,
    `MYSTERY & PARADOX: ${profile.mysteryTolerance}`,
    `LAMENT PERMISSION: ${profile.lamentPermission}`,
    `PROPHETIC-ETHICAL CHALLENGE: ${profile.propheticChallenge}`,
    `CANONICAL AWARENESS: ${profile.canonicalAwareness}`,
    `COMMUNAL CONNECTION: ${profile.communalConnection}`,
    `HISTORICAL ROOTEDNESS: ${profile.historicalRootedness}`,
    `TRANSFORMATION MODE: ${profile.transformationMode}`,
    `CONTEMPLATIVE POSTURE: ${profile.contemplativePosture}`,
  ].join('\n');
}

/**
 * Build a voice adaptation directive from the user's life stage, faith background, and depth.
 * Returns a prompt block injected into the system prompt.
 * Falls back to 'building' if lifeStage is undefined (existing users).
 *
 * The directive has two layers:
 * 1. VOICE ADAPTATION — life stage × faith background matrix (vocabulary, cultural lens, etc.)
 * 2. THEOLOGICAL DEPTH — 9 independent dimensions calibrated by depth × lifeStage × faithBackground
 */
export function buildVoiceAdaptationDirective(
  lifeStage: LifeStage | undefined,
  faithBackground: FaithBackground | undefined,
  depth: ContentDepth | undefined
): string {
  const stage = lifeStage ?? 'building';
  const faith = faithBackground ?? 'growing';
  const depthLevel = depth ?? 'balanced';

  const key = `${stage}-${faith}`;
  const cell = VOICE_MATRIX[key];
  if (!cell) return '';

  // Layer 1: Voice adaptation (life stage × faith background)
  const voiceSections = [
    `\nVOICE ADAPTATION (calibrated for reader's life stage and faith background):`,
    `VOCABULARY: ${cell.vocabulary}`,
    `CULTURAL LENS: ${cell.culturalLens}`,
    `FOCUS BALANCE: ${cell.focusBalance}`,
    `APPLICATION STYLE: ${cell.applicationStyle}`,
    `THEOLOGICAL FRAME: ${cell.theologicalFrame}`,
  ];

  // Layer 2: Multi-dimensional theological depth
  const depthProfile = buildDepthProfile(depthLevel, stage, faith);
  const depthSections = [
    `\nTHEOLOGICAL DEPTH (9 dimensions — follow ALL of these):`,
    formatDepthDirective(depthProfile),
  ];

  return voiceSections.join('\n') + '\n' + depthSections.join('\n');
}
