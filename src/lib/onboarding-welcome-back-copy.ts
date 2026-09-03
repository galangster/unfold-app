/**
 * Copy for the welcome-back beat shown to someone resuming onboarding.
 *
 * Pure and free of native imports so it can be unit-tested without the
 * reanimated / react-native module graph — same reason creation-gate-policy.ts
 * and store-rehydrate-repair.ts live in lib rather than beside their consumers.
 */

/** Greets by name when we got that far, and never awkwardly when we did not. */
export function getGreeting(name?: string): string {
  const trimmed = name?.trim();
  return trimmed ? `Welcome back, ${trimmed}.` : 'Welcome back.';
}

/**
 * Three states, and the distinction matters. Telling someone their devotional
 * is "ready and waiting" and then showing them the subscription screen is the
 * kind of small dishonesty that costs trust, especially from an app that has
 * already lost their answers once.
 *
 * `resumesOnDecision` is true when the step they return to is the paywall.
 */
export function getReassurance(hasDevotional: boolean, resumesOnDecision = false): string {
  if (hasDevotional && resumesOnDecision) {
    return 'Everything you told us is still here, and so is your devotional. Just one thing left to decide.';
  }
  if (hasDevotional) {
    return 'Everything you told us is still here, and your first devotional is ready and waiting.';
  }
  return 'Everything you told us is still here. Nothing to do over.';
}
