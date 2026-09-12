import { goBackOr, tabRootFromSegments, type BackNavigator, type TabRootHref } from '../navigation';

/**
 * Records what a screen asked the router to do. `canGoBack` is the only input
 * that matters: true models a screen pushed onto an existing stack, false the
 * cold start a notification tap or an `unfold://` link produces.
 */
function fakeRouter(canGoBack: boolean) {
  const calls: string[] = [];
  const router: BackNavigator = {
    canGoBack: () => canGoBack,
    back: () => {
      calls.push('back');
    },
    replace: (href: TabRootHref) => {
      calls.push(`replace:${href}`);
    },
  };
  return { router, calls };
}

describe('goBackOr', () => {
  // The reader walked in: this screen sits above something in its own stack.
  const PUSHED = 1;
  // This screen is the first route of its own stack, so popping would leave it.
  const FIRST_IN_STACK = 0;

  it('pops the stack when the reader walked in from another screen', () => {
    const { router, calls } = fakeRouter(true);

    goBackOr(router, '/(tabs)/(today)', PUSHED);

    expect(calls).toEqual(['back']);
  });

  it('replaces with the fallback when there is no history at all', () => {
    // Regression pin for 1.1.8 build 279; see src/lib/navigation.ts for the
    // report. back() did nothing, so the reader could not leave at all. This
    // is the notification shape: replace() leaves nothing underneath.
    const { router, calls } = fakeRouter(false);

    goBackOr(router, '/(tabs)/(today)', FIRST_IN_STACK);

    expect(calls).toEqual(['replace:/(tabs)/(today)']);
  });

  it('replaces rather than popping onto the root anchor beneath a deep link', () => {
    // The root stack is anchored on `index`, so a cold external unfold:// link
    // seeds it as [index, (tabs)…] and canGoBack() is true while the leaf
    // stack is empty. Popping would land on `/`, which forwards a completed
    // reader to Today — the wrong tab for a Journal screen.
    const { router, calls } = fakeRouter(true);

    goBackOr(router, '/(tabs)/(journal)', FIRST_IN_STACK);

    expect(calls).toEqual(['replace:/(tabs)/(journal)']);
  });
});

describe('tabRootFromSegments', () => {
  it('finds the tab group a nested route sits in', () => {
    expect(tabRootFromSegments(['(tabs)', '(bible)', 'search'])).toBe('/(tabs)/(bible)');
    expect(tabRootFromSegments(['(tabs)', '(you)', 'checkin-schedule'])).toBe('/(tabs)/(you)');
    expect(tabRootFromSegments(['(tabs)', '(ask)'])).toBe('/(tabs)/(ask)');
  });

  // The journal reflection screen is one component mounted twice — as
  // `(today)/journal` and re-exported as `(journal)/entry`. Its close action
  // has to resolve to the tab the reader is in, not to a hard-coded Today.
  it('separates the two mounts of the journal reflection screen', () => {
    expect(tabRootFromSegments(['(tabs)', '(today)', 'journal'])).toBe('/(tabs)/(today)');
    expect(tabRootFromSegments(['(tabs)', '(journal)', 'entry'])).toBe('/(tabs)/(journal)');
  });

  // The screen the reported bug came in on. useGuardedBack derives the
  // wind-down exit from these segments rather than naming a route, so this is
  // the assertion that pins where a trapped reader now ends up. Two paying
  // subscribers hit the dead caret on 1.1.8 build 279 (reported 2026-09-12).
  it('sends the evening wind-down screen back to Today', () => {
    expect(tabRootFromSegments(['(tabs)', '(today)', 'evening-wind-down'])).toBe('/(tabs)/(today)');
  });

  it('falls back to Today for routes mounted outside the tabs', () => {
    expect(tabRootFromSegments(['paywall'])).toBe('/(tabs)/(today)');
    expect(tabRootFromSegments([])).toBe('/(tabs)/(today)');
  });

  it('ignores a leaf segment that merely looks like a group', () => {
    expect(tabRootFromSegments(['(tabs)', '(modal)'])).toBe('/(tabs)/(today)');
  });
});
