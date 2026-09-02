/* eslint-disable import/first */
/**
 * QA/debug gate — end-to-end through isQaToolsEnabled() with the stamped
 * build profile, __DEV__, and EXPO_PUBLIC_ENABLE_QA_TOOLS all varied.
 */

const mockConstants: { expoConfig: { extra?: unknown } | null } = { expoConfig: { extra: {} } };

jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants }));

import { isQaToolsEnabled } from '../qa-tools';

describe('QA/debug route guard', () => {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  const originalFlag = process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;

  function arrange(buildProfile: string | null, isDev: boolean, flag: string | undefined) {
    mockConstants.expoConfig = { extra: buildProfile === null ? {} : { buildProfile } };
    devGlobal.__DEV__ = isDev;
    if (flag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = flag;
    }
  }

  afterEach(() => {
    devGlobal.__DEV__ = originalDev;
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = originalFlag;
    }
    mockConstants.expoConfig = { extra: {} };
  });

  it('blocks QA tools in production by default', () => {
    arrange('production', false, undefined);
    expect(isQaToolsEnabled()).toBe(false);
  });

  it('blocks QA tools in a production build even when the flag was inlined', () => {
    arrange('production', false, '1');
    expect(isQaToolsEnabled()).toBe(false);
    arrange('production', true, '1');
    expect(isQaToolsEnabled()).toBe(false);
  });

  it('does not enable QA tools from arbitrary truthy env values', () => {
    arrange('qa-testflight', false, 'true');
    expect(isQaToolsEnabled()).toBe(false);
  });

  it('allows QA tools in dev bundles regardless of the flag', () => {
    arrange(null, true, undefined);
    expect(isQaToolsEnabled()).toBe(true);
    arrange('development', true, undefined);
    expect(isQaToolsEnabled()).toBe(true);
  });

  it('allows QA tools in a stamped QA build with the explicit flag', () => {
    arrange('qa-testflight', false, '1');
    expect(isQaToolsEnabled()).toBe(true);
  });

  it('blocks a release bundle with no stamped profile even with a stray .env flag', () => {
    arrange(null, false, '1');
    expect(isQaToolsEnabled()).toBe(false);
  });

  // Full (buildProfile, __DEV__, flag) table.
  it.each<[string | null, boolean, string | undefined, boolean]>([
    ['production', false, undefined, false],
    ['production', false, '1', false],
    ['production', true, undefined, false],
    ['production-hotfix', false, '1', false],
    [null, true, undefined, true],
    [null, true, '1', true],
    [null, false, undefined, false],
    [null, false, '1', false],
    ['development', true, undefined, true],
    ['preview', false, undefined, false],
    ['preview', false, '1', true],
    ['qa-testflight', false, undefined, false],
    ['qa-testflight', false, '1', true],
    ['qa-testflight', true, undefined, true],
  ])('profile=%s __DEV__=%s flag=%s → %s', (buildProfile, isDev, flag, expected) => {
    arrange(buildProfile, isDev, flag);
    expect(isQaToolsEnabled()).toBe(expected);
  });
});
