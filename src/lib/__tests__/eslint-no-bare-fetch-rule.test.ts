/**
 * A global fetch() call is an error for every file, with a short, explained
 * allowlist (eslint.config.js): backend requests go through authenticatedFetch
 * so a device-credential 401 heals, and third-party hosts go through
 * externalFetch. Pinning both halves here means the rule cannot quietly
 * disappear and a new escape hatch cannot slip in unnoticed.
 */
type FlatConfigEntry = {
  files?: string[];
  rules?: Record<string, unknown>;
};

// The real exported flat config, not a regex over the file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../../eslint.config.js') as FlatConfigEntry[];

const RULE = 'no-restricted-syntax';
const FETCH_SELECTORS = [
  // fetch(...)
  "CallExpression[callee.name='fetch']",
  // globalThis.fetch(...), global.fetch(...), window.fetch(...), self.fetch(...)
  "CallExpression[callee.type='MemberExpression'][callee.property.name='fetch'][callee.object.name=/^(globalThis|global|window|self)$/]",
];

const ALLOWLIST = [
  'scripts/**',
  'src/**/*.test.ts',
  'src/**/*.test.tsx',
  'src/**/__tests__/**',
  'src/lib/__mocks__/**',
  'src/lib/device-credential.ts',
  'src/lib/external-fetch.ts',
];

function forbidsGlobalFetch(value: unknown): boolean {
  if (!Array.isArray(value) || value[0] !== 'error') return false;
  const selectors = value
    .slice(1)
    .map((option) => (typeof option === 'object' && option !== null ? (option as { selector?: unknown }).selector : undefined));
  return FETCH_SELECTORS.every((selector) => selectors.includes(selector));
}

describe('eslint no-global-fetch rule', () => {
  it('is an error for every file by default, for bare and member calls', () => {
    const global = config.filter((entry) => !entry.files && forbidsGlobalFetch(entry.rules?.[RULE]));
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
      return value !== undefined && value !== 'off' && !forbidsGlobalFetch(value);
    });
    expect(other).toHaveLength(0);
  });
});
