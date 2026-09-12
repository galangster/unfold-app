/**
 * Guarded back navigation.
 *
 * `router.back()` is a silent no-op on an empty expo-router stack: the press
 * registers, the haptic fires, and nothing moves. Every screen this app can
 * enter *without* history can therefore trap a reader behind a back caret
 * that does nothing. Two entry points create that state:
 *
 *   - A notification tap. `src/lib/push-notification-helpers.ts` hands its
 *     route to `router.replace`, so a cold start lands on the target with no
 *     stack under it (`/reveal`, `/(tabs)/(today)/reading?focus=act`,
 *     `/(tabs)/(today)/evening-wind-down`, `/generating`).
 *   - An external `unfold://` link. `src/lib/deep-link-allowlist.ts` admits
 *     21 routes through `src/app/+native-intent.tsx`, most of them leaf
 *     screens whose only exit is a back caret.
 *
 * Reported from 1.1.8 build 279 on 2026-09-12: the evening push deep-links
 * straight to the wind-down screen, where both exits were bare `router.back()`
 * calls, so a subscriber arriving from the notification could not leave.
 *
 * Pure module — the router arrives as a structural argument, so there is no
 * expo-router or React import and the unit test drives it with a plain object.
 */

/**
 * The tab groups a screen can be mounted inside — the five registered in
 * src/app/(tabs)/_layout.tsx. This is the app's single list of them: the
 * types below and src/hooks/useCrossTabBack.ts both derive from it.
 */
const TAB_GROUPS = ['(today)', '(journal)', '(bible)', '(you)', '(ask)'] as const;

export type TabGroupSegment = (typeof TAB_GROUPS)[number];

/**
 * Fallback targets are restricted to tab roots deliberately. A fallback has to
 * be a route that always exists and never needs history of its own; replacing
 * onto another leaf screen would only move the trap.
 */
export type TabRootHref = `/(tabs)/${TabGroupSegment}`;

/**
 * The slice of expo-router's `Router` this module needs, declared with method
 * shorthand so the real router and a hand-built test double both satisfy it.
 */
export interface BackNavigator {
  canGoBack(): boolean;
  back(): void;
  replace(href: TabRootHref): void;
}

/** Exported so useCrossTabBack derives its tab lookup from this list too. */
export function isTabGroupSegment(segment: string): segment is TabGroupSegment {
  return (TAB_GROUPS as readonly string[]).includes(segment);
}

/**
 * The root of whichever tab the current route sits in. Screens mounted in more
 * than one tab must fall back to the tab the reader is actually looking at
 * rather than to Today: `(today)/journal` and `(journal)/entry` are one
 * component, as are the `(today)` and `(you)` copies of series-detail,
 * my-content and past-devotionals.
 *
 * Pass `useSegments()`. Today is the last resort — it is the app's home and
 * the only root that means anything for a route mounted outside the tabs.
 */
export function tabRootFromSegments(segments: readonly string[]): TabRootHref {
  const group = segments.find(isTabGroupSegment);
  return group ? `/(tabs)/${group}` : '/(tabs)/(today)';
}

/**
 * Pop the stack when there is something to pop; otherwise replace with
 * `fallbackHref`, so the exit always leads somewhere.
 */
export function goBackOr(router: BackNavigator, fallbackHref: TabRootHref): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallbackHref);
}
