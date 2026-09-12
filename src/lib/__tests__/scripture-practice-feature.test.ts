/* eslint-disable import/first */
const mockConstants: { expoConfig: { extra?: unknown } | null } = { expoConfig: { extra: {} } };

jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isScripturePracticeEnabled } from '../scripture-practice-feature';

describe('scripture practice feature gate', () => {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  const originalQaFlag = process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
  const originalPracticeFlag = process.env.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE;

  function arrange(
    buildProfile: string | null,
    isDev: boolean,
    qaFlag: string | undefined,
    practiceFlag: string | undefined,
  ) {
    mockConstants.expoConfig = { extra: buildProfile === null ? {} : { buildProfile } };
    devGlobal.__DEV__ = isDev;
    if (qaFlag === undefined) delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    else process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = qaFlag;
    if (practiceFlag === undefined) delete process.env.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE;
    else process.env.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE = practiceFlag;
  }

  afterEach(() => {
    devGlobal.__DEV__ = originalDev;
    if (originalQaFlag === undefined) delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    else process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = originalQaFlag;
    if (originalPracticeFlag === undefined) delete process.env.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE;
    else process.env.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE = originalPracticeFlag;
    mockConstants.expoConfig = { extra: {} };
  });

  it.each<[string | null, boolean, string | undefined, string | undefined, boolean]>([
    ['production', false, '1', '1', false],
    ['production-hotfix', false, '1', '1', false],
    [null, false, '1', '1', false],
    ['preview', false, '1', '1', true],
    ['qa-testflight', false, '1', '1', true],
    ['qa-testflight', false, '1', undefined, false],
    ['qa-testflight', false, undefined, '1', false],
    ['development', true, undefined, '1', true],
    ['development', true, undefined, undefined, false],
  ])('profile=%s __DEV__=%s qa=%s practice=%s → %s', (profile, isDev, qaFlag, practiceFlag, expected) => {
    arrange(profile, isDev, qaFlag, practiceFlag);
    expect(isScripturePracticeEnabled()).toBe(expected);
  });

  it('enables the explicit flag only on qa-testflight and never declares it in production', () => {
    const eas = JSON.parse(readFileSync(join(__dirname, '../../../eas.json'), 'utf8')) as {
      build: Record<string, { env?: Record<string, string> }>;
    };

    expect(eas.build['qa-testflight'].env?.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE).toBe('1');
    expect(eas.build.production.env).not.toHaveProperty('EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE');
    expect(eas.build.preview.env).not.toHaveProperty('EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE');
    expect(eas.build.development.env).not.toHaveProperty('EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE');
  });
});
