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
  it('pops the stack when there is history', () => {
    const { router, calls } = fakeRouter(true);

    goBackOr(router, '/(tabs)/(today)');

    expect(calls).toEqual(['back']);
  });

  it('replaces with the fallback when the stack is empty', () => {
    // Regression pin for 1.1.8 build 279; see src/lib/navigation.ts for the
    // report. back() did nothing, so the reader could not leave at all.
    const { router, calls } = fakeRouter(false);

    goBackOr(router, '/(tabs)/(today)');

    expect(calls).toEqual(['replace:/(tabs)/(today)']);
  });

  it('honours the fallback each caller passes, so a journal screen does not land on Today', () => {
    const { router, calls } = fakeRouter(false);

    goBackOr(router, '/(tabs)/(journal)');

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

  it('falls back to Today for routes mounted outside the tabs', () => {
    expect(tabRootFromSegments(['paywall'])).toBe('/(tabs)/(today)');
    expect(tabRootFromSegments([])).toBe('/(tabs)/(today)');
  });

  it('ignores a leaf segment that merely looks like a group', () => {
    expect(tabRootFromSegments(['(tabs)', '(modal)'])).toBe('/(tabs)/(today)');
  });
});
