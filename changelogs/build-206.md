Build 206 fixes companion chat responses being overwritten by a stale fallback prefix, which could make a completed answer visibly stop mid-thought.

What to test:
- Open companion chat and ask for a longer answer, e.g. a multi-day study plan or a longer prayer/reflection.
- Confirm the companion response reaches a natural ending and does not stop at a fragment like "is that".
- Confirm suggestion chips appear only after the final answer is complete and do not replace the message body with an earlier partial reveal.
- Try a second follow-up in the same conversation and confirm conversation context, title generation, and suggestions still behave normally.
- If streaming is flaky or slow, confirm the non-streaming fallback still progressively reveals text but preserves the full final response.

Source: 390fdec [verified] fix companion fallback cutoff race

App Review build attachment is intentionally unchanged.
