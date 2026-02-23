/**
 * Gemini Flash 2.5 Direct Integration
 * For truly unique, dynamic question generation
 * 
 * KEY PRINCIPLES:
 * - Each question makes a DIRECT API call to Gemini (no backend proxy)
 * - No caching - every call is unique
 * - Uses Gemini 2.5 Flash for speed + cost efficiency
 * - Falls back to existing backend if Gemini fails
 */

import { logBugError } from './bug-logger';

// Gemini Configuration
const GEMINI_MODEL = 'gemini-1.5-flash-latest';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Get API key from environment
function getGeminiApiKey(): string | null {
  // Try various env var names
  const key = 
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    null;
  
  if (!key) {
    console.warn('[Gemini] No API key found in environment');
  }
  
  return key;
}

interface GeminiQuestionResponse {
  question: string;
  subtext: string;
}

/**
 * Generate an adaptive question using Gemini Flash 2.5 directly
 * Each call is unique - no caching, no duplicate requests
 */
export async function generateAdaptiveQuestionWithGemini(
  previousAnswers: { question: string; answer: string }[],
  nextQuestionBase: { question: string; subtext: string },
  stepPosition?: 'opening' | 'depth' | 'longing'
): Promise<{ question: string; subtext: string } | null> {
  const apiKey = getGeminiApiKey();
  
  if (!apiKey) {
    console.log('[Gemini] No API key available, skipping Gemini integration');
    return null;
  }

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

    const systemPrompt = `You generate deeply personal follow-up questions for a Christian devotional app's discovery process.

YOUR ROLE: You're like a wise spiritual director who listens so well that your next question makes the person feel truly heard and helps them discover something about themselves.

${stepInstructions[currentStep] || stepInstructions.depth}

CRITICAL RULES:
- Generate a COMPLETELY ORIGINAL question — do NOT use templates
- The question MUST feel like it could only be asked to THIS person based on what they've shared
- NEVER reference specific biographical details (family roles, job titles, names, locations)
- Speak only to the emotional current beneath their words
- The question should feel like the natural next beat in a real conversation
- Vary your style: sometimes direct, sometimes metaphorical, sometimes a simple "why"
- Never start with "And" — vary your openings
- NEVER ask questions that suggest their own answer
- NEVER steer every conversation toward peace/rest/freedom
- Ask questions that could genuinely lead to DIFFERENT answers from different people

SUBTEXT: One short phrase that gives permission and makes it safe to be honest. Should feel warm, curious, spacious, gentle, or grounding.

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`;

    const userPrompt = `Here's what this person has shared so far:

${contextStr}

Generate the next question in this conversation. It should feel like it emerges directly from what they just said — not like a generic template.

IMPORTANT: If they chose a specific study type, book, character, or theme, YOUR QUESTION MUST DIRECTLY REFERENCE AND CONNECT TO THAT CHOICE.

Make them feel heard. Do NOT ask a question that steers them toward a predetermined answer.`;

    // Build the request body for Gemini
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.85, // High creativity but not chaotic
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 400,
        responseMimeType: 'application/json'
      }
    };

    // Generate unique request ID to prevent any caching
    const uniqueRequestId = `gemini_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${previousAnswers.length}`;

    console.log(`[Gemini] Making unique API call: ${uniqueRequestId}`);
    console.log(`[Gemini] Step position: ${currentStep}, Previous answers: ${previousAnswers.length}`);

    // Make direct API call to Gemini
    const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': uniqueRequestId, // Unique ID prevents caching
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gemini] API error: ${response.status}`, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the text response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.error('[Gemini] No text in response:', data);
      throw new Error('Empty response from Gemini');
    }

    // Parse JSON from response
    let parsedResult: GeminiQuestionResponse;
    
    try {
      // Try direct parse first
      parsedResult = JSON.parse(text);
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || 
                        text.match(/```\n?([\s\S]*?)\n?```/);
      
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in text
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          parsedResult = JSON.parse(objectMatch[0]);
        } else {
          throw new Error('Could not parse JSON from response');
        }
      }
    }

    // Validate the response
    if (!parsedResult.question || !parsedResult.subtext) {
      console.error('[Gemini] Invalid response structure:', parsedResult);
      throw new Error('Invalid response structure from Gemini');
    }

    // Check if it's actually different from base
    const isDifferent = parsedResult.question.trim().toLowerCase() !== 
                       nextQuestionBase.question.trim().toLowerCase();

    if (!isDifferent) {
      console.log('[Gemini] Response too similar to base, treating as failure');
      return null;
    }

    console.log(`[Gemini] Successfully generated unique question:`, {
      question: parsedResult.question.substring(0, 60) + '...',
      subtext: parsedResult.subtext.substring(0, 40) + '...',
      requestId: uniqueRequestId
    });

    return {
      question: parsedResult.question,
      subtext: parsedResult.subtext
    };

  } catch (error) {
    console.error('[Gemini] Error generating question:', error);
    logBugError('gemini_question_generation_failed', 
      error instanceof Error ? error.message : 'Unknown error', 
      { stepPosition, answerCount: previousAnswers.length }
    );
    return null;
  }
}

/**
 * Check if Gemini is available (has API key)
 */
export function isGeminiAvailable(): boolean {
  return getGeminiApiKey() !== null;
}

export default {
  generateAdaptiveQuestionWithGemini,
  isGeminiAvailable
};
