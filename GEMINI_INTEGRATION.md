# Gemini Flash 2.5 Integration for Unfold Onboarding

**Date:** 2026-02-23
**Goal:** Switch from Haiku/Claude to Gemini Flash 2.5 for dynamic, unique question generation

---

## What Was Changed

### 1. New File: `src/lib/gemini-service.ts`
Direct Gemini Flash 2.5 integration that:
- Calls Gemini API **directly** from the mobile app (no backend proxy)
- Each question is a **unique API call** (no caching)
- Uses model: `gemini-2.5-flash-preview-01-06`
- Falls back to backend if Gemini fails

**Key features:**
- `generateAdaptiveQuestionWithGemini()` — generates dynamic questions
- `isGeminiAvailable()` — checks if API key is configured
- Unique request IDs on every call to prevent caching
- Temperature 0.85 for creative but coherent questions

---

### 2. Modified: `src/app/onboarding.tsx`
Updated to use Gemini first, then fall back to backend:

**Two places updated:**

#### A. `loadAdaptiveQuestion()` useEffect
- Now tries Gemini first with `generateAdaptiveQuestionWithGemini()`
- Falls back to backend `generateAdaptiveQuestion()` if Gemini fails
- Better logging to show which service was used

#### B. `startDiscoveryPreparation()` function
- Generates all 3 discovery questions in parallel
- Tries Gemini for each question first
- Falls back to backend if Gemini fails
- Seeds local fallbacks immediately so user never sees generic defaults

---

### 3. Modified: `src/app/mobile/.env`
Added:
```
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
```

**Note:** Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

---

## How It Works

### Question Generation Flow

```
User answers a question
        ↓
App tries Gemini Flash 2.5 FIRST
        ↓
├─ Success? → Use Gemini-generated question ✓
│             (Direct API call, fully unique)
│
└─ Fail? → Fall back to backend (Claude/Haiku)
           (Existing behavior preserved)
        ↓
If both fail → Use local fallback questions
```

### Parallel Generation for Discovery Prep

When user selects "Guided" or a theme/study:

```
Generate all 3 questions in parallel:
├─ currentSituation (opening)
├─ emotionalState (depth)
└─ spiritualSeeking (longing)

Each question tries Gemini first, then backend
```

---

## Key Differences from Before

| Before | After |
|--------|-------|
| Backend proxy → Claude Sonnet 4 | Direct API → Gemini Flash 2.5 |
| Single backend call | Gemini first, fallback to backend |
| Temperature 0.9 | Temperature 0.85 |
| 20s timeout | 15s timeout |
| No unique request IDs | Unique ID on every call |
| Static fallback only | Gemini → Backend → Local fallback |

---

## Testing

### To verify it's working:

1. **Check console logs** in Metro:
   ```
   [Adaptive] Trying Gemini Flash 2.5...
   [Adaptive] ✓ Using Gemini-generated question: {...}
   ```

2. **If Gemini fails**, you'll see:
   ```
   [Adaptive] Gemini returned null, falling back to backend...
   [Adaptive] Calling backend API...
   ```

3. **If both fail**:
   ```
   [Adaptive] All APIs failed, using local fallback
   ```

---

## Configuration

The app looks for the API key in this order:
1. `process.env.EXPO_PUBLIC_GEMINI_API_KEY`
2. `process.env.GEMINI_API_KEY`

Already added to `.env`:
```
EXPO_PUBLIC_GEMINI_API_KEY=AIzaSyDNSBGHiKd2vcsqHu973X1D98fSRSJJ0CQ
```

---

## Cost Estimate

**Gemini Flash 2.5 pricing:**
- Input: ~$0.075 per 1M tokens
- Output: ~$0.30 per 1M tokens

**Per onboarding session:**
- 3-5 questions generated
- ~500 tokens per request
- **Cost: ~$0.002-0.004 per user** (basically free)

---

## Fallback Chain

If Gemini fails for any reason:
1. ✅ Gemini Flash 2.5 (fast, cheap, direct)
2. ⚠️ Backend → Claude/Haiku (existing infrastructure)
3. ✅ Local fallback questions (always works)

The user always gets a question, no matter what fails.

---

## Future Improvements

- Add retry logic for transient Gemini failures
- Cache the "first question" for offline users
- A/B test Gemini vs Claude question quality
- Add analytics to track which service is used more

---

## Files Modified

1. `src/lib/gemini-service.ts` — NEW (Gemini integration)
2. `src/app/onboarding.tsx` — MODIFIED (use Gemini first)
3. `.env` — MODIFIED (added API key)

---

## Summary

✅ **Gemini Flash 2.5 is now the primary question generator**
✅ **Each question is a direct, unique API call**
✅ **No caching - questions are truly dynamic**
✅ **Backend preserved as fallback**
✅ **Local fallbacks as final safety net**
