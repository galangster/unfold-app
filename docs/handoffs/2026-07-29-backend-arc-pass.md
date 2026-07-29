# Handoff: enable the Opus 5 arc pass on the Railway backend

**From:** Claude session working in `galangster/unfold-app` (cloud, no backend access)
**To:** the agent with Railway CLI/MCP access and the backend source
**Date:** 2026-07-29
**Context PR:** https://github.com/galangster/unfold-app/pull/41 (branch `claude/unfold-active-sessions-muea7x`)

## What already shipped (app side, in PR #41 — do not redo)

1. `generateSeriesArc()` in `src/lib/devotional-service.ts`: before Sonnet writes anything, one `claude-opus-5` call to `POST /api/generate/devotional` plans the series (title, through-line, per-day outline: title/scripture/theme/movement). The outline is injected into every Sonnet writing batch. Strictly best-effort: any failure degrades to a title-only arc or to exactly today's behavior. Payload shape is identical to the existing Sonnet batch call (`model`, `max_tokens: 3000`, `system`, `messages`), 60s client timeout.
2. The writing batches' system prompt is now byte-identical across all batches of a series (batch-dependent directives moved to the user prompt) — this was done so backend prompt caching can hit.

## What the backend needs (this is the actual task)

All in `backend/src/index.ts` (per `unfold-app/docs/superpowers/plans/2026-03-28-prompt-engineering-overhaul.md:1016`, `handleAIRequest` forwards `model` and validates against `ALLOWED_MODELS`; model forwarding around lines 415–430):

1. **Add `'claude-opus-5'` to `ALLOWED_MODELS`.** Without this, the arc call is rejected and the app silently falls back (visible as `arc-request-failed` bug-log events with the rejection status).
2. **Add `'claude-opus-5'` to `MODEL_COSTS`**: input $5.00, output $25.00 per 1M tokens — keeps the `ai_usage` table's `cost_estimate` accurate.
3. **Parameter handling for Opus 5**: the proxy reportedly special-cases `sonnet-5` (omits `temperature`, disables adaptive thinking). Opus 5 has the same constraints **plus**: `temperature`/`top_p`/`top_k` are rejected outright, and `thinking: {type: "disabled"}` is rejected at effort `xhigh`/`max`. Safest rule: for `claude-opus-5`, send **no** temperature and **no** `thinking` field at all (thinking-on-by-default is fine for the arc call).
4. **Prompt caching (the cost win, independent of the arc):** in the Anthropic request that `handleAIRequest` builds, send the system prompt as a cacheable block instead of a plain string:
   ```ts
   system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
   ```
   The app-side prep (stable system prompt across batches) is already merged. Expected effect: batches 2+ of every series read the cached system span at ~10% of input price. Note the minimum cacheable prefix is 1024 tokens for `claude-sonnet-5` — the devotional system prompt is far above that. Verify with `usage.cache_read_input_tokens > 0` on a second batch.

## Verification

1. Deploy, then from the app repo run a dev-build generation, or curl the proxy with a minimal request:
   `{"model":"claude-opus-5","max_tokens":16,"system":"Reply OK.","messages":[{"role":"user","content":"Say OK."}]}` → expect a normal Anthropic response, not an allowlist rejection. (Direct Railway URL requires the edge auth; go through the same path the app uses.)
2. Watch bug-log events: `arc-request-succeeded` should appear on new generations; `arc-request-failed` means the allowlist or param handling is still off.
3. Check `ai_usage` rows for `model = 'claude-opus-5'` with sane `cost_estimate`.
4. For caching: after one full series generation, `cache_read_input_tokens` in the Anthropic responses for batches 2+ should be nonzero.

## Cost context (why this is worth deploying)

- Arc pass adds ~$0.03–0.06/series (3–4k in / ~1.5k out at Opus 5 rates) vs ~$0.20–0.25/series today.
- System-prompt caching on multi-batch series saves more than that — net cost roughly flat or down, with the arc quality gain on top.
- Also active with no action needed: `claude-sonnet-5` bills at intro pricing ($2/$10 per MTok) through 2026-08-31.

## Follow-ups the cloud session flagged but did not do

- Consider routing `continueGeneratingDays` traffic (background, not latency-sensitive) through Anthropic's Message Batches API for 50% off — backend change.
- Strongly consider pushing the backend source to a GitHub repo (private is fine): it is currently unversioned outside the deploy, and connecting it would let cloud sessions maintain it.
