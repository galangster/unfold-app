/**
 * Adaptive Question Generation (via Backend Proxy)
 * All API calls go through the backend — no API keys on the frontend.
 */

import { logBugError } from './bug-logger';
import { logger } from '@/lib/logger';
import { PERSONA_BRIEF } from '@/constants/persona';

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() ||
  'https://unfold-backend-production.up.railway.app';

interface GeminiQuestionResponse {
  question: string;
  subtext: string;
}

/**
 * Generate an adaptive question via the backend proxy.
 * Each call is unique — no caching, no duplicate requests.
 */
export async function generateAdaptiveQuestionWithGemini(
  previousAnswers: { question: string; answer: string }[],
  nextQuestionBase: { question: string; subtext: string },
  stepPosition?: 'opening' | 'depth' | 'longing'
): Promise<{ question: string; subtext: string } | null> {
  if (previousAnswers.length === 0) {
    return null;
  }

  try {
    const contextStr = previousAnswers
      .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
      .join('\n\n');

    // Determine step position
    let currentStep = stepPosition;
    if (!currentStep) {
      if (previousAnswers.length <= 1) currentStep = 'opening';
      else if (previousAnswers.length <= 3) currentStep = 'depth';
      else currentStep = 'longing';
    }

    const stepInstructions: Record<string, string> = {
      opening: `THIS IS THE OPENING QUESTION. The person is just starting to share.

YOUR GOAL: Help them name what's present for them right now. If they chose a specific study type, book, character, or theme — the question MUST center on WHY they chose it and what it stirs in them.

APPROACH:
- If they chose a BOOK OF THE BIBLE, ask what draws them to THAT specific book right now
- If they chose a CHARACTER STUDY, ask what about that person's story resonates with where they are
- If they chose a study type, ask what about that style feels right for where they are now
- If they chose a theme, explore what's happening that made that theme stand out
- DO NOT ask a generic question that ignores their selection`,

      depth: `THIS IS THE GOING-DEEPER QUESTION. They've shared what's on the surface — now help them discover what's underneath.

YOUR GOAL: Guide them toward the root feeling, the deeper pattern, or the thing they haven't named yet.

APPROACH:
- Read their previous answer carefully — what emotion is underneath the words?
- Ask about the feeling, the pattern, or the fear they haven't said out loud yet
- This should feel like the question that makes them pause and think "...yeah, actually"
- Be specific to their emotional thread, not generic
- AVOID LEADING QUESTIONS — don't push toward a specific emotional destination
- Ask OPEN questions that could lead anywhere`,

      longing: `THIS IS THE LONGING/BREAKTHROUGH QUESTION. They've shared what's happening and what's underneath — now help them name what they actually want.

YOUR GOAL: Help them articulate what they're hoping for, longing for, or need from God in this season.

APPROACH:
- They've been vulnerable — honor that by asking something that moves toward what THEY want
- Don't be artificially positive, but orient toward what could be different
- AVOID LEADING QUESTIONS — don't assume they need peace/freedom/release
- Ask what THEY are looking for, not what sounds like a good devotional answer`,
    };

    const systemPrompt = `${PERSONA_BRIEF}

WHAT YOU'RE DOING: Generating deeply personal follow-up questions for a discovery process. You're listening so carefully that your next question makes the person feel heard.

${stepInstructions[currentStep] || stepInstructions.depth}

RULES:
- Generate a COMPLETELY ORIGINAL question — no templates
- The question MUST feel like it could only be asked to THIS person
- NEVER reference biographical details (family roles, job titles, names, locations)
- Speak to the emotional current beneath their words
- The question should feel like the natural next beat in a real conversation
- Vary your style: sometimes direct, sometimes metaphorical, sometimes a simple "why"
- Never start with "And" — vary your openings
- NEVER ask questions that suggest their own answer
- NEVER steer every conversation toward peace/rest/freedom
- Ask questions that could genuinely lead to DIFFERENT answers from different people

SUBTEXT: One short phrase that gives permission to be honest. Warm, curious, grounding.

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`;

    const userPrompt = `Here's what this person has shared so far:

${contextStr}

Generate the next question in this conversation. It should feel like it emerges directly from what they just said — not like a generic template.

IMPORTANT: If they chose a specific study type, book, character, or theme, YOUR QUESTION MUST DIRECTLY REFERENCE AND CONNECT TO THAT CHOICE.

Make them feel heard. Do NOT ask a question that steers them toward a predetermined answer.`;

    logger.log(`[Adaptive] Calling backend, step: ${currentStep}, answers: ${previousAnswers.length}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${BACKEND_URL}/api/generate/adaptive-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        max_tokens: 400,
        temperature: 0.85,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Adaptive] Backend error: ${response.status}`, errorText);
      throw new Error(`Backend API error: ${response.status}`);
    }

    const data = await response.json();

    // Backend may return structured JSON directly or { content: [{ text: "..." }] }
    let parsedResult: GeminiQuestionResponse;

    if (typeof data?.question === 'string' && data.question.trim()) {
      parsedResult = data as GeminiQuestionResponse;
    } else {
      const text = data?.content?.[0]?.text ?? data?.text;
      if (!text) {
        console.error('[Adaptive] No text in response:', data);
        throw new Error('Empty response from backend');
      }

      try {
        parsedResult = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
                          text.match(/```\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[1]);
        } else {
          const objectMatch = text.match(/\{[\s\S]*\}/);
          if (objectMatch) {
            parsedResult = JSON.parse(objectMatch[0]);
          } else {
            throw new Error('Could not parse JSON from response');
          }
        }
      }
    }

    if (!parsedResult.question || !parsedResult.subtext) {
      console.error('[Adaptive] Invalid response structure:', parsedResult);
      throw new Error('Invalid response structure');
    }

    const isDifferent = parsedResult.question.trim().toLowerCase() !==
                       nextQuestionBase.question.trim().toLowerCase();

    if (!isDifferent) {
      logger.log('[Adaptive] Response too similar to base, treating as failure');
      return null;
    }

    logger.log(`[Adaptive] Generated unique question:`, {
      question: parsedResult.question.substring(0, 60) + '...',
      subtext: parsedResult.subtext.substring(0, 40) + '...',
    });

    return {
      question: parsedResult.question,
      subtext: parsedResult.subtext
    };

  } catch (error) {
    console.error('[Adaptive] Error generating question:', error);
    logBugError('adaptive_question_generation_failed',
      error instanceof Error ? error.message : 'Unknown error',
      { stepPosition, answerCount: previousAnswers.length }
    );
    return null;
  }
}

/**
 * Check if the backend is available (always true — no client-side key needed)
 */
export function isGeminiAvailable(): boolean {
  return true;
}

export default {
  generateAdaptiveQuestionWithGemini,
  isGeminiAvailable
};
