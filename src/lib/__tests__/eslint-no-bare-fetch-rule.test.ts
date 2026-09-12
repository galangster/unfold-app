/**
 * A bare fetch() call is an error for every file, with a short, explained
 * allowlist (eslint.config.js): backend requests go through authenticatedFetch
 * so a device-credential 401 heals. Pinning both halves here means the rule
 * cannot quietly disappear and a new escape hatch cannot slip in unnoticed.
 */
type FlatConfigEntry = {
  files?: string[];
  rules?: Record<string, unknown>;
};

// The real exported flat config, not a regex over the file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../../eslint.config.js') as FlatConfigEntry[];

const RULE = 'no-restricted-syntax';
const FETCH_SELECTOR = "CallExpression[callee.name='fetch']";

const ALLOWLIST = [
  'scripts/**',
  'src/**/*.test.ts',
  'src/**/*.test.tsx',
  'src/**/__tests__/**',
  'src/lib/__mocks__/**',
  'src/lib/bible-api.ts',
  'src/lib/device-credential.ts',
  'src/lib/network-error-handler.ts',
];

function forbidsBareFetch(value: unknown): boolean {
  if (!Array.isArray(value) || value[0] !== 'error') return false;
  return value.slice(1).some(
    (option) =>
      typeof option === 'object'
      && option !== null
      && (option as { selector?: unknown }).selector === FETCH_SELECTOR,
  );
}

describe('eslint no-bare-fetch rule', () => {
  it('is an error for every file by default', () => {
    const global = config.filter((entry) => !entry.files && forbidsBareFetch(entry.rules?.[RULE]));
    expect(global).toHaveLength(1);
  });

  it('is switched off only for the documented allowlist', () => {
    const off = config.filter((entry) => entry.rules?.[RULE] === 'off');
    expect(off).toHaveLength(1);
    expect([...(off[0].files ?? [])].sort()).toEqual([...ALLOWLIST].sort());
  });

  it('is not reconfigured anywhere else', () => {
    const other = config.filter((entry) => {
      const value = entry.rules?.[RULE];
      return value !== undefined && value !== 'off' && !forbidsBareFetch(value);
    });
    expect(other).toHaveLength(0);
  });
});
