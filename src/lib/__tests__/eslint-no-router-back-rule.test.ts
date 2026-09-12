/**
 * Popping the stack directly is wrong twice over: `back()` is a silent no-op
 * when there is no history, and it pops onto the synthesized root anchor when
 * the only thing beneath is Expo Router's `initialRouteName`. Every screen goes
 * through useGuardedBack instead. See src/lib/navigation.ts for both shapes.
 *
 * The migration was a census of 22 call sites, and a census cannot enforce
 * itself. Pinning the rule and its single escape hatch here means the ban
 * cannot quietly disappear and a second allowed file cannot slip in unnoticed.
 */
type FlatConfigEntry = {
  files?: string[];
  rules?: Record<string, unknown>;
};

// The real exported flat config, not a regex over the file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../../eslint.config.js') as FlatConfigEntry[];

const RULE = 'no-restricted-syntax';

/**
 * The shapes a reader could reach for. Deliberately narrow on `back`: a bare
 * `[callee.property.name='back']` would fire on every carousel and animation
 * controller in the dependency tree. `goBack` carries no object constraint
 * because src contains no `.goBack()` call to false-positive on.
 */
const ROUTER_BACK_SELECTORS = {
  'router.back() / nav.back() / navigation.back()':
    "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(router|nav|navigation)$/][callee.property.name='back'][arguments.length=0]",
  'routerRef.current.back()':
    "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression'][callee.object.property.name='current'][callee.property.name='back'][arguments.length=0]",
  'useRouter().back()':
    "CallExpression[callee.type='MemberExpression'][callee.object.type='CallExpression'][callee.property.name='back'][arguments.length=0]",
  'any .goBack()':
    "CallExpression[callee.type='MemberExpression'][callee.property.name='goBack'][arguments.length=0]",
};

/** The guard itself is the only file that may pop the stack directly. */
const ALLOWED_FILE = 'src/lib/navigation.ts';

function selectorsOf(value: unknown): unknown[] {
  if (!Array.isArray(value) || value[0] !== 'error') return [];
  return value
    .slice(1)
    .map((option) =>
      typeof option === 'object' && option !== null
        ? (option as { selector?: unknown }).selector
        : undefined,
    );
}

function globalSelectors(): unknown[] {
  const global = config.find((entry) => !entry.files && entry.rules?.[RULE]);
  return selectorsOf(global?.rules?.[RULE]);
}

describe('eslint no-router-back rule', () => {
  it.each(Object.entries(ROUTER_BACK_SELECTORS))(
    'bans %s for every file by default',
    (_label, selector) => {
      expect(globalSelectors()).toContain(selector);
    },
  );

  it('never bans a bare .back(), which would fire on any object with that method', () => {
    expect(globalSelectors()).not.toContain(
      "CallExpression[callee.type='MemberExpression'][callee.property.name='back'][arguments.length=0]",
    );
  });

  it('carries a message naming useGuardedBack, so the error says what to do instead', () => {
    const global = config.find((entry) => !entry.files && entry.rules?.[RULE]);
    const options = (global?.rules?.[RULE] as unknown[]).slice(1) as {
      selector?: string;
      message?: string;
    }[];
    const banned = Object.values(ROUTER_BACK_SELECTORS);

    for (const option of options.filter((o) => banned.includes(o.selector ?? ''))) {
      expect(option.message).toContain('useGuardedBack');
      expect(option.message).toContain('@/hooks/useGuardedBack');
    }
  });

  it('exempts only the guard itself', () => {
    const exempt = config.filter((entry) => {
      if (!entry.files) return false;
      const value = entry.rules?.[RULE];
      if (value === 'off') return true;
      return value !== undefined && !selectorsOf(value).includes(ROUTER_BACK_SELECTORS['any .goBack()']);
    });

    expect(exempt.flatMap((entry) => entry.files ?? [])).toContain(ALLOWED_FILE);
    // Test files and the fetch transports turn the whole rule off; no other
    // override may drop the router selectors while keeping the rule on.
    const partial = exempt.filter((entry) => entry.rules?.[RULE] !== 'off');
    expect(partial.flatMap((entry) => entry.files ?? [])).toEqual([ALLOWED_FILE]);
  });

  it('keeps the fetch ban intact in the guard override, which replaces rule config', () => {
    // Flat config replaces a rule's options rather than merging them, so the
    // navigation.ts override has to re-list the fetch selectors or it would
    // silently permit a bare fetch() there.
    const override = config.find((entry) => entry.files?.includes(ALLOWED_FILE));
    const selectors = selectorsOf(override?.rules?.[RULE]);

    expect(selectors).toContain("CallExpression[callee.name='fetch']");
    for (const selector of Object.values(ROUTER_BACK_SELECTORS)) {
      expect(selectors).not.toContain(selector);
    }
  });
});
