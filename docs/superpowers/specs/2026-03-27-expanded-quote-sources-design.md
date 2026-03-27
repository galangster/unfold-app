# Expanded Quote Sources — Design Spec

**Date:** 2026-03-27
**Scope:** Prompt-only change — no schema, store, or UI modifications

## Problem

The generation prompt's JSON schema requests `"quotes": [{"text": "...", "author": "..."}]` with zero guidance on sourcing. The AI defaults to frequently-cited Christian authors (C.S. Lewis, Henri Nouwen, Bonhoeffer, Tozer). The user wants quotes drawn from the full breadth of human wisdom — poets, scientists, activists, philosophers, novelists, artists, musicians, world leaders — anyone whose words illuminate the day's theme.

## Design

Add a `=== QUOTE SELECTION ===` directive section to `buildProgressiveUserPrompt()` in `src/lib/progressive-generation.ts`. This is injected as a prompt section before the JSON schema, alongside existing sections like READER CONTEXT, WRITING CRAFT, etc.

### The Directive

```
=== QUOTE SELECTION ===
Draw quotes from the full breadth of human wisdom — not just theologians.
Include: poets, scientists, activists, philosophers, novelists, artists,
world leaders, musicians, athletes, indigenous voices, comedians, everyday
wisdom. The only criteria:

1. The quote illuminates today's specific theme
2. The tone complements the devotional's spiritual posture (reflective,
   warm, searching) — it should feel like it belongs in the same room
   as the scripture, even if the author isn't religious
3. Avoid voices primarily known for opposing faith/spirituality — not
   because they lack wisdom, but because the tonal dissonance distracts
   from the reader's experience
4. No profanity or crude language in quoted text
5. Vary sources across days — don't default to the same familiar voices
   (C.S. Lewis, Henri Nouwen) every time. Surprise the reader.
```

### Placement

In `buildProgressiveUserPrompt()`, push this section after the writing craft sections and before the `=== GENERATE DAY ===` / JSON schema section. It sits alongside other content guidance sections.

### What Does NOT Change

- JSON schema: `"quotes": [{"text": "...", "author": "..."}]` — unchanged
- `DevotionalDay` type in store.ts — unchanged
- `DevotionalWebView` rendering — unchanged
- `DevotionalContent` quote display — unchanged
- Batch generation in `devotional-service.ts` — unchanged (only progressive generation gets this directive; batch can be updated later if desired)

### Guardrails

- **Tone filter:** Quote must complement the devotional's spiritual posture. A quote about wonder from Carl Sagan fits; a polemic against religion does not.
- **Soft exclusion:** Voices primarily known for opposing faith/spirituality are avoided — not blacklisted by name, but excluded by principle.
- **Content filter:** No profanity or crude language in quoted text.
- **Variety enforcement:** Explicit instruction to vary sources across days and avoid defaulting to the same familiar voices.

## Testing

- Verify the directive string is present in the assembled prompt when `buildProgressiveUserPrompt()` is called
- No behavioral tests needed — this is prompt guidance, not logic
