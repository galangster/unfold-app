/**
 * `no-console` is an error for every file, with a short, explained allowlist
 * (eslint.config.js). Pinning both halves here means the rule cannot quietly
 * disappear and a new escape hatch cannot slip in without updating this list.
 */
type FlatConfigEntry = {
  files?: string[];
  rules?: Record<string, unknown>;
};

// The real exported flat config, not a regex over the file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../../eslint.config.js') as FlatConfigEntry[];

const ALLOWLIST = [
  'metro.config.js',
  'scripts/**',
  'src/components/reading/rangy-bundle.ts',
  'src/lib/logger.ts',
];

describe('eslint no-console rule', () => {
  it('is an error for every file by default', () => {
    const global = config.filter(
      (entry) => !entry.files && entry.rules?.['no-console'] === 'error',
    );
    expect(global).toHaveLength(1);
  });

  it('is switched off only for the documented allowlist', () => {
    const off = config.filter((entry) => entry.rules?.['no-console'] === 'off');
    expect(off).toHaveLength(1);
    expect([...(off[0].files ?? [])].sort()).toEqual([...ALLOWLIST].sort());
  });

  it('is not reconfigured anywhere else', () => {
    const other = config.filter((entry) => {
      const value = entry.rules?.['no-console'];
      return value !== undefined && value !== 'error' && value !== 'off';
    });
    expect(other).toHaveLength(0);
  });
});
