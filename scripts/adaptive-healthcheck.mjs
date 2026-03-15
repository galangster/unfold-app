/* Adaptive backend healthcheck for onboarding Q4 generation */

const DEFAULT_REMOTE_BACKEND = 'https://unfold-backend-production.up.railway.app';

function backendCandidates() {
  const primary = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || DEFAULT_REMOTE_BACKEND;
  const candidates = [primary];
  if (!candidates.includes(DEFAULT_REMOTE_BACKEND)) candidates.push(DEFAULT_REMOTE_BACKEND);
  return candidates;
}

function extractQuestion(data) {
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
  } catch {}

  return {};
}

async function checkBackend(backendUrl) {
  const response = await fetch(`${backendUrl}/api/generate/adaptive-question`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      temperature: 0.7,
      system: 'Return valid JSON only: {"question":"...","subtext":"..."}',
      messages: [{ role: 'user', content: 'Q: What type of devotional study did you choose? A: Book Study: Romans. Generate next question.' }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    return { ok: false, backendUrl, status: response.status, error: text.slice(0, 220) };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, backendUrl, status: response.status, error: `Non-JSON response: ${text.slice(0, 220)}` };
  }

  const extracted = extractQuestion(parsed);
  if (!extracted.question) {
    return { ok: false, backendUrl, status: response.status, error: `No parseable question in payload: ${text.slice(0, 220)}` };
  }

  return {
    ok: true,
    backendUrl,
    status: response.status,
    mode: extracted.mode,
    questionPreview: extracted.question.slice(0, 120),
  };
}

async function main() {
  const candidates = backendCandidates();
  console.log('[adaptive-health] candidates:', candidates);

  const failures = [];
  for (const url of candidates) {
    try {
      const result = await checkBackend(url);
      console.log('[adaptive-health] result:', result);
      if (result.ok) {
        console.log('[adaptive-health] PASS using', url);
        return;
      }
      failures.push(result);
    } catch (err) {
      failures.push({ ok: false, backendUrl: url, error: err?.message || String(err) });
    }
  }

  console.error('[adaptive-health] FAIL: no healthy backend produced a parseable adaptive question');
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

main();
