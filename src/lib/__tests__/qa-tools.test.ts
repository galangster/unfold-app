import { isQaToolsEnabled } from '../qa-tools';

describe('QA/debug route guard', () => {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  const originalFlag = process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;

  afterEach(() => {
    devGlobal.__DEV__ = originalDev;
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;
    } else {
      process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = originalFlag;
    }
  });

  it('blocks QA tools in production by default', () => {
    devGlobal.__DEV__ = false;
    delete process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS;

    expect(isQaToolsEnabled()).toBe(false);
  });

  it('does not enable QA tools from arbitrary truthy env values', () => {
    devGlobal.__DEV__ = false;
    process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = 'true';

    expect(isQaToolsEnabled()).toBe(false);
  });

  it('allows QA tools in dev or with explicit production override', () => {
    devGlobal.__DEV__ = true;
    expect(isQaToolsEnabled()).toBe(true);

    devGlobal.__DEV__ = false;
    process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS = '1';
    expect(isQaToolsEnabled()).toBe(true);
  });
});
