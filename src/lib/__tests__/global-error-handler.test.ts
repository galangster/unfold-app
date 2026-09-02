import type { ErrorUtils } from 'react-native';

const mockLogBugError = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockRecordCrash = jest.fn(() => 1);

jest.mock('@/lib/bug-logger', () => ({
  logBugError: (...args: unknown[]) => mockLogBugError(...args),
}));

jest.mock('@/lib/crash-marker', () => ({
  recordCrash: () => mockRecordCrash(),
}));

// eslint-disable-next-line import/first -- module import must run after Jest module mocks are registered.
import { installGlobalErrorHandler, resolveErrorUtils } from '../global-error-handler';

type Handler = (error: unknown, isFatal?: boolean) => void;

function fakeErrorUtils() {
  const previous = jest.fn<void, [unknown, boolean | undefined]>();
  let current: Handler = previous;
  const setGlobalHandler = jest.fn((handler: Handler) => {
    current = handler;
  });
  const utils: ErrorUtils = {
    getGlobalHandler: () => current,
    setGlobalHandler,
  };
  return {
    utils,
    previous,
    setGlobalHandler,
    invoke: (error: unknown, isFatal?: boolean) => current(error, isFatal),
  };
}

describe('installGlobalErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a fatal error in the bug log and the crash marker, then delegates to the previous handler', () => {
    const fake = fakeErrorUtils();
    const error = new Error('fatal');

    expect(installGlobalErrorHandler(fake.utils)).toBe(true);
    fake.invoke(error, true);

    expect(mockLogBugError).toHaveBeenCalledWith('global-error', error, { isFatal: true });
    expect(mockRecordCrash).toHaveBeenCalledTimes(1);
    expect(fake.previous).toHaveBeenCalledWith(error, true);
  });

  it('logs a non-fatal error without touching the crash marker', () => {
    const fake = fakeErrorUtils();
    const error = new Error('soft');

    installGlobalErrorHandler(fake.utils);
    fake.invoke(error, false);

    expect(mockLogBugError).toHaveBeenCalledWith('global-error', error, { isFatal: false });
    expect(mockRecordCrash).not.toHaveBeenCalled();
    expect(fake.previous).toHaveBeenCalledWith(error, false);
  });

  it('installs once per ErrorUtils', () => {
    const fake = fakeErrorUtils();

    expect(installGlobalErrorHandler(fake.utils)).toBe(true);
    expect(installGlobalErrorHandler(fake.utils)).toBe(true);

    expect(fake.setGlobalHandler).toHaveBeenCalledTimes(1);
  });

  it('is a no-op where ErrorUtils is absent (web, jest)', () => {
    expect(installGlobalErrorHandler(null)).toBe(false);
  });

  it('still delegates when recording itself throws', () => {
    const fake = fakeErrorUtils();
    const error = new Error('fatal');
    mockLogBugError.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    installGlobalErrorHandler(fake.utils);
    expect(() => fake.invoke(error, true)).not.toThrow();

    expect(fake.previous).toHaveBeenCalledWith(error, true);
  });
});

describe('resolveErrorUtils', () => {
  const holder = globalThis as { ErrorUtils?: unknown };
  const original = holder.ErrorUtils;

  afterEach(() => {
    holder.ErrorUtils = original;
  });

  it('returns the global when it has the handler API', () => {
    const fake = fakeErrorUtils();
    holder.ErrorUtils = fake.utils;
    expect(resolveErrorUtils()).toBe(fake.utils);
  });

  it('returns null for a missing or partial global', () => {
    holder.ErrorUtils = undefined;
    expect(resolveErrorUtils()).toBeNull();
    holder.ErrorUtils = { setGlobalHandler: () => {} };
    expect(resolveErrorUtils()).toBeNull();
  });
});
