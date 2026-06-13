/**
 * Pure once-per-version policy for the native App Store review prompt.
 *
 * Apple only renders `SKStoreReviewController` a handful of times per year and
 * silently drops extras — so the only honest signal we control is "don't even
 * ask more than once per shipped binary". We key the prompt by app
 * version + build so a TestFlight/App Store update re-arms exactly one prompt.
 *
 * Kept pure (no AsyncStorage / expo imports) so the policy is unit-testable.
 */

/** Stable storage/comparison key for a given app version + build number. */
export function getReviewPromptVersionKey(
  version: string | null,
  build: string | null,
): string {
  return `${version ?? 'unknown'}:${build ?? 'unknown'}`;
}

/**
 * True only when we have NOT already prompted for this exact version/build.
 * A null last-prompted key means we have never prompted on this binary.
 */
export function shouldRequestReviewForVersion(
  lastPromptedKey: string | null,
  currentKey: string,
): boolean {
  return lastPromptedKey !== currentKey;
}
