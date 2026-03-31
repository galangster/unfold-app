# Unfold TTS Pre-Generation Cost Analysis

**Date:** 2026-03-27
**Author:** Claude (research + analysis)
**Context:** Pre-generating TTS audio overnight during background fetch so audio is ready when users wake up.

---

## 1. Fish Audio Pricing (Current Provider)

Fish Audio bills TTS by **UTF-8 bytes** (for English text, 1 character ~= 1 byte).

| Model | Cost per 1M UTF-8 Bytes | Notes |
|-------|------------------------|-------|
| **S2 Pro** (current) | **$15.00** | Best quality, emotion tags supported |
| S1 | $15.00 | Same price, older model |

**Key details:**
- 1M UTF-8 bytes ~= 180,000 English words ~= 12 hours of speech
- Emotion tags (e.g., `(calm)`, `(hopeful)`) do NOT count toward billing
- Max 40K characters per single request (no chunking needed)
- Backend currently caps at 5,000 chars per request (`MAX_TEXT_LENGTH`)

**Subscription tiers (included generation minutes, separate from API):**

| Plan | Monthly Cost | Included Credits | API Access |
|------|-------------|-----------------|------------|
| Free | $0 | 8,000 credits (~13 min) | No |
| Plus | $11/mo (annual) | 250,000 credits (~400 min) | Pay-as-you-go |
| Pro | $75/mo (annual) | 2,000,000 credits (~3,200 min) | Pay-as-you-go |

**Rate limit tiers (concurrent requests):**

| Tier | Spending Threshold | Max Concurrent |
|------|-------------------|---------------|
| Starter | < $100 | 5 |
| Elevated | >= $100 | 15 |
| High Volume | >= $1,000 | 50 |
| Enterprise | Custom | Custom |

---

## 2. Character Count Estimates per Devotional Length

Based on the actual codebase (`getReadingLengthGuidance` in `devotional-service.ts`):

| Duration | Body Text | Scripture Text | Quotes + Questions | **Total Words** | **Total Characters** |
|----------|-----------|---------------|-------------------|----------------|---------------------|
| 5 min | 250-350 words | ~80 words (4-6 verses) | ~30 words (1 quote, 1 question) | **360-460** | **2,000-2,600** |
| 15 min | 600-800 words | ~200 words (6-10 verses + cross-refs) | ~100 words (2-3 quotes, 2-3 questions) | **900-1,100** | **5,000-6,200** |
| 30 min | 800-1,000 words | ~250 words (6-10 verses + cross-refs) | ~150 words (2-3 quotes, 3-4 questions + prayer) | **1,200-1,400** | **6,700-7,800** |

**Important:** The backend currently caps TTS text at 5,000 characters. For 15-min and 30-min devotionals, either:
- The client already truncates/splits text before sending
- Only a portion of the devotional is narrated
- The cap needs to be raised for pre-generation

**For this analysis, I'll use these midpoint estimates:**

| Duration | Characters for TTS (narrated text) |
|----------|-----------------------------------|
| 5 min | **2,300 chars** |
| 15 min | **5,600 chars** |
| 30 min | **7,200 chars** |

Note: These assume the full devotional text is narrated. If only body text is narrated (skipping scripture the user already read), reduce by ~20-25%.

---

## 3. Monthly TTS Cost Scenarios (Fish Audio S2 Pro @ $15/1M bytes)

### Formula
`Monthly cost = DAU * chars_per_devotional * listen_rate * 30 days * ($15 / 1,000,000)`

### 3A. 5-Minute Devotionals (2,300 chars/day)

| DAU | 100% Pre-gen | 30% Listen | 60% Listen | 80% Listen |
|-----|-------------|-----------|-----------|-----------|
| 100 | $1.04 | $0.31 | $0.62 | $0.83 |
| 500 | $5.18 | $1.55 | $3.11 | $4.14 |
| 1,000 | $10.35 | $3.11 | $6.21 | $8.28 |
| 5,000 | $51.75 | $15.53 | $31.05 | $41.40 |
| 10,000 | $103.50 | $31.05 | $62.10 | $82.80 |
| 50,000 | $517.50 | $155.25 | $310.50 | $414.00 |
| 100,000 | $1,035.00 | $310.50 | $621.00 | $828.00 |

### 3B. 15-Minute Devotionals (5,600 chars/day)

| DAU | 100% Pre-gen | 30% Listen | 60% Listen | 80% Listen |
|-----|-------------|-----------|-----------|-----------|
| 100 | $2.52 | $0.76 | $1.51 | $2.02 |
| 500 | $12.60 | $3.78 | $7.56 | $10.08 |
| 1,000 | $25.20 | $7.56 | $15.12 | $20.16 |
| 5,000 | $126.00 | $37.80 | $75.60 | $100.80 |
| 10,000 | $252.00 | $75.60 | $151.20 | $201.60 |
| 50,000 | $1,260.00 | $378.00 | $756.00 | $1,008.00 |
| 100,000 | $2,520.00 | $756.00 | $1,512.00 | $2,016.00 |

### 3C. 30-Minute Devotionals (7,200 chars/day)

| DAU | 100% Pre-gen | 30% Listen | 60% Listen | 80% Listen |
|-----|-------------|-----------|-----------|-----------|
| 100 | $3.24 | $0.97 | $1.94 | $2.59 |
| 500 | $16.20 | $4.86 | $9.72 | $12.96 |
| 1,000 | $32.40 | $9.72 | $19.44 | $25.92 |
| 5,000 | $162.00 | $48.60 | $97.20 | $129.60 |
| 10,000 | $324.00 | $97.20 | $194.40 | $259.20 |
| 50,000 | $1,620.00 | $486.00 | $972.00 | $1,296.00 |
| 100,000 | $3,240.00 | $972.00 | $1,944.00 | $2,592.00 |

### 3D. Blended Average (assuming 40% pick 5min, 40% pick 15min, 20% pick 30min)

**Weighted average: ~4,360 chars/day**

| DAU | 100% Pre-gen | 30% Listen | 60% Listen | 80% Listen |
|-----|-------------|-----------|-----------|-----------|
| 100 | **$1.96** | **$0.59** | **$1.18** | **$1.57** |
| 500 | **$9.81** | **$2.94** | **$5.89** | **$7.85** |
| 1,000 | **$19.62** | **$5.89** | **$11.77** | **$15.70** |
| 5,000 | **$98.10** | **$29.43** | **$58.86** | **$78.48** |
| 10,000 | **$196.20** | **$58.86** | **$117.72** | **$156.96** |
| 50,000 | **$981.00** | **$294.30** | **$588.60** | **$784.80** |
| 100,000 | **$1,962.00** | **$588.60** | **$1,177.20** | **$1,569.60** |

---

## 4. Storage Costs

### Audio File Size Estimates (MP3 @ 128kbps)

MP3 at 128kbps = 16 KB/second of audio. TTS speech rate is ~150 words/minute.

| Duration | Words | Speech Duration | File Size |
|----------|-------|----------------|-----------|
| 5 min | ~400 | ~2.5 min | **2.4 MB** |
| 15 min | ~1,000 | ~6.5 min | **6.2 MB** |
| 30 min | ~1,300 | ~8.5 min | **8.2 MB** |
| Blended avg | ~820 | ~5.3 min | **5.1 MB** |

### Monthly Storage Accumulation

Assuming blended average of 5.1 MB/day per user, retaining files for different periods:

| DAU | 1-Day Retention | 3-Day Retention | 7-Day Retention |
|-----|----------------|----------------|----------------|
| 100 | 0.5 GB | 1.5 GB | 3.6 GB |
| 500 | 2.6 GB | 7.7 GB | 17.9 GB |
| 1,000 | 5.1 GB | 15.3 GB | 35.7 GB |
| 5,000 | 25.5 GB | 76.5 GB | 178.5 GB |
| 10,000 | 51.0 GB | 153.0 GB | 357.0 GB |
| 50,000 | 255 GB | 765 GB | 1.8 TB |
| 100,000 | 510 GB | 1.5 TB | 3.6 TB |

### Storage Cost Estimates

**Current setup (Railway in-memory cache):** Audio is held in Node.js memory with 1-hour TTL on content cache, 5-min TTL on download cache. This works for on-demand but NOT for pre-generation (audio must persist hours).

**For pre-generated audio, you need external storage:**

| Provider | Cost/GB/month | 100 DAU (1-day) | 1K DAU (1-day) | 10K DAU (1-day) | 100K DAU (1-day) |
|----------|--------------|----------------|---------------|----------------|-----------------|
| AWS S3 Standard | $0.023 | $0.01 | $0.12 | $1.17 | $11.73 |
| AWS S3 Infrequent | $0.0125 | $0.01 | $0.06 | $0.64 | $6.38 |
| Cloudflare R2 | $0.015 (no egress) | $0.01 | $0.08 | $0.77 | $7.65 |
| Railway Volume | ~$0.25 | $0.13 | $1.28 | $12.75 | $127.50 |

**Egress costs matter:** If users download audio from S3, egress is $0.09/GB. At 10K DAU * 5.1MB/day * 30 days = ~1.5 TB egress = **$135/mo** in S3 egress alone.

**Cloudflare R2** is the clear winner: $0.015/GB storage, **$0 egress**. At 10K DAU with 1-day retention: **$0.77/mo storage, $0 egress**.

### Recommended Retention Policy

| Scale | Retention | Rationale |
|-------|-----------|-----------|
| < 1K DAU | **1 day** | Generate overnight, serve next morning, delete at midnight |
| 1K-10K DAU | **1 day** | Same pattern; storage stays manageable |
| 10K+ DAU | **12 hours** | Generate at 3am, expire by 3pm (most listening happens in morning) |

Pre-generated audio should have a hard TTL. If a user doesn't listen by end-of-day, the file is deleted. If they tap play the next day, it falls back to on-demand generation.

---

## 5. TTS Provider Comparison

### Cost per 1M Characters

| Provider | Model | Cost/1M Chars | Quality | Latency | Notes |
|----------|-------|--------------|---------|---------|-------|
| **Fish Audio** | S2 Pro | **$15** | Excellent (emotion tags) | ~5-15s | Current provider. Open-source model available |
| **OpenAI** | tts-1 | **$15** | Good | ~2-5s | Same price, no emotion control |
| **OpenAI** | tts-1-hd | **$30** | Excellent | ~5-10s | 2x Fish Audio cost |
| **OpenAI** | gpt-4o-mini-tts | **~$12-15** | Excellent | Varies | Token-based pricing (~$0.015/min audio) |
| **Google Cloud** | Neural2 / WaveNet | **$16** | Good | ~1-3s | Free tier: 1M chars/mo. Very reliable |
| **Google Cloud** | Studio / Chirp 3 HD | **$30** | Excellent | ~2-5s | Best Google quality |
| **Google Cloud** | Standard | **$4** | Basic (robotic) | <1s | Not suitable for devotional content |
| **Amazon Polly** | Neural | **$16** | Good | ~1-2s | Free tier: 1M chars/mo (12 months) |
| **Amazon Polly** | Generative | **$30** | Very good | ~3-5s | More natural than Neural |
| **Amazon Polly** | Standard | **$4** | Basic | <1s | Not suitable |
| **Microsoft Azure** | Neural | **$16** | Good | ~1-3s | Volume discounts: $12 at 80M, $9.75 at 400M |
| **ElevenLabs** | Flash/Turbo | **$60** | Good | <1s | Best latency, 4x Fish Audio cost |
| **ElevenLabs** | Multilingual v2 | **$120** | Excellent | ~2-3s | 8x Fish Audio. Best voice quality overall |
| **Deepgram** | Aura-2 | **$30** | Good | <1s | Enterprise focus, $200 free credits |
| **Cartesia** | Sonic-3 | **~$39** (Startup) | Excellent | 90ms | Credit-based. Previously used by Unfold |
| **Cartesia** | Sonic-3 | **~$37** (Scale) | Excellent | 90ms | Better rate at $239/mo tier |

### Cost Ranking (cheapest to most expensive for comparable quality)

1. **Google Cloud Standard** — $4/1M (but robotic quality, not viable)
2. **Amazon Polly Standard** — $4/1M (same issue)
3. **Fish Audio S2 Pro** — $15/1M (current, excellent quality + emotion tags)
4. **OpenAI tts-1** — $15/1M (good quality, no voice cloning)
5. **Google Cloud Neural2** — $16/1M (good quality, massive free tier)
6. **Amazon Polly Neural** — $16/1M (good quality, free tier for 12 months)
7. **Microsoft Azure Neural** — $16/1M (volume discounts at scale)
8. **Deepgram Aura-2** — $30/1M (enterprise-focused)
9. **Google Cloud Studio** — $30/1M (top Google quality)
10. **Amazon Polly Generative** — $30/1M (natural but expensive)
11. **Cartesia Sonic-3** — ~$37-39/1M (great latency, overkill for pre-gen)
12. **ElevenLabs Flash** — $60/1M (premium pricing)
13. **ElevenLabs Multilingual v2** — $120/1M (best quality, highest cost)

### Annual Cost Comparison at Key Scales (blended 4,360 chars/day, 60% listen rate)

| Provider | Rate/1M | 1K DAU/yr | 10K DAU/yr | 100K DAU/yr |
|----------|---------|----------|-----------|------------|
| Fish Audio | $15 | **$141** | **$1,413** | **$14,127** |
| OpenAI tts-1 | $15 | $141 | $1,413 | $14,127 |
| Google Neural2 | $16 | $151 | $1,507 | $15,068 |
| Amazon Polly Neural | $16 | $151 | $1,507 | $15,068 |
| Azure Neural | $16 ($12 vol) | $151 ($113) | $1,507 ($1,130) | $15,068 ($11,301) |
| Deepgram Aura-2 | $30 | $283 | $2,826 | $28,253 |
| Cartesia Sonic-3 | $39 | $367 | $3,674 | $36,729 |
| ElevenLabs Flash | $60 | $565 | $5,652 | $56,507 |
| ElevenLabs v2 | $120 | $1,130 | $11,303 | $113,014 |

---

## 6. Optimization Strategies

### Strategy 1: On-Demand Only (No Pre-Generation)
**How:** Only generate TTS when user taps play. Cache result for 24 hours.
- **Savings:** Pay only for users who listen (~30-60% of DAU)
- **Trade-off:** 5-15 second wait on first play. Current behavior.
- **Best for:** < 1K DAU where cost is already negligible

### Strategy 2: Smart Pre-Generation (Recommended)
**How:** Track which users have listened to audio in the last 7 days. Pre-generate only for those users overnight.
- **Savings:** ~40-60% vs pre-generating for everyone
- **Estimated listener rate:** 30-50% of DAU actually tap play regularly
- **Trade-off:** First-time listeners get on-demand (one-time 5-15s wait)
- **Implementation:** Add `lastAudioPlayedAt` field to user profile. Background job checks this when generating next-day content.
- **Best for:** 1K-10K DAU

### Strategy 3: Skip Scripture Narration
**How:** Only narrate body text, quotes, and questions. Skip scriptureText since user already read it visually.
- **Savings:** ~20-25% character reduction
- **Trade-off:** Some users prefer hearing scripture read aloud
- **Compromise:** Make it a toggle: "Include scripture in audio" (default: on for 15/30 min, off for 5 min)
- **Character savings:**

| Duration | Full Narration | Body-Only | Savings |
|----------|---------------|-----------|---------|
| 5 min | 2,300 chars | 1,800 chars | 22% |
| 15 min | 5,600 chars | 4,300 chars | 23% |
| 30 min | 7,200 chars | 5,500 chars | 24% |

### Strategy 4: Lower Audio Quality for Pre-Gen
**How:** Use 64kbps MP3 instead of 128kbps for pre-generated audio. Serve 128kbps only for on-demand.
- **Savings:** 50% storage reduction, 50% bandwidth reduction
- **Trade-off:** Slightly lower audio quality (most users on phone speakers won't notice)
- **Fish Audio API cost:** Same (billing is on input chars, not output quality)
- **Storage impact at 10K DAU:** 25.5 GB → 12.75 GB (1-day retention)

### Strategy 5: Batch API Calls During Off-Peak
**How:** Queue all pre-generation requests for 2-4 AM local time. Process sequentially with small delays.
- **Savings:** No direct cost savings, but avoids hitting rate limits
- **Benefit:** Predictable load, avoids concurrent request limits
- **Implementation:** Cron job or background worker that processes a queue

### Strategy 6: Self-Host Fish Speech (Open Source)
**How:** Run Fish Speech S2 model on a GPU server.
- **Hardware:** Requires 12-24 GB VRAM GPU (RTX 4090 recommended)
- **Cloud GPU cost:** $0.29-0.59/hr for RTX 4090 = **$210-$425/month** (24/7)
- **Break-even point:** When API costs exceed ~$300/mo (roughly 5K-10K DAU at 60% listen rate)
- **Trade-off:** Operational complexity (GPU maintenance, model updates, scaling)
- **License caveat:** Fish Speech code is Apache-2.0, but model weights are CC-BY-NC-SA-4.0. Commercial use requires a separate license from Fish Audio.
- **Performance:** 1:5 real-time factor on RTX 4060, 1:15 on RTX 4090
- **Capacity on RTX 4090:** Can generate ~15 hours of speech per real-time hour. At 5.3 min avg per user, that's ~170 users/hour, or ~4,000 users in a 24-hour overnight batch window.

### Strategy 7: Hybrid Provider Strategy
**How:** Use Google Cloud TTS Neural2 for the free tier (1M chars/mo free), switch to Fish Audio for overflow.
- **Savings:** First ~230 daily users free via Google (at 4,360 chars/day * 30 = 130K chars/user/mo)
- **Trade-off:** Voice consistency between providers; complexity of two integrations
- **Best for:** Very early stage (< 500 DAU) to minimize costs while iterating

### Strategy Combination Matrix

| Scale | Recommended Combo | Est. Monthly Cost |
|-------|------------------|------------------|
| < 100 DAU | On-demand only + Fish Audio | **< $2/mo** |
| 100-500 DAU | On-demand only + Fish Audio | **$2-12/mo** |
| 500-1K DAU | Smart pre-gen (listeners only) + Fish Audio | **$6-20/mo** |
| 1K-5K DAU | Smart pre-gen + skip scripture toggle + Fish Audio | **$12-60/mo** |
| 5K-10K DAU | Smart pre-gen + Fish Audio + evaluate self-hosting | **$50-160/mo** |
| 10K-50K DAU | Self-host Fish Speech on GPU + fallback to API | **$250-500/mo** |
| 50K-100K DAU | Self-host (multi-GPU) + CDN for audio delivery | **$500-1,200/mo** |

---

## 7. Recommendations by Scale

### At 100 DAU (Current / Near-Term)

**Strategy:** On-demand generation only. No pre-generation needed.

- **Monthly TTS cost:** ~$1-2 (trivially cheap)
- **Monthly storage:** Negligible (in-memory cache is fine)
- **Action items:** None. Current architecture works perfectly.
- **Provider:** Stay with Fish Audio S2 Pro. The emotion tags add real value to devotional narration.

**Why no pre-gen:** At 100 DAU, even if 100% of users generate audio on-demand, the total cost is $1-2/month. The 5-15 second generation wait is acceptable. Engineering time to build pre-generation is not justified.

---

### At 1K DAU

**Strategy:** Smart pre-generation for repeat listeners only.

- **Monthly TTS cost:** ~$12-20/mo (smart pre-gen, 60% of regular listeners)
- **Monthly storage:** 3-5 GB on Cloudflare R2 ($0.08/mo storage, $0 egress)
- **Total audio infrastructure:** ~$15-25/mo
- **Action items:**
  1. Add `lastAudioPlayedAt` to user profile
  2. Pre-generate overnight only for users who played audio in last 7 days
  3. Move audio storage from in-memory to Cloudflare R2
  4. Keep on-demand fallback for non-listeners who tap play
- **Provider:** Fish Audio S2 Pro. Cost is negligible relative to AI generation costs (Anthropic API).

---

### At 10K DAU

**Strategy:** Smart pre-generation + evaluate self-hosting.

- **Monthly TTS cost (API):** ~$120-160/mo (smart pre-gen, 60% listen rate)
- **Monthly storage (R2):** ~$0.77/mo (1-day retention)
- **Monthly egress:** $0 (R2)
- **Total audio infrastructure (API path):** ~$125-165/mo
- **Self-host alternative:** ~$300-425/mo (GPU rental) but with unlimited generation capacity
- **Action items:**
  1. All items from 1K DAU tier
  2. Negotiate Fish Audio enterprise pricing (currently at "Elevated" tier with 15 concurrent requests)
  3. Benchmark self-hosted Fish Speech on RTX 4090 (can handle ~4,000 users in overnight batch)
  4. If > 50% of users pick 15/30min devotionals, self-hosting becomes cost-competitive
  5. Consider skip-scripture toggle to reduce per-user character count by 20-25%
- **Provider decision point:** If API costs stay under $200/mo, stick with Fish Audio API. If growth is rapid, begin self-hosting pilot.

---

### At 100K DAU

**Strategy:** Self-hosted Fish Speech on multi-GPU infrastructure.

- **API path cost:** ~$1,200-1,600/mo (would work but expensive)
- **Self-host cost:** ~$800-1,200/mo (2-3 RTX 4090 instances)
- **Capacity:** 3 RTX 4090s can generate ~12,000 users/hour = all 100K users in ~8-hour overnight window
- **Monthly storage (R2):** ~$7.65/mo
- **Total self-hosted infrastructure:** ~$850-1,250/mo (saves ~30-40% vs API)
- **Action items:**
  1. Multi-GPU deployment with queue-based batch processing
  2. CDN in front of R2 for global audio delivery
  3. Fallback to Fish Audio API if self-hosted infra goes down
  4. Monitor GPU utilization; scale horizontally as needed
  5. Negotiate Fish Audio enterprise license for model weights
- **Provider:** Self-hosted Fish Speech primary, Fish Audio API as fallback.

---

## 8. Key Insights

### TTS is Cheap Relative to Content Generation

For context, generating each devotional via Anthropic's API costs roughly $0.02-0.08 per devotional (depending on length and model). TTS at Fish Audio adds:
- 5-min devotional: $0.000035 per narration
- 15-min devotional: $0.000084 per narration
- 30-min devotional: $0.000108 per narration

**TTS is ~200-2,000x cheaper than the AI text generation.** At any reasonable scale, TTS costs are dominated by content generation costs.

### Pre-Generation vs On-Demand: The Real Trade-off

The question isn't cost — it's UX:
- **On-demand:** 5-15 second wait when user taps play. Acceptable for most users.
- **Pre-generated:** Instant playback. Premium feel. But requires storage infrastructure.

At current scale (< 100 DAU), the answer is clear: **don't build pre-generation yet.** The cost savings from on-demand are pennies, and the engineering complexity of overnight batch jobs, external storage, and retention policies isn't worth it.

**Build pre-generation when:**
1. User feedback indicates the play-wait time is a pain point, OR
2. You're above 500 DAU and want the premium instant-play experience, OR
3. You're building the overnight generation pipeline anyway (for next-day content pre-generation)

### The Backend 5,000 Char Limit

The current `MAX_TEXT_LENGTH = 5000` in the backend TTS route is a problem for 15-min and 30-min devotionals (5,600 and 7,200 chars respectively). This needs to be raised to at least 8,000 before pre-generation or full-text narration works for longer devotionals. Fish Audio supports up to 40K chars per request, so the backend is the bottleneck.

### Fish Audio is the Right Choice

At current and near-term scale, Fish Audio S2 Pro offers the best price-to-quality ratio:
- Tied cheapest at $15/1M chars (with OpenAI tts-1)
- Superior expressiveness via emotion tags (unique feature for devotional content)
- Open-source path available for self-hosting at scale
- Simpler API than ElevenLabs (no subscription required for API access)

The only scenario where switching makes sense:
- **Google Cloud Neural2** if you need the 1M chars/mo free tier during bootstrapping
- **Self-hosted Fish Speech** when API costs exceed ~$300/mo
- **ElevenLabs** only if voice quality becomes a key differentiator and cost is no object

---

## Appendix: Full Monthly Cost Matrix (Fish Audio, Blended Average)

All values in USD. Blended = 40% 5min + 40% 15min + 20% 30min (4,360 chars/day avg).

| DAU | Pre-Gen 100% | On-Demand 30% | On-Demand 60% | Smart Pre-Gen ~45% | Storage (R2, 1-day) | **Total (Smart)** |
|-----|-------------|--------------|--------------|-------------------|--------------------|--------------------|
| 100 | $1.96 | $0.59 | $1.18 | $0.88 | $0.01 | **$0.89** |
| 500 | $9.81 | $2.94 | $5.89 | $4.42 | $0.04 | **$4.46** |
| 1,000 | $19.62 | $5.89 | $11.77 | $8.83 | $0.08 | **$8.91** |
| 5,000 | $98.10 | $29.43 | $58.86 | $44.15 | $0.38 | **$44.53** |
| 10,000 | $196.20 | $58.86 | $117.72 | $88.29 | $0.77 | **$89.06** |
| 50,000 | $981.00 | $294.30 | $588.60 | $441.45 | $3.83 | **$445.28** |
| 100,000 | $1,962.00 | $588.60 | $1,177.20 | $882.90 | $7.65 | **$890.55** |

"Smart Pre-Gen ~45%" assumes pre-generating only for users who have listened in the past 7 days (estimated at ~45% of DAU).

---

## Sources

- [Fish Audio Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits)
- [Fish Audio Plans](https://fish.audio/plan/)
- [Fish Audio Blog: Cheapest TTS API](https://fish.audio/blog/cheapest-text-to-speech-api-developers/)
- [Fish Speech GitHub (Open Source)](https://github.com/fishaudio/fish-speech)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Google Cloud TTS Pricing](https://cloud.google.com/text-to-speech/pricing)
- [Amazon Polly Pricing](https://aws.amazon.com/polly/pricing/)
- [ElevenLabs API Pricing](https://elevenlabs.io/pricing/api)
- [ElevenLabs Pricing Breakdown (Flexprice)](https://flexprice.io/blog/elevenlabs-pricing-breakdown)
- [Cartesia Pricing](https://cartesia.ai/pricing)
- [Cartesia Sonic 3 Pricing (eesel)](https://www.eesel.ai/blog/cartesia-sonic-3-pricing)
- [Deepgram TTS API Comparison](https://deepgram.com/learn/best-text-to-speech-apis-2026)
- [GPU Cloud Pricing Comparison 2026 (Spheron)](https://www.spheron.network/blog/gpu-cloud-pricing-comparison-2026/)
- [GPU Cloud Pricing 2026 (SynpixCloud)](https://www.synpixcloud.com/blog/cloud-gpu-pricing-comparison-2026)
