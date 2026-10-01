import React, { Activity, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { copyText, useCopyConfirmation, type CopyConfirmation } from '../useCopyConfirmation';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const setStringAsync = jest.mocked(Clipboard.setStringAsync);
const TEXT = 'The words that a reader copied';
const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

let announce: jest.SpyInstance;
let consoleSpies: jest.SpyInstance[];

// A copy that rejects fails the test here, because act() awaits it.
async function copy(result: { current: CopyConfirmation }) {
  let didCopy: boolean | undefined;
  await act(async () => {
    didCopy = await result.current.copy(TEXT);
  });
  return didCopy;
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** A clipboard write that lands when the test says so. */
function heldWrite() {
  let land!: (didCopy: boolean) => void;
  setStringAsync.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      land = resolve;
    }),
  );
  return { land };
}

/** Starts a copy and leaves its write on its way. */
function startCopy(result: { current: CopyConfirmation }) {
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.copy(TEXT);
  });
  return pending;
}

beforeEach(() => {
  // act() queues a microtask of its own. Microtasks stay real, so the timer
  // count holds timers only.
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  jest.clearAllMocks();
  setStringAsync.mockReset();
  setStringAsync.mockResolvedValue(true);
  announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  consoleSpies = CONSOLE_LEVELS.map((level) => jest.spyOn(console, level));
});

afterEach(() => {
  const consoleCalls = consoleSpies.flatMap((spy) => spy.mock.calls);
  jest.restoreAllMocks();
  jest.useRealTimers();
  // The hook writes nothing to the console, so the copied text is not there.
  expect(consoleCalls).toEqual([]);
});

describe('useCopyConfirmation', () => {
  it('starts with no confirmation and no clipboard write', () => {
    const { result } = renderHook(useCopyConfirmation);

    expect(result.current.copied).toBe(false);
    expect(setStringAsync).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('confirms and announces after the clipboard takes the text', async () => {
    const { result } = renderHook(useCopyConfirmation);

    expect(await copy(result)).toBe(true);

    expect(setStringAsync).toHaveBeenCalledTimes(1);
    expect(setStringAsync).toHaveBeenCalledWith(TEXT);
    expect(result.current.copied).toBe(true);
    expect(announce.mock.calls).toEqual([['Copied']]);
  });

  it('holds the confirmation for 2 seconds', async () => {
    const { result } = renderHook(useCopyConfirmation);
    await copy(result);

    advance(1999);
    expect(result.current.copied).toBe(true);

    advance(1);
    expect(result.current.copied).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('counts the 2 seconds from the last copy', async () => {
    const { result } = renderHook(useCopyConfirmation);
    await copy(result);
    advance(1000);
    await copy(result);

    advance(1999);
    expect(result.current.copied).toBe(true);

    advance(1);
    expect(result.current.copied).toBe(false);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    ['returns false', () => setStringAsync.mockResolvedValue(false)],
    ['rejects', () => setStringAsync.mockRejectedValue(new Error('clipboard unavailable'))],
  ])('does not confirm, and does not reject, when the clipboard %s', async (_case, arrange) => {
    arrange();
    const { result } = renderHook(useCopyConfirmation);

    expect(await copy(result)).toBe(false);

    expect(setStringAsync).toHaveBeenCalledWith(TEXT);
    expect(result.current.copied).toBe(false);
    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps a confirmation that is in view when a later copy fails', async () => {
    const { result } = renderHook(useCopyConfirmation);
    await copy(result);
    advance(1000);
    setStringAsync.mockResolvedValue(false);

    await copy(result);

    expect(result.current.copied).toBe(true);
    advance(999);
    expect(result.current.copied).toBe(true);
    advance(1);
    expect(result.current.copied).toBe(false);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('lets the later write decide when two writes overlap', async () => {
    const first = heldWrite();
    const second = heldWrite();
    const { result } = renderHook(useCopyConfirmation);
    const firstCopy = startCopy(result);
    const secondCopy = startCopy(result);

    await act(async () => {
      first.land(true);
      await firstCopy;
    });
    expect(result.current.copied).toBe(false);

    await act(async () => {
      second.land(true);
      await secondCopy;
    });
    expect(result.current.copied).toBe(true);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('clears its timer on unmount, and no state update follows', async () => {
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders += 1;
      return useCopyConfirmation();
    });
    await copy(result);
    expect(jest.getTimerCount()).toBe(1);
    const rendersAtUnmount = renders;

    unmount();

    expect(jest.getTimerCount()).toBe(0);
    advance(2000);
    expect(renders).toBe(rendersAtUnmount);
    expect(result.current.copied).toBe(true);
  });

  it('ends the confirmation when React hides the component and shows it again', async () => {
    let mode: 'visible' | 'hidden' = 'visible';
    const { result, rerender } = renderHook(useCopyConfirmation, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Activity mode={mode}>{children}</Activity>
      ),
    });
    await copy(result);
    expect(result.current.copied).toBe(true);

    mode = 'hidden';
    rerender({});
    expect(jest.getTimerCount()).toBe(0);
    mode = 'visible';
    rerender({});

    expect(result.current.copied).toBe(false);
  });

  it('confirms nothing when the write lands after unmount', async () => {
    const write = heldWrite();
    const { result, unmount } = renderHook(useCopyConfirmation);
    const pending = startCopy(result);

    unmount();
    await act(async () => {
      write.land(true);
      await pending;
    });

    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ends the confirmation and its timer on reset', async () => {
    const { result } = renderHook(useCopyConfirmation);
    await copy(result);
    expect(result.current.copied).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.copied).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('confirms nothing when the write lands after a reset', async () => {
    const write = heldWrite();
    const { result } = renderHook(useCopyConfirmation);
    const pending = startCopy(result);

    act(() => {
      result.current.reset();
    });
    await act(async () => {
      write.land(true);
      await pending;
    });

    expect(result.current.copied).toBe(false);
    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('confirms the next copy after a reset', async () => {
    const { result } = renderHook(useCopyConfirmation);
    await copy(result);
    act(() => {
      result.current.reset();
    });

    await copy(result);

    expect(result.current.copied).toBe(true);
    advance(2000);
    expect(result.current.copied).toBe(false);
  });

  it('returns the same functions on every render', async () => {
    const { result, rerender } = renderHook(useCopyConfirmation);
    const first = result.current;

    rerender({});
    await copy(result);
    advance(2000);

    expect(result.current.copy).toBe(first.copy);
    expect(result.current.reset).toBe(first.reset);
  });

  it('keeps the copied text out of the announcement, also when the failure names it', async () => {
    const { result } = renderHook(useCopyConfirmation);

    await copy(result);
    setStringAsync.mockResolvedValue(false);
    await copy(result);
    setStringAsync.mockRejectedValue(new Error(`could not write: ${TEXT}`));
    await copy(result);

    expect(announce.mock.calls).toEqual([['Copied']]);
  });
});

describe('copyText', () => {
  it('resolves true when the clipboard takes the text and confirms nothing', async () => {
    await expect(copyText(TEXT)).resolves.toBe(true);
    expect(setStringAsync).toHaveBeenCalledWith(TEXT);
    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resolves false, and does not reject, when the clipboard refuses the text', async () => {
    setStringAsync.mockResolvedValueOnce(false);
    await expect(copyText(TEXT)).resolves.toBe(false);
    setStringAsync.mockRejectedValueOnce(new Error(`clipboard refused ${TEXT}`));
    await expect(copyText(TEXT)).resolves.toBe(false);
    expect(announce).not.toHaveBeenCalled();
  });
});
