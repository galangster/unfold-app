import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBibleDb } from '@/hooks/useBibleDb';
import { downloadBibleDb, getBibleDbStatus, verifyBibleDb, type BibleDbStatus } from '@/lib/bible-db';

jest.mock('@/lib/bible-db', () => ({
  getBibleDbStatus: jest.fn(),
  verifyBibleDb: jest.fn(),
  downloadBibleDb: jest.fn(),
}));

const mockStatus = jest.mocked(getBibleDbStatus);
const mockVerify = jest.mocked(verifyBibleDb);
const mockDownload = jest.mocked(downloadBibleDb);

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
  beforeEach(() => {
    jest.clearAllMocks();
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

    await act(async () => finish(true));
    expect(result.current.isReady).toBe(true);
    expect(result.current.progress).toBeNull();
  });
});
