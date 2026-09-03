/* eslint-disable import/first */
/**
 * P3-4 item 1 — build-profile provenance and the production hard block.
 *
 * The pure decision functions are table-tested over (buildProfile, __DEV__,
 * flag); getBuildProfile() is exercised against a mocked expo-constants and
 * against a require() failure (native module unavailable).
 */

let mockThrowOnRequire = false;
const mockConstants: { expoConfig: { extra?: unknown } | null } = { expoConfig: { extra: {} } };

jest.mock('expo-constants', () => {
  if (mockThrowOnRequire) {
    throw new Error('expo-constants unavailable');
  }
  return { __esModule: true, default: mockConstants };
});

import {
  getBuildProfile,
  isProductionBuildProfile,
  readBuildProfileFromExtra,
  resolvePaywallDiagnosticsEnabled,
  resolveQaToolsEnabled,
} from '../build-profile';

describe('readBuildProfileFromExtra', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['production', null],
    [{}, null],
    [{ buildProfile: undefined }, null],
    [{ buildProfile: 42 }, null],
    [{ buildProfile: {} }, null],
    [{ buildProfile: '' }, null],
    [{ buildProfile: '   ' }, null],
    [{ buildProfile: ' qa-testflight ' }, 'qa-testflight'],
    [{ buildProfile: 'production' }, 'production'],
  ])('extra=%j → %s', (extra, expected) => {
    expect(readBuildProfileFromExtra(extra)).toBe(expected);
  });
});

describe('isProductionBuildProfile', () => {
  it.each([
    [null, false],
    ['development', false],
    ['preview', false],
    ['qa-testflight', false],
    ['production', true],
    ['Production', true],
    ['PRODUCTION', true],
    ['production-hotfix', true],
    ['production-android', true],
  ])('%s → %s', (profile, expected) => {
    expect(isProductionBuildProfile(profile)).toBe(expected);
  });
});

describe('getBuildProfile', () => {
  beforeEach(() => {
    mockThrowOnRequire = false;
    mockConstants.expoConfig = { extra: {} };
  });

  it('reads extra.buildProfile from the embedded expo config', () => {
    mockConstants.expoConfig = { extra: { buildProfile: 'qa-testflight', eas: { projectId: 'x' } } };
    expect(getBuildProfile()).toBe('qa-testflight');
  });

  it('is null when extra carries no profile (local expo run / older binaries)', () => {
    mockConstants.expoConfig = { extra: { eas: { projectId: 'x' } } };
    expect(getBuildProfile()).toBeNull();
    mockConstants.expoConfig = {};
    expect(getBuildProfile()).toBeNull();
    mockConstants.expoConfig = null;
    expect(getBuildProfile()).toBeNull();
  });

  it('is null (never throws) when expo-constants cannot be loaded', () => {
    mockThrowOnRequire = true;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const isolated = require('../build-profile') as typeof import('../build-profile');
      expect(isolated.getBuildProfile()).toBeNull();
    });
  });
});

// (buildProfile, __DEV__, flag) → expected, for both gates.
type GateRow = [string | null, boolean, string | undefined, boolean];

describe('resolveQaToolsEnabled table', () => {
  const rows: GateRow[] = [
    // production: always off, whatever the bundle or flag says
    ['production', false, undefined, false],
    ['production', false, '1', false],
    ['production', false, 'true', false],
    ['production', true, '1', false],
    ['Production-hotfix', false, '1', false],
    // dev bundles: always on (unchanged behaviour)
    [null, true, undefined, true],
    [null, true, '1', true],
    ['development', true, undefined, true],
    ['qa-testflight', true, undefined, true],
    // stamped non-production release bundles: explicit flag only
    ['qa-testflight', false, '1', true],
    ['qa-testflight', false, undefined, false],
    ['qa-testflight', false, 'true', false],
    ['preview', false, '1', true],
    ['preview', false, undefined, false],
    // release bundle with no stamped profile (local release + stray .env): off
    [null, false, '1', false],
    [null, false, undefined, false],
  ];

  it.each(rows)('profile=%s __DEV__=%s flag=%s → %s', (buildProfile, isDev, qaFlag, expected) => {
    expect(resolveQaToolsEnabled({ buildProfile, isDev, qaFlag })).toBe(expected);
  });
});

describe('resolvePaywallDiagnosticsEnabled table', () => {
  const rows: GateRow[] = [
    // production: always off
    ['production', false, '1', false],
    ['production', true, '1', false],
    ['production-hotfix', false, '1', false],
    // the explicit flag is required everywhere — __DEV__ alone never enables it
    [null, true, undefined, false],
    ['qa-testflight', false, undefined, false],
    ['qa-testflight', false, 'true', false],
    // dev bundle with the flag (local .env) — unchanged behaviour
    [null, true, '1', true],
    // stamped non-production release bundles with the flag
    ['qa-testflight', false, '1', true],
    ['preview', false, '1', true],
    // release bundle with no stamped profile: off even with the flag
    [null, false, '1', false],
  ];

  it.each(rows)('profile=%s __DEV__=%s flag=%s → %s', (buildProfile, isDev, qaFlag, expected) => {
    expect(resolvePaywallDiagnosticsEnabled({ buildProfile, isDev, qaFlag })).toBe(expected);
  });
});
