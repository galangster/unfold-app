/* eslint-disable no-console */

type HealthResult = {
  ok: boolean;
  backendUrl: string;
  status?: number;
  mode?: 'structured-json' | 'anthropic-content';
  questionPreview?: string;
  error?: string;
};

const DEFAULT_REMOTE_BACKEND = 'https://oversight-cloning.vibecode.run';

function backendCandidates(): string[] {
  const primary = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL?.trim() || DEFAULT_REMOTE_BACKEND;
  const explicitFallback = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_FALLBACK_URL?.trim();

  const candidates = [primary];
  if (explicitFallback && !candidates.includes(explicitFallback)) candidates.push(explicitFallback);
  if (!candidates.includes(DEFAULT_REMOTE_BACKEND)) candidates.push(DEFAULT_REMOTE_BACKEND);
  return candidates;
}

function extractQuestion(data: any): { question?: string; mode?: HealthResult['mode'] } {
  if (typeof data?.question === 'string' && data.question.trim()) {
    return { question: data.question, mode: 'structured-json' };
  }

  const content = data?.content?.[0]?.text;
  if (typeof content !== 'string' || !content.trim()) return {};

  let jsonText = content;
  const markdownMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (markdownMatch) jsonText = markdownMatch[1].trim();
  else {
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonText = objectMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (typeof parsed?.question === 'string' && parsed.question.trim()) {
      return { question: parsed.question, mode: 'anthropic-content' };
    }
  } catch {
    // ignored; handled by empty return
  }

  return {};
}

async function checkBackend(backendUrl: string): Promise<HealthResult> {
  try {
    const response = await fetch(`${backendUrl}/api/generate/adaptive-question`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        temperature: 0.7,
        system: 'Return valid JSON only: {"question":"...","subtext":"..."}',
        messages: [
          {
            role: 'user',
            content:
              'Q: What type of devotional study did you choose? A: Book Study: Romans\n\nGenerate a thoughtful next discovery question.',
          },
        ],
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        backendUrl,
        status: response.status,
        error: text.slice(0, 220),
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        backendUrl,
        status: response.status,
        error: `Non-JSON response: ${text.slice(0, 220)}`,
      };
    }

    const extracted = extractQuestion(parsed);
    if (!extracted.question) {
      return {
        ok: false,
        backendUrl,
        status: response.status,
        error: `No parseable question in response: ${text.slice(0, 220)}`,
      };
    }

    return {
      ok: true,
      backendUrl,
      status: response.status,
      mode: extracted.mode,
      questionPreview: extracted.question.slice(0, 120),
    };
  } catch (error: any) {
    return {
      ok: false,
      backendUrl,
      error: error?.message || String(error),
    };
  }
}

async function main() {
  const candidates = backendCandidates();
  console.log('[adaptive-health] candidates:', candidates);

  const results: HealthResult[] = [];
  for (const url of candidates) {
    const result = await checkBackend(url);
    results.push(result);
    console.log('[adaptive-health] result:', result);
    if (result.ok) {
      console.log('[adaptive-health] PASS using', url);
      process.exit(0);
    }
  }

  console.error('[adaptive-health] FAIL: no healthy backend produced a parseable adaptive question');
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}

main();
