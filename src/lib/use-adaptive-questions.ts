import { useState, useCallback, useMemo } from 'react';
import { 
  QA, 
  ConfidenceResult, 
  calculateConfidence, 
  shouldGenerate, 
  selectQuestionPool,
  buildAdaptivePrompt,
  getExitMessage,
  getProgressEncouragement,
  StudyContext,
} from './adaptive-questions';
import { logBugEvent } from './bug-logger';
import { logger } from '@/lib/logger';
import { PERSONA_BRIEF } from '@/constants/persona';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';

interface UseAdaptiveQuestionsOptions {
  studyContext: StudyContext;
  onReadyToGenerate?: (qa: QA[]) => void;
  onError?: (error: Error) => void;
}

interface UseAdaptiveQuestionsReturn {
  // State
  qa: QA[];
  currentQuestion: string;
  currentSubtext: string;
  confidence: ConfidenceResult;
  isLoading: boolean;
  shouldGenerateNow: boolean;
  progressMessage: string | null;
  
  // Actions
  submitAnswer: (answer: string) => Promise<void>;
  reset: () => void;
  
  // Metadata
  questionCount: number;
  estimatedProgress: number; // 0-100 for UI
}

// Opening questions that are always the same
const OPENING_QUESTIONS: Record<StudyContext['type'], { question: string; subtext: string }> = {
  guided: {
    question: "What's been on your heart lately?",
    subtext: "The thing that's there when the noise quiets down.",
  },
  theme: {
    question: "What drew you to this theme?",
    subtext: "Help me understand why this resonates right now.",
  },
  type: {
    question: "What drew you to this study?",
    subtext: "Help me understand why this feels right for where you are.",
  },
};

export function useAdaptiveQuestions({
  studyContext,
  onReadyToGenerate,
  onError,
}: UseAdaptiveQuestionsOptions): UseAdaptiveQuestionsReturn {
  const [qa, setQa] = useState<QA[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentSubtext, setCurrentSubtext] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Calculate confidence whenever Q&A changes
  const confidence = useMemo(() => calculateConfidence(qa), [qa]);

  // Check if we should generate
  const generateCheck = useMemo(() => shouldGenerate(qa, confidence), [qa, confidence]);
  const shouldGenerateNow = generateCheck.should;

  // Progress message for long sessions
  const progressMessage = useMemo(() => 
    getProgressEncouragement(qa.length), 
    [qa.length]
  );

  // Estimated progress for UI (not linear - accelerates as confidence builds)
  const estimatedProgress = useMemo(() => {
    if (shouldGenerateNow) return 100;
    // Weighted: 20% for having any answers, 80% for confidence
    const baseProgress = Math.min(qa.length / 2, 1) * 20;
    const confidenceProgress = (confidence.total / 75) * 80;
    return Math.round(baseProgress + confidenceProgress);
  }, [qa.length, confidence.total, shouldGenerateNow]);

  // Initialize first question
  const initialize = useCallback(() => {
    if (isInitialized) return;
    
    const opening = OPENING_QUESTIONS[studyContext.type];
    setCurrentQuestion(opening.question);
    setCurrentSubtext(opening.subtext);
    setIsInitialized(true);

    void logBugEvent('adaptive-questions', 'initialized', {
      type: studyContext.type,
      selection: studyContext.selection,
    });
  }, [studyContext, isInitialized]);

  // Generate next question via GLaD API
  const generateNextQuestion = useCallback(async (): Promise<{ question: string; subtext: string }> => {
    try {
      setIsLoading(true);

      // Select which question pool to use
      const pool = selectQuestionPool(confidence, studyContext, qa);

      // Build prompt for GLaD
      const prompt = buildAdaptivePrompt(qa, pool, studyContext, confidence);

      // Call backend API (Grok 4.1 Fast for speed + cost + creative quality)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetch(`${PRIMARY_BACKEND_URL}/api/generate/adaptive-question`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          signal: controller.signal,
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            temperature: 0.8,
            system: `${PERSONA_BRIEF}

WHAT YOU'RE DOING: Generating ONE deeply personal follow-up question that emerges naturally from what this specific person shared.

RULES:
- The question MUST feel like it could only be asked to THIS person — never generic
- Pick up their emotional thread, not biographical details (no family roles, job titles, locations)
- Keep it short for mobile: question <= 110 characters, <= 18 words
- Vary your style: sometimes direct, sometimes metaphorical, sometimes a simple "why"
- NEVER start with "And" — vary openings
- NEVER ask leading questions that suggest their own answer
- NEVER steer toward peace/rest/freedom — people have diverse needs

SUBTEXT: One short warm phrase (<=85 chars) that gives permission to be honest.

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || data.question;

      // Parse JSON response
      try {
        const parsed = JSON.parse(content) as { question: string; subtext: string };
        return {
          question: parsed.question || 'Tell me more about that.',
          subtext: parsed.subtext || 'Take your time.',
        };
      } catch {
        // Fallback if JSON parsing fails
        return {
          question: 'What else is on your mind about this?',
          subtext: "I'm listening.",
        };
      }
    } catch (error) {
      logger.error('Failed to generate question:', error);
      
      // Fallback questions based on pool
      const fallbacks = [
        { question: 'What else is on your mind about this?', subtext: "I'm listening." },
        { question: 'Can you say more about what that feels like?', subtext: 'Help me understand.' },
        { question: 'What would be most helpful right now?', subtext: 'Be honest.' },
        { question: 'What are you hoping to find through this?', subtext: 'Take your time.' },
      ];
      
      return fallbacks[qa.length % fallbacks.length];
    } finally {
      setIsLoading(false);
    }
  }, [qa, confidence, studyContext]);

  // Submit an answer and get next question
  const submitAnswer = useCallback(async (answer: string) => {
    if (!answer.trim()) return;

    // Add to Q&A history
    const newQa: QA = {
      question: currentQuestion,
      answer: answer.trim(),
      timestamp: Date.now(),
    };

    const updatedQa = [...qa, newQa];
    setQa(updatedQa);

    // Log the interaction
    void logBugEvent('adaptive-questions', 'answer-submitted', {
      questionCount: updatedQa.length,
      confidenceTotal: confidence.total,
    });

    // Check if we should generate
    const check = shouldGenerate(updatedQa, calculateConfidence(updatedQa));
    
    if (check.should) {
      // Ready to generate!
      setCurrentQuestion(getExitMessage(updatedQa));
      setCurrentSubtext('Crafting your devotional...');
      onReadyToGenerate?.(updatedQa);
      return;
    }

    // Generate next question
    const next = await generateNextQuestion();
    setCurrentQuestion(next.question);
    setCurrentSubtext(next.subtext);
  }, [qa, currentQuestion, confidence, generateNextQuestion, onReadyToGenerate]);

  // Reset everything
  const reset = useCallback(() => {
    setQa([]);
    setCurrentQuestion('');
    setCurrentSubtext('');
    setIsInitialized(false);
    setIsLoading(false);
  }, []);

  // Auto-initialize on first render
  if (!isInitialized) {
    initialize();
  }

  return {
    qa,
    currentQuestion,
    currentSubtext,
    confidence,
    isLoading,
    shouldGenerateNow,
    progressMessage,
    submitAnswer,
    reset,
    questionCount: qa.length,
    estimatedProgress,
  };
}
