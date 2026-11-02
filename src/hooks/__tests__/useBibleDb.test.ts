import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBibleDb } from '@/hooks/useBibleDb';
import {
  downloadBibleDb,
  getBibleDbStatus,
  subscribeBibleDbStatus,
  verifyBibleDb,
  type BibleDbStatus,
} from '@/lib/bible-db';

jest.mock('@/lib/bible-db', () => ({
  getBibleDbStatus: jest.fn(),
  subscribeBibleDbStatus: jest.fn(),
  verifyBibleDb: jest.fn(),
  downloadBibleDb: jest.fn(),
}));

const mockStatus = jest.mocked(getBibleDbStatus);
const mockVerify = jest.mocked(verifyBibleDb);
const mockDownload = jest.mocked(downloadBibleDb);
const mockSubscribe = jest.mocked(subscribeBibleDbStatus);

function storedStatus(status: BibleDbStatus) {
  mockStatus.mockReturnValue({
    status,
    downloadedAt: null,
    version: null,
    sizeBytes: null,
    errorMessage: null,
  });
}

describe('useBibleDb', () => {
  let statusListeners: Set<() => void>;

  function changeStatus(status: BibleDbStatus) {
    storedStatus(status);
    statusListeners.forEach((listener) => listener());
  }

  beforeEach(() => {
    jest.clearAllMocks();
    statusListeners = new Set();
    mockSubscribe.mockImplementation((listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    });
  });

  it('trusts a stored ready status while the file check waits behind other native calls', () => {
    storedStatus('ready');
    mockVerify.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBibleDb());

    expect(result.current.isReady).toBe(true);
  });

  it('asks for the download when the file check finds the database gone', async () => {
    storedStatus('ready');
    mockVerify.mockResolvedValue('not_downloaded');

    const { result } = renderHook(() => useBibleDb());

    await waitFor(() => expect(result.current.status).toBe('not_downloaded'));
    expect(result.current.isReady).toBe(false);
  });

  it('follows a download that started elsewhere through to ready', async () => {
    storedStatus('downloading');
    mockVerify.mockResolvedValue('downloading');
    let finish: (ok: boolean) => void = () => {};
    let report: ((progress: number) => void) | undefined;
    mockDownload.mockImplementation((onProgress) => {
      report = onProgress;
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    });

    const { result } = renderHook(() => useBibleDb());

    expect(result.current.isDownloading).toBe(true);
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));

    act(() => report?.(0.5));
    expect(result.current.progress).toBe(0.5);

    await act(async () => {
      changeStatus('ready');
      finish(true);
    });
    expect(result.current.isReady).toBe(true);
    expect(result.current.progress).toBeNull();
  });

  it('keeps separate screens on one status, so a chapter loads after the reader downloads', async () => {
    storedStatus('not_downloaded');
    mockVerify.mockResolvedValue('not_downloaded');
    mockDownload.mockResolvedValue(true);

    const reader = renderHook(() => useBibleDb());
    const chapter = renderHook(() => useBibleDb());
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(2));

    await act(async () => {
      await reader.result.current.download();
      changeStatus('ready');
    });

    expect(reader.result.current.isReady).toBe(true);
    expect(chapter.result.current.isReady).toBe(true);
  });

  it('follows a download that another screen starts, with its progress', async () => {
    storedStatus('not_downloaded');
    mockVerify.mockResolvedValue('not_downloaded');
    let report: (progress: number) => void = () => {};
    let finish: (success: boolean) => void = () => {};
    mockDownload.mockImplementation((onProgress) => {
      report = onProgress ?? report;
      return new Promise((resolve) => { finish = resolve; });
    });

    const { result } = renderHook(() => useBibleDb());
    await waitFor(() => expect(mockVerify).toHaveBeenCalled());

    act(() => changeStatus('downloading'));
    expect(result.current.isDownloading).toBe(true);

    act(() => report(0.5));
    expect(result.current.progress).toBe(0.5);

    // A second change must not join the same download again.
    act(() => changeStatus('downloading'));
    expect(mockDownload).toHaveBeenCalledTimes(1);

    await act(async () => {
      changeStatus('ready');
      finish(true);
    });
    expect(result.current.isReady).toBe(true);
    expect(result.current.progress).toBeNull();
  });

  it('stops listening when the screen goes away', () => {
    storedStatus('ready');
    mockVerify.mockReturnValue(new Promise(() => {}));

    const { unmount } = renderHook(() => useBibleDb());
    expect(statusListeners.size).toBe(1);

    unmount();
    expect(statusListeners.size).toBe(0);
  });
});
