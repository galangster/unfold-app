Reveal resume fix

- Fixes partially opened devotionals replaying the reveal animation when returning from Today.
- Preserves revealed state across devotional content refreshes so resume opens the reader directly.
- Keeps completed days marked as revealed so they never fall back into reveal-ready state.
- Includes the latest Today light-ray runtime binding safety updates; visual tint proof is still tracked separately.
