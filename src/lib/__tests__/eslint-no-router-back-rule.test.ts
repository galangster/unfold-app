/**
 * `router.back()` is a silent no-op on an empty expo-router stack, so a screen
 * reached from a push notification or an `unfold://` link on a cold start could
 * not be left at all (reported on 1.1.8 build 279). Every screen calls
 * `goBackOr` from src/lib/navigation.ts instead, which falls back to a tab root.
 *
 * The migration was a census of 22 call sites; a census cannot enforce itself.
 * Pinning the rule and its single escape hatch here means the ban cannot
 * quietly disappear and a second allowed file cannot slip in unnoticed.
 */
type FlatConfigEntry = {
  files?: string[];
  rules?: Record<string, unknown>;
};

// The real exported flat config, not a regex over the file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../../eslint.config.js') as FlatConfigEntry[];

const RULE = 'no-restricted-syntax';
const ROUTER_BACK_SELECTOR =
  "CallExpression[callee.type='MemberExpression'][callee.property.name='back'][arguments.length=0]";
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

describe('eslint no-router-back rule', () => {
  it('is an error for every file by default', () => {
    const global = config.filter(
      (entry) => !entry.files && selectorsOf(entry.rules?.[RULE]).includes(ROUTER_BACK_SELECTOR),
    );

    expect(global).toHaveLength(1);
  });

  it('carries a message naming goBackOr, so the error says what to do instead', () => {
    const global = config.find((entry) => !entry.files && entry.rules?.[RULE]);
    const options = global?.rules?.[RULE] as unknown[];
    const routerOption = options
      .slice(1)
      .find(
        (option) => (option as { selector?: string }).selector === ROUTER_BACK_SELECTOR,
      ) as { message?: string } | undefined;

    expect(routerOption?.message).toContain('goBackOr');
    expect(routerOption?.message).toContain('@/lib/navigation');
  });

  it('exempts only the guard itself', () => {
    const exempt = config.filter((entry) => {
      if (!entry.files) return false;
      const value = entry.rules?.[RULE];
      if (value === 'off') return true;
      return entry.rules?.[RULE] !== undefined && !selectorsOf(value).includes(ROUTER_BACK_SELECTOR);
    });

    const files = exempt.flatMap((entry) => entry.files ?? []);
    expect(files).toContain(ALLOWED_FILE);
    // Test files and the fetch transports turn the whole rule off; no other
    // override may drop the router selector while keeping the rule on.
    const partialOverrides = exempt.filter((entry) => entry.rules?.[RULE] !== 'off');
    expect(partialOverrides.flatMap((entry) => entry.files ?? [])).toEqual([ALLOWED_FILE]);
  });

  it('keeps the fetch ban intact in the guard override, which replaces rule config', () => {
    // Flat config replaces a rule's options rather than merging them, so the
    // navigation.ts override has to re-list the fetch selectors or it would
    // silently permit a bare fetch() there.
    const override = config.find((entry) => entry.files?.includes(ALLOWED_FILE));
    const selectors = selectorsOf(override?.rules?.[RULE]);

    expect(selectors).toContain("CallExpression[callee.name='fetch']");
    expect(selectors).not.toContain(ROUTER_BACK_SELECTOR);
  });
});
