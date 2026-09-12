/**
 * Which tab stack a shared screen opens in.
 *
 * Screens mounted in more than one tab group receive their host tab as a
 * STATIC prop from the route file; they never infer the host at runtime.
 * Runtime inference via useSegments() is not available here: series-detail's
 * render tests mock expo-router with only useRouter and useLocalSearchParams.
 */
export type TabGroup = '(today)' | '(study)' | '(you)';

export type SharedScreen =
  | 'series-detail'
  | 'past-devotionals'
  | 'reading'
  | 'day-menu'
  | 'journal'
  | 'journal-detail'
  | 'my-content';

/** Tab groups that actually contain a file route for each shared screen. */
const SHARED_SCREEN_HOSTS: Readonly<Record<SharedScreen, ReadonlySet<TabGroup>>> = {
  'series-detail': new Set<TabGroup>(['(today)', '(study)', '(you)']),
  'past-devotionals': new Set<TabGroup>(['(today)', '(study)', '(you)']),
  reading: new Set<TabGroup>(['(today)', '(study)']),
  'day-menu': new Set<TabGroup>(['(today)', '(study)']),
  journal: new Set<TabGroup>(['(today)', '(study)']),
  'journal-detail': new Set<TabGroup>(['(today)', '(study)']),
  'my-content': new Set<TabGroup>(['(today)', '(study)', '(you)']),
};

/** Where a screen opens when the requested host does not mount it. */
const CANONICAL_HOST: Readonly<Record<SharedScreen, TabGroup>> = {
  'series-detail': '(you)',
  'past-devotionals': '(you)',
  reading: '(today)',
  'day-menu': '(today)',
  journal: '(today)',
  'journal-detail': '(today)',
  'my-content': '(you)',
};

export function resolveStackRoute(
  hostTab: TabGroup | undefined,
  screen: SharedScreen,
): string {
  const host =
    hostTab && SHARED_SCREEN_HOSTS[screen].has(hostTab)
      ? hostTab
      : CANONICAL_HOST[screen];
  return `/(tabs)/${host}/${screen}`;
}

/**
 * The `from` value a host tab stamps on a cross-tab push. Only Study needs one:
 * every other host either owns the destination or already passes its own.
 * Keep in sync with FROM_TO_ROUTE in src/hooks/useCrossTabBack.ts.
 */
export function tabGroupToFrom(hostTab: TabGroup | undefined): string | undefined {
  return hostTab === '(study)' ? 'study' : undefined;
}
