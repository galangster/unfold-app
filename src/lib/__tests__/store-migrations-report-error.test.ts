/**
 * A migration step that throws used to be a raw console.error: dropped in
 * production (drop_console) and noise in dev. It now goes through reportError
 * (which also writes the bug log), the rest of the chain keeps running, and a
 * failure inside the reporter itself can never break hydration.
 */
import { migrateUnfoldStore } from '@/lib/store-migrations';
import { logger } from '@/lib/logger';

const mockReportError = jest.fn();

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/report-error', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

describe('migrateUnfoldStore failure reporting', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockReportError.mockReset();
    (logger.error as jest.Mock).mockReset();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('routes a throwing step through reportError and keeps migrating', () => {
    // v31→32 walks `d.days` without a null guard, so a null entry throws.
    const state = migrateUnfoldStore({ devotionals: [null] }, 31);

    expect(mockReportError).toHaveBeenCalledTimes(1);
    const [source, err, extra] = mockReportError.mock.calls[0];
    expect(source).toBe('store-migration');
    expect(err).toBeInstanceOf(TypeError);
    expect(extra).toEqual({ step: 'v31→32' });

    // No raw console output — the logger/bug log is the only channel.
    expect(consoleError).not.toHaveBeenCalled();

    // Later steps still ran (v38→39 seeds the Recently Deleted list).
    expect(state.deletedNotes).toEqual([]);
  });

  it('never lets a reporter failure break hydration', () => {
    mockReportError.mockImplementation(() => {
      throw new Error('bug log unavailable');
    });

    expect(() => migrateUnfoldStore({ devotionals: [null] }, 31)).not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('v31→32'),
      expect.any(TypeError),
      expect.any(Error),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('reports nothing when every step succeeds', () => {
    const state = migrateUnfoldStore({ devotionals: [] }, 1);

    expect(mockReportError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(state.deletedNotes).toEqual([]);
  });
});
