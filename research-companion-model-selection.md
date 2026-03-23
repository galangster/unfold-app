# Unfold Companion Chatbot: AI Model Selection Research

**Date**: March 21, 2026
**Goal**: Select the best AI model(s) for Unfold's spiritual companion chatbot feature
**Current state**: Grok 4.1 Fast (non-reasoning) used for all lightweight AI calls; Claude Haiku 4.5 used for devotional generation

---

## 1. Pricing Comparison (Per Million Tokens, March 2026)

| Model | Input $/MTok | Output $/MTok | Context Window | Batch Discount |
|-------|-------------|---------------|----------------|----------------|
| **Claude Haiku 3** | $0.25 | $1.25 | 200K | 50% off |
| **Claude Haiku 4.5** | $1.00 | $5.00 | 200K | 50% off |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | 1M | 50% off |
| **Claude Opus 4.6** | $5.00 | $25.00 | 1M | 50% off |
| **Grok 4.1 Fast** | $0.20 | $0.50 | 2M | 50% off |
| **Grok 4.20 Beta** | $2.00 | $6.00 | 2M | 50% off |

### Prompt Caching (Claude only)
- Cache writes: 1.25x base input (5-min) or 2x base input (1-hour)
- Cache reads (hits): 0.1x base input (90% savings on cached portion)
- Huge savings for chatbot with static system prompt + persona

### Prompt Caching (xAI)
- Cached input pricing available: Grok 4.1 Fast at $0.05/MTok cached (75% savings)
- Grok 4.20 at $0.20/MTok cached (90% savings)

---

## 2. Latency Benchmarks

| Model | TTFT (Time to First Token) | Output Speed (tok/s) | Notes |
|-------|---------------------------|---------------------|-------|
| **Claude Haiku 3** | ~0.35s | ~120 tok/s | Fastest Claude, lower quality |
| **Claude Haiku 4.5** | 0.60-0.68s | 91.7 tok/s | Sub-second, very consistent (p95: 0.61s) |
| **Claude Sonnet 4.6** | ~1.4s | ~63 tok/s | Adequate for chat, not instant-feel |
| **Claude Opus 4.6** | ~1.5s | ~80 tok/s | Too slow for chat TTFT |
| **Grok 4.1 Fast (non-reasoning)** | 0.52-0.55s | 139.7-153 tok/s | Fastest overall, cheapest |
| **Grok 4.20 (reasoning off)** | ~1.0s | ~100 tok/s | Good speed but 10x cost of 4.1 Fast |

### Key Insight for Chat UX
Your target is <500ms TTFT. Only two models consistently hit that:
1. **Grok 4.1 Fast**: 0.52s median (closest to target)
2. **Claude Haiku 4.5**: 0.60s median (slightly over but functionally instant)
3. **Claude Haiku 3**: ~0.35s (fastest but lowest quality)

Sonnet and Opus are too slow for a chat-first UX where immediacy matters.

---

## 3. Quality Comparison for Conversational AI

### Intelligence Scores (Artificial Analysis Index)
| Model | Score | Context |
|-------|-------|---------|
| Claude Opus 4.6 | ~55 | Best conversational quality |
| Claude Sonnet 4.6 | ~42 | Very strong reasoning + conversation |
| Claude Haiku 4.5 | 31 | Above average for price tier (median: 21) |
| Grok 4.1 Fast | 24 | Above average for price tier (median: 15) |
| Grok 4.20 | 48 | Strong reasoning, lower than Opus |
| Claude Haiku 3 | ~18 | Below Haiku 4.5, struggles with nuance |

### Conversational Warmth & Empathy
- **Claude family** is widely regarded as the most empathetic and warm of all LLM families. Anthropic's training specifically targets "warm relationship with humans" while maintaining honesty.
- **Claude Haiku 4.5** demonstrated "superior performance in creativity, storytelling, empathy, and multi-step reasoning compared to GPT-5-mini" in testing.
- **Haiku 4.5 vs Haiku 3**: Quality jump is 15-30% across reasoning, instruction following, and creative tasks. Haiku 3 "required constant babysitting to follow instructions" while 4.5 "just works."
- **Grok 4.1 Fast**: Competent conversational ability but trained with a more direct/edgy tone. Less natural warmth than Claude. Better at factual tasks than empathetic ones.
- **Grok 4.20**: Better conversational quality with "lowest hallucination rate on the market" but 10x the cost of 4.1 Fast.

### Theological Accuracy
- Neither model family has specific theological training, but both can be effectively guided via system prompts.
- **Claude** tends to be more careful and nuanced with sensitive topics (including religion), making it a better fit for theological accuracy.
- **Grok** is more assertive and less hedging, which can be good (no wishy-washy answers) or bad (may make stronger claims than warranted).
- Your existing `PERSONA_FULL` and `PERSONA_BRIEF` prompts (~300 and ~80 tokens respectively) already handle voice calibration well.
- **The system prompt matters more than the model** for theological accuracy. RAG with your knowledge base will be the real differentiator.

### Safety & Crisis Handling
- **Claude** has the strongest safety training for crisis/mental health situations. It will appropriately redirect to crisis resources and avoid giving harmful advice.
- **Grok** is less conservative, which could be a liability in a spiritual context where users may share deep emotional pain.
- For a devotional app where users share vulnerabilities, Claude's safety alignment is a significant advantage.

---

## 4. Streaming API Support

All models support streaming via SSE (Server-Sent Events):

| Model | Streaming | Protocol |
|-------|-----------|----------|
| Claude Haiku 3 | Yes | SSE (stream: true) |
| Claude Haiku 4.5 | Yes | SSE (stream: true) |
| Claude Sonnet 4.6 | Yes | SSE (stream: true) |
| Claude Opus 4.6 | Yes | SSE (stream: true) |
| Grok 4.1 Fast | Yes | SSE (stream: true) |
| Grok 4.20 | Yes | SSE (stream: true) |

Both Anthropic and xAI APIs are OpenAI-compatible for streaming. Your Railway backend already routes by model prefix (grok-* to xAI, claude-* to Anthropic), so switching between models requires zero backend changes.

---

## 5. Context Window Analysis

### What the Companion Chatbot Needs Per Request
| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt (PERSONA_BRIEF + companion instructions) | ~200 |
| User profile (name, preferences, mood history) | ~150 |
| Conversation history (last 10-20 messages) | ~1,000-3,000 |
| Current devotional context | ~200 |
| Safety/crisis instructions | ~100 |
| **Total typical input** | **~1,650-3,650** |
| **Expected output** | **~100-300** |

### Context Window Assessment
All models have more than enough context window for this use case:
- Even Claude Haiku with 200K tokens could hold ~55-120 full conversations worth of history
- Context window is NOT a differentiator for this use case
- The 2M window on Grok models is irrelevant overkill for chat

---

## 6. Cost Modeling

### Assumptions
- **Free users**: 5 messages/day
- **Premium users**: ~20 messages/day average (unlimited but typical usage)
- **Premium adoption**: 5% of DAU
- **Average input per message**: ~2,500 tokens (with system prompt, history, context)
- **Average output per message**: ~200 tokens
- **With prompt caching**: System prompt (~200 tokens) cached, reducing effective input cost by ~8% on Claude

### Per-Message Cost

| Model | Input Cost | Output Cost | Total/Message |
|-------|-----------|-------------|---------------|
| Claude Haiku 3 | $0.000625 | $0.000250 | **$0.000875** |
| Claude Haiku 4.5 | $0.002500 | $0.001000 | **$0.003500** |
| Claude Haiku 4.5 (cached) | $0.002300 | $0.001000 | **$0.003300** |
| Claude Sonnet 4.6 | $0.007500 | $0.003000 | **$0.010500** |
| Claude Opus 4.6 | $0.012500 | $0.005000 | **$0.017500** |
| Grok 4.1 Fast | $0.000500 | $0.000100 | **$0.000600** |
| Grok 4.20 | $0.005000 | $0.001200 | **$0.006200** |

### Monthly Cost at Scale

**Messages per month** = (DAU * 0.95 * 5 free) + (DAU * 0.05 * 20 premium) = DAU * 5.75 msgs/day * 30 = DAU * 172.5 msgs/month

| Model | 1K DAU | 10K DAU | 100K DAU |
|-------|--------|---------|----------|
| **Grok 4.1 Fast** | **$104** | **$1,035** | **$10,350** |
| Claude Haiku 3 | $151 | $1,508 | $15,075 |
| Claude Haiku 4.5 | $604 | $6,038 | $60,375 |
| Claude Haiku 4.5 (cached) | $569 | $5,693 | $56,925 |
| Grok 4.20 | $1,070 | $10,695 | $106,950 |
| Claude Sonnet 4.6 | $1,811 | $18,113 | $181,125 |
| Claude Opus 4.6 | $3,019 | $30,188 | $301,875 |

### Cost Reality Check
At 100K DAU:
- **Grok 4.1 Fast**: ~$10K/month -- very sustainable
- **Claude Haiku 4.5**: ~$57K/month (with caching) -- expensive but viable with premium revenue
- **Claude Sonnet 4.6**: ~$181K/month -- only viable for premium-only features
- **Claude Opus 4.6**: ~$302K/month -- not viable for chat at scale

---

## 7. Model Routing Strategy (Recommended)

### The Sweet Spot: Tiered Routing

Instead of picking one model, route by complexity:

```
User sends message
  |
  v
[Classifier] -- lightweight check (~10 tokens, negligible cost)
  |
  |-- Simple (greetings, mood check-ins, quick encouragement)
  |     --> Grok 4.1 Fast ($0.0006/msg)
  |     ~70% of messages
  |
  |-- Standard (devotional discussion, scripture questions, prayer requests)
  |     --> Claude Haiku 4.5 ($0.0033/msg with caching)
  |     ~25% of messages
  |
  |-- Complex (theological depth, crisis/sensitive, multi-turn reasoning)
  |     --> Claude Sonnet 4.6 ($0.0105/msg)
  |     ~5% of messages
```

### Blended Cost with Routing

| DAU | Grok 4.1 (70%) | Haiku 4.5 (25%) | Sonnet 4.6 (5%) | **Blended Total** |
|-----|-----------------|-----------------|-----------------|-------------------|
| 1K | $72 | $142 | $91 | **$305/mo** |
| 10K | $724 | $1,423 | $906 | **$3,053/mo** |
| 100K | $7,245 | $14,231 | $9,056 | **$30,532/mo** |

This is 50% cheaper than Claude Haiku 4.5 for everything, while having BETTER quality on complex questions.

### How to Implement the Classifier

Option A (simplest): **Keyword/pattern matching** on the client side
- Crisis keywords --> Sonnet
- Scripture references, theological questions --> Haiku 4.5
- Everything else --> Grok 4.1 Fast

Option B (smarter): **Grok 4.1 Fast as the classifier itself**
- Send a 1-line classification prompt (~50 tokens) to Grok 4.1 Fast
- It returns "simple", "standard", or "complex"
- Cost: ~$0.00003 per classification (negligible)
- Then route to the appropriate model

Option C (progressive): **Start with Grok, escalate if needed**
- Always start with Grok 4.1 Fast
- If the response quality seems insufficient (user asks follow-up, topic is sensitive), retry with Haiku 4.5
- Only escalate to Sonnet 4.6 for detected crisis/deep theological reasoning

---

## 8. What Competitors Use

### Faith AI Apps (2026 Landscape)
Most faith AI apps don't disclose their underlying models. Based on feature analysis:

| App | Likely Approach | Notes |
|-----|----------------|-------|
| **Bible Chat** | GPT-4 variant | Claims "trained exclusively on Scripture" (fine-tuned/RAG) |
| **FaithGPT** | GPT-4 + fine-tuning | Multiple AI features (chat, image, video) |
| **bible.ai** | Unknown, voice-first | Conversational Bible engagement |
| **Faith Guide** | Unknown, free tier | "Unlimited conversations" suggests cheap model |
| **Glorify** | Unknown | $40M a16z raise, aggressive paywall |

### Key Differentiator for Unfold
Most competitors use OpenAI (GPT) models. None are known to use Claude. Using Claude's naturally warm, empathetic tone as your conversational backbone is a genuine differentiator. The persona you've built in `persona.ts` is already excellent -- Claude follows those anti-slop instructions far more faithfully than Grok or GPT.

---

## 9. Recommendation

### Primary Recommendation: Tiered Model Routing

**Tier 1 (70% of messages): Grok 4.1 Fast (non-reasoning)**
- For: Greetings, mood check-ins, simple encouragement, suggestion pills
- Why: $0.0006/message, 0.52s TTFT, 153 tok/s
- Already integrated in your backend
- Good enough for short, structured responses (1-2 sentences)

**Tier 2 (25% of messages): Claude Haiku 4.5**
- For: Scripture discussion, devotional questions, prayer support, emotional conversations
- Why: $0.0033/message (with caching), 0.60s TTFT, 92 tok/s
- Best warmth-to-cost ratio in the industry
- Claude's empathy training is a real advantage for spiritual conversations
- Enable 1-hour prompt caching for the system prompt + persona

**Tier 3 (5% of messages): Claude Sonnet 4.6**
- For: Complex theological questions, crisis detection, multi-turn deep reasoning
- Why: $0.0105/message, best reasoning quality at reasonable cost
- Strongest safety guardrails for crisis situations
- Only triggered when the conversation demands depth

### Why NOT a single model?

| Single Model | Monthly @ 10K DAU | Problem |
|-------------|-------------------|---------|
| Grok 4.1 Fast only | $1,035 | Lacks warmth/empathy for deep spiritual conversations |
| Haiku 4.5 only | $5,693 | 5.5x more expensive, not justified for simple messages |
| Sonnet 4.6 only | $18,113 | 17.5x more expensive, overkill for 95% of messages |

### Implementation Priority

1. **Phase 1 (now)**: Use Grok 4.1 Fast for all companion messages (already working)
2. **Phase 2 (pre-launch)**: Add Claude Haiku 4.5 for scripture/emotional conversations via keyword routing
3. **Phase 3 (post-launch)**: Add Sonnet 4.6 escalation for crisis detection + theological depth
4. **Phase 4 (scale)**: Implement Grok-based classifier for smarter routing

### Backend Changes Required
- **None for Phase 1** -- already working
- **Phase 2**: Add `claude-haiku-4-5-20251001` as a model option in companion service calls; backend already routes claude-* to Anthropic
- **Phase 3**: Add routing logic in companion-service.ts based on message content
- **Phase 4**: Add classification endpoint or client-side classifier

---

## 10. Additional Considerations

### Prompt Caching ROI for Chat
With Claude Haiku 4.5 at $1/MTok input:
- System prompt + persona + safety instructions: ~500 tokens (static across all messages)
- Without caching: $0.0005 per message for this static portion
- With 1-hour caching: $0.001 first write, then $0.00005 per read (90% savings)
- At 10K DAU (57,500 msgs/day): saves ~$25/day = ~$750/month
- **Verdict**: Enable prompt caching from day one for any Claude model

### Free vs Premium Model Allocation
- **Free users (5 msgs/day)**: Grok 4.1 Fast for all messages (cheapest, still fast)
- **Premium users**: Full tiered routing (Grok + Haiku + Sonnet)
- This creates a tangible quality difference that justifies premium without paywalling basic functionality

### On-Device Considerations (Future)
- Apple Intelligence on-device models are improving but not yet suitable for custom personas
- Local LLMs (Llama 3.1 8B quantized) can run on iPhone 15 Pro+ but quality is far below cloud models for empathetic conversation
- Revisit in 2027 when on-device models mature

---

## Sources

- [Anthropic Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [xAI Models and Pricing](https://docs.x.ai/developers/models)
- [Claude Haiku 4.5 Benchmarks - Artificial Analysis](https://artificialanalysis.ai/models/claude-4-5-haiku)
- [Grok 4.1 Fast Benchmarks - Artificial Analysis](https://artificialanalysis.ai/models/grok-4-1-fast)
- [LLM Latency Benchmarks 2026 - AIM Research](https://aimultiple.com/llm-latency-benchmark)
- [LLM API Latency Benchmarks 2026](https://www.kunalganglani.com/blog/llm-api-latency-benchmarks-2026)
- [AI API Pricing Comparison 2026 - IntuitionLabs](https://intuitionlabs.ai/articles/ai-api-pricing-comparison-grok-gemini-openai-claude)
- [Best LLM for Customer Service Chatbots 2026](https://gurusup.com/blog/best-llm-chatbot)
- [LLM Cost Optimization and Multi-Model Routing](https://atlosz.hu/en/blog/llm-koltsegoptimalizalas-routing-strategia/)
- [Top 5 LLM Router Solutions 2026](https://www.getmaxim.ai/articles/top-5-llm-router-solutions-in-2026/)
- [Claude vs Grok Comprehensive Comparison 2026](https://ai-pro.org/learn-ai/articles/claude-vs-grok-a-comprehensive-ai-model-comparison-2026)
- [Grok 4.20 Beta Benchmarks](https://artificialanalysis.ai/models/grok-4-20)
- [Prompt Caching with Claude - Anthropic](https://www.anthropic.com/news/prompt-caching)
