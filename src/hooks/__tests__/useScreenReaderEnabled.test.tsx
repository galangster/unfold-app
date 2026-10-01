import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useScreenReaderEnabled } from '../useScreenReaderEnabled';

/** The next hook's screen reader: its first answer lands when the test says
 *  so, and the test can report a change. */
function screenReader(firstAnswer: boolean) {
  let answer!: () => void;
  let change: ((on: boolean) => void) | undefined;
  const remove = jest.fn();
  jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      answer = () => resolve(firstAnswer);
    }),
  );
  jest.mocked(AccessibilityInfo.addEventListener).mockImplementationOnce(((_event: string, handler: (on: boolean) => void) => {
    change = handler;
    return { remove };
  }) as never);
  return { answer, change: (on: boolean) => change?.(on), remove };
}

describe('useScreenReaderEnabled', () => {
  it('starts off, turns on when the first answer says so, and follows each change', async () => {
    const reader = screenReader(true);
    const { result, unmount } = renderHook(useScreenReaderEnabled);
    expect(result.current).toBe(false);
    await act(async () => reader.answer());
    expect(result.current).toBe(true);
    act(() => reader.change(false));
    expect(result.current).toBe(false);
    unmount();
    expect(reader.remove).toHaveBeenCalledTimes(1);
  });

  it('keeps a change that comes before the first answer', async () => {
    const reader = screenReader(true);
    const { result } = renderHook(useScreenReaderEnabled);
    act(() => reader.change(false));
    await act(async () => reader.answer());
    expect(result.current).toBe(false);
  });
});
