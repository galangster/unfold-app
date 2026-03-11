import { logger } from '@/lib/logger';
import { PERSONA_BRIEF } from '../constants/persona';

// Backend URL for proxied API calls (keeps API keys server-side)
const RAILWAY_BACKEND_URL = 'https://unfold-backend-production.up.railway.app';

const PRIMARY_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || RAILWAY_BACKEND_URL;

function getBackendCandidates(): string[] {
  const candidates = [PRIMARY_BACKEND_URL];
  if (!candidates.includes(RAILWAY_BACKEND_URL)) {
    candidates.push(RAILWAY_BACKEND_URL);
  }
  return candidates;
}

export type CompanionMood = 'Grateful' | 'Peaceful' | 'Hopeful' | 'Restless' | 'Heavy' | 'Confused';
export type CompanionResponseContext =
  | 'has_active_series'
  | 'between_series'
  | 'first_time'
  | 'returning_after_gap'
  | 'streak_milestone';

export interface CompanionResponseParams {
  mood: CompanionMood;
  companionName: string | null;
  userName: string | null;
  currentSeriesTheme: string | null;
  recentCheckIns: { mood: string; moodLabel: string; date: string }[];
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  context: CompanionResponseContext;
}

export interface CompanionResponseResult {
  response: string;
  suggestions: string[];
}

/**
 * Generate an AI-powered companion response using Grok.
 * Falls back to null on failure so callers can use hardcoded responses.
 */
export async function generateCompanionResponse(
  params: CompanionResponseParams
): Promise<CompanionResponseResult | null> {
  const {
    mood,
    companionName,
    userName,
    currentSeriesTheme,
    recentCheckIns,
    timeOfDay,
    context,
  } = params;

  // Build recent mood pattern description
  let moodPattern = '';
  if (recentCheckIns.length >= 2) {
    const recentMoods = recentCheckIns.slice(0, 5).map((c) => c.moodLabel);
    const heavyCount = recentMoods.filter((m) =>
      ['Heavy', 'Restless', 'Confused'].includes(m)
    ).length;
    const lightCount = recentMoods.filter((m) =>
      ['Grateful', 'Peaceful', 'Hopeful'].includes(m)
    ).length;

    if (heavyCount >= 3) {
      moodPattern = `They've been feeling heavy or restless lately (${recentMoods.join(', ')} in recent check-ins).`;
    } else if (lightCount >= 3) {
      moodPattern = `They've been in a good stretch lately (${recentMoods.join(', ')} recently).`;
    } else if (recentMoods.length >= 2) {
      moodPattern = `Recent check-ins: ${recentMoods.join(', ')}.`;
    }
  }

  const nameInstruction = userName
    ? `Their name is ${userName}. You can use it once, naturally, if it fits.`
    : 'You do not know their name.';

  const companionNameInstruction = companionName
    ? `They named you "${companionName}". You can reference this subtly if natural, but don't force it.`
    : '';

  const themeInstruction = currentSeriesTheme
    ? `They're currently reading a devotional series about "${currentSeriesTheme}". You can reference this if it connects to how they're feeling.`
    : 'They are not currently in an active devotional series.';

  const contextMap: Record<CompanionResponseContext, string> = {
    has_active_series: "They have an active devotional series they're working through.",
    between_series: "They're between devotional series right now.",
    first_time: "This is their first time checking in with you.",
    returning_after_gap: "They haven't opened the app in a few days. Welcome them back gently.",
    streak_milestone: "They just hit a streak milestone. Acknowledge it briefly but don't make it the whole thing.",
  };

  const systemPrompt = `${PERSONA_BRIEF}

YOU ARE A COMPANION in a devotional app. The user just told you they're feeling "${mood}" (${timeOfDay}).

${nameInstruction}
${companionNameInstruction}
${themeInstruction}
${moodPattern ? `MOOD HISTORY: ${moodPattern}` : ''}
CONTEXT: ${contextMap[context]}

YOUR JOB:
- Respond in 1-2 sentences MAX. Short. Real. Not performative.
- Acknowledge their mood honestly. No toxic positivity. No minimizing.
- If you see a mood pattern, you can gently name it ("you've been carrying a lot lately").
- If their current series theme connects, weave it in naturally.
- Also generate exactly 2 suggestion pills — short action phrases (2-5 words) that feel right for this moment.

BANNED: "journey," "season," "lean into," "sit with," "unpack," "beautiful," "amazing," "deeply," "profoundly," "truly," "really," "incredibly," "I hear you," "That's valid," "It's okay to feel"

RESPOND WITH VALID JSON ONLY: {"response": "...", "suggestions": ["...", "..."]}`;

  const userPrompt = `They're feeling: ${mood}
Time: ${timeOfDay}
Context: ${context}
${moodPattern ? `Recent moods: ${moodPattern}` : ''}
Generate a short, personal companion response and 2 suggestion pills.`;

  try {
    const backendCandidates = getBackendCandidates();
    let lastError: unknown = null;

    for (let i = 0; i < backendCandidates.length; i++) {
      const backendUrl = backendCandidates[i];
      const hasAnotherCandidate = i < backendCandidates.length - 1;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${backendUrl}/api/generate/adaptive-question`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'grok-4-1-fast-non-reasoning',
            max_tokens: 150,
            temperature: 0.8,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok && hasAnotherCandidate) {
          logger.warn(`[Companion] Backend ${backendUrl} returned ${response.status}; trying fallback`);
          continue;
        }

        if (!response.ok) {
          logger.warn(`[Companion] Backend returned ${response.status}`);
          return null;
        }

        const data = await response.json();

        // The backend typically returns the AI response in a content/text field
        let text = '';
        if (typeof data === 'string') {
          text = data;
        } else if (data?.content) {
          text = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
        } else if (data?.choices?.[0]?.message?.content) {
          text = data.choices[0].message.content;
        } else if (data?.text) {
          text = data.text;
        } else if (data?.response) {
          text = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
        } else {
          text = JSON.stringify(data);
        }

        // Try to parse as JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.response && Array.isArray(parsed.suggestions)) {
            return {
              response: String(parsed.response).trim(),
              suggestions: parsed.suggestions
                .filter((s: unknown) => typeof s === 'string' && s.trim())
                .slice(0, 2)
                .map((s: string) => s.trim()),
            };
          }
        }

        logger.warn('[Companion] Could not parse AI response:', text.slice(0, 200));
        return null;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;

        if (hasAnotherCandidate) {
          logger.warn(`[Companion] Backend ${backendUrl} failed; trying fallback`);
          continue;
        }

        throw error;
      }
    }

    logger.warn('[Companion] All backends failed:', lastError);
    return null;
  } catch (error) {
    logger.warn('[Companion] generateCompanionResponse error:', error);
    return null;
  }
}
