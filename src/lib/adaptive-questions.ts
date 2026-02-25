import { DevotionalType, ThemeCategory } from '@/constants/devotional-types';

export interface QA {
  question: string;
  answer: string;
  timestamp: number;
}

export interface ConfidenceDimensions {
  spiritualContext: number;  // 0-25: Understanding of faith journey
  emotionalClarity: number;  // 0-25: Understanding of feelings
  practicalNeed: number;     // 0-25: Understanding of what they need
  topicDepth: number;        // 0-25: Understanding of chosen topic
}

export interface ConfidenceResult {
  scores: ConfidenceDimensions;
  total: number;  // 0-100
  gap: keyof ConfidenceDimensions | null;  // Which dimension needs most work
}

export type QuestionPool = 
  | 'spiritual_opening'      // Initial exploration
  | 'emotional_exploration'  // Going deeper into feelings
  | 'practical_need'         // What would help
  | 'topic_specific'         // Based on study type/theme
  | 'clarification'          // Follow-ups on vague answers
  | 'summarization';         // Confirming understanding

export interface StudyContext {
  type: 'theme' | 'type' | 'guided';
  selection?: string;
}

const MIN_CONFIDENCE = 75;
const MAX_QUESTIONS = 8;
const MIN_QUESTIONS = 2;

/**
 * Calculate confidence scores based on Q&A history
 */
export function calculateConfidence(qa: QA[]): ConfidenceResult {
  if (qa.length === 0) {
    return {
      scores: { spiritualContext: 0, emotionalClarity: 0, practicalNeed: 0, topicDepth: 0 },
      total: 0,
      gap: 'spiritualContext',
    };
  }

  const latest = qa[qa.length - 1];
  const allText = qa.map(q => q.answer).join(' ').toLowerCase();
  const allQuestions = qa.map(q => q.question).join(' ').toLowerCase();

  // Spiritual context scoring (0-25)
  const spiritualKeywords = [
    'god', 'jesus', 'faith', 'pray', 'spirit', 'church', 'bible', 'belief', 
    'worship', 'lord', 'christ', 'holy', 'scripture', 'grace', 'mercy'
  ];
  const spiritualMentions = spiritualKeywords.filter(k => allText.includes(k)).length;
  const spiritualContext = Math.min(25, 
    spiritualMentions * 3 + 
    (latest.answer.length > 50 ? 8 : 0) +
    (qa.length > 1 ? 5 : 0)
  );

  // Emotional clarity scoring (0-25)
  const emotionKeywords = [
    'feel', 'feeling', 'emotion', 'anxious', 'worried', 'peace', 'joy', 
    'fear', 'hope', 'struggle', 'happy', 'sad', 'angry', 'lonely', 
    'overwhelmed', 'excited', 'grateful', 'frustrated', 'tired', 'weary'
  ];
  const emotionMentions = emotionKeywords.filter(k => allText.includes(k)).length;
  const emotionalClarity = Math.min(25,
    emotionMentions * 4 +
    (latest.answer.length > 80 ? 8 : 0) +
    (/\b(because|since|when)\b/.test(latest.answer) ? 5 : 0)
  );

  // Practical need scoring (0-25)
  const needKeywords = [
    'need', 'want', 'help', 'advice', 'guidance', 'direction', 
    'clarity', 'wisdom', 'strength', 'peace', 'hope', 'answer',
    'understand', 'figure out', 'deal with', 'handle'
  ];
  const needMentions = needKeywords.filter(k => allText.includes(k)).length;
  const practicalNeed = Math.min(25,
    needMentions * 4 +
    (latest.answer.length > 60 ? 8 : 0) +
    (qa.some(q => q.question.includes('what would')) ? 5 : 0)
  );

  // Topic depth scoring (0-25)
  const hasSpecifics = latest.answer.length > 100 || 
    /\b(because|since|when|after|during|specific|particular)\b/.test(latest.answer);
  const topicDepth = Math.min(25,
    (hasSpecifics ? 12 : 5) +
    (qa.length * 2) +
    (allText.length > 300 ? 5 : 0)
  );

  const scores = { spiritualContext, emotionalClarity, practicalNeed, topicDepth };
  const total = spiritualContext + emotionalClarity + practicalNeed + topicDepth;

  // Find the biggest gap
  const gaps = Object.entries(scores) as [keyof ConfidenceDimensions, number][];
  gaps.sort((a, b) => a[1] - b[1]);
  const gap = total >= MIN_CONFIDENCE ? null : gaps[0][0];

  return { scores, total, gap };
}

/**
 * Determine if we have enough confidence to generate
 */
export function shouldGenerate(
  qa: QA[],
  confidence: ConfidenceResult
): { should: boolean; reason: string } {
  if (qa.length < MIN_QUESTIONS) {
    return { should: false, reason: 'min_questions' };
  }

  if (qa.length >= MAX_QUESTIONS) {
    return { should: true, reason: 'max_questions_reached' };
  }

  if (confidence.total >= MIN_CONFIDENCE) {
    return { should: true, reason: 'confidence_threshold' };
  }

  return { should: false, reason: 'insufficient_confidence' };
}

/**
 * Select the next question pool based on confidence gaps
 */
export function selectQuestionPool(
  confidence: ConfidenceResult,
  studyContext: StudyContext,
  qa: QA[]
): QuestionPool {
  if (confidence.gap) {
    switch (confidence.gap) {
      case 'spiritualContext':
        return 'spiritual_opening';
      case 'emotionalClarity':
        return 'emotional_exploration';
      case 'practicalNeed':
        return 'practical_need';
      case 'topicDepth':
        return 'topic_specific';
    }
  }

  // Fallback logic based on question count
  if (qa.length === 0) return 'spiritual_opening';
  if (qa.length === 1) return studyContext.type !== 'guided' ? 'topic_specific' : 'emotional_exploration';
  if (qa.length === 2) return 'emotional_exploration';
  if (qa.length === 3) return 'practical_need';
  
  return 'summarization';
}

/**
 * Generate prompt for GLaD API based on context
 */
export function buildAdaptivePrompt(
  qa: QA[],
  pool: QuestionPool,
  studyContext: StudyContext,
  confidence: ConfidenceResult
): string {
  const contextStr = qa.map((qa, i) => 
    `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`
  ).join('\n\n');

  const studyTypeLabel = studyContext.selection || studyContext.type;

  const poolInstructions: Record<QuestionPool, string> = {
    spiritual_opening: `
The user is just beginning to share. Help them name what's present.
Focus: Current spiritual state, what drew them to this study/theme
Avoid: Generic questions that ignore their specific choice
Tone: Curious, welcoming, open-ended`,

    emotional_exploration: `
They're shared the surface — now help them discover what's underneath.
Focus: The feeling, pattern, or fear they haven't named
Avoid: Leading questions that push toward a specific answer
Tone: Gentle but probing, helps them pause and reflect`,

    practical_need: `
Help them articulate what they're hoping for or need.
Focus: What would help right now, what they're asking for
Avoid: Assuming they need peace/rest/freedom — let them name it
Tone: Practical, grounded, inviting honesty`,

    topic_specific: `
Connect their answers back to their chosen study type/theme.
Focus: Why THIS study feels right, what they hope to find
Avoid: Academic questions about the topic — stay personal
Tone: Connects their choice to their current season`,

    clarification: `
Their last answer was vague — help them get more specific.
Focus: One specific aspect to explore deeper
Avoid: Asking for everything at once
Tone: Patient, not pushy`,

    summarization: `
Confirm what we've understood before generating.
Focus: Reflecting back what they've shared, inviting correction
Avoid: Making assumptions about what they want
Tone: Collaborative, confirming`,
  };

  return `
You are a warm spiritual guide having a conversation. Generate ONE follow-up question.

STUDY CONTEXT:
- Type: ${studyContext.type}
- Selection: ${studyTypeLabel}

CONVERSATION SO FAR:
${contextStr || '(Just beginning)'}

CONFIDENCE SCORES (0-100):
- Spiritual context: ${confidence.scores.spiritualContext}/25
- Emotional clarity: ${confidence.scores.emotionalClarity}/25  
- Practical need: ${confidence.scores.practicalNeed}/25
- Topic depth: ${confidence.scores.topicDepth}/25
- TOTAL: ${confidence.total}/100 (need ${MIN_CONFIDENCE} to generate)

QUESTION TYPE: ${pool}

INSTRUCTIONS:
${poolInstructions[pool]}

CRITICAL RULES:
- Generate ONE completely original question
- It must feel like it emerges from what they just said
- If they chose a specific study/theme, reference it directly
- Never start with "And" — vary your openings
- Never ask leading questions that suggest the answer
- Subtext should be warm, brief, and give permission to be honest

Respond with JSON only:
{"question": "...", "subtext": "..."}
`;
}

/**
 * Get exit message based on confidence and Q&A history
 */
export function getExitMessage(qa: QA[]): string {
  const messages = [
    "I think I have a good sense of where you are...",
    "Let me craft something meaningful for you...",
    "I hear you. Let me create something that meets you right there...",
    "This gives me what I need. Let me weave this into a devotional...",
    "I feel like I understand now. Let me put this together...",
  ];

  // Use a deterministic but varied message based on answer content
  const hash = qa.map(q => q.answer).join('').length % messages.length;
  return messages[hash];
}

/**
 * Get encouragement message for long sessions
 */
export function getProgressEncouragement(questionCount: number): string | null {
  if (questionCount === 4) {
    return "You're doing great — just a couple more questions...";
  }
  if (questionCount === 6) {
    return "Almost there — this is helping me understand deeply...";
  }
  return null;
}
