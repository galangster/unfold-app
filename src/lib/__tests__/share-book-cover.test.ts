import * as Sharing from 'expo-sharing';
import { releaseCapture } from 'react-native-view-shot';
import { shareBookCover } from '../share-book-cover';
import { copyAsync, deleteAsync } from 'expo-file-system/legacy';

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ releaseCapture: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', makeDirectoryAsync: jest.fn(), copyAsync: jest.fn(), deleteAsync: jest.fn(),
}));

const available = jest.mocked(Sharing.isAvailableAsync);
const share = jest.mocked(Sharing.shareAsync);

beforeEach(() => {
  jest.resetAllMocks();
  available.mockResolvedValue(true);
  share.mockResolvedValue(undefined);
  jest.mocked(deleteAsync).mockResolvedValue(undefined);
});

it('retains the image while the native sheet is open and removes it after dismissal', async () => {
  let dismiss: () => void = () => {};
  share.mockImplementation(() => new Promise<void>(resolve => { dismiss = resolve; }));
  const capture = jest.fn(async () => 'file:///cover.png');
  const result = shareBookCover('A Quiet Beginning', capture);
  await new Promise(resolve => setImmediate(resolve));
  expect(capture).toHaveBeenCalledTimes(1);
  expect(share).toHaveBeenCalledWith(expect.stringContaining(`/${encodeURIComponent('A Quiet Beginning — Unfold.png')}`), expect.objectContaining({ mimeType: 'image/png', UTI: 'public.png' }));
  expect(releaseCapture).not.toHaveBeenCalled();
  expect(deleteAsync).not.toHaveBeenCalled();
  dismiss();
  await expect(result).resolves.toBe('shared');
  expect(releaseCapture).toHaveBeenCalledWith('file:///cover.png');
  expect(deleteAsync).toHaveBeenCalledTimes(1);
});

it('does not create a file when sharing is unavailable', async () => {
  available.mockResolvedValue(false);
  const capture = jest.fn();
  await expect(shareBookCover('A Quiet Beginning', capture)).resolves.toBe('unavailable');
  expect(capture).not.toHaveBeenCalled();
  expect(share).not.toHaveBeenCalled();
});

it.each(['cancelled', 'native share failed'])('removes the image when sharing rejects: %s', async message => {
  share.mockRejectedValue(new Error(message));
  await expect(shareBookCover('A Quiet Beginning', async () => 'file:///cover.png')).rejects.toThrow(message);
  expect(releaseCapture).toHaveBeenCalledWith('file:///cover.png');
});

it('does not open a sheet or release an invalid URI when capture fails', async () => {
  await expect(shareBookCover('A Quiet Beginning', async () => { throw new Error('capture failed'); })).rejects.toThrow('capture failed');
  expect(share).not.toHaveBeenCalled();
  expect(releaseCapture).not.toHaveBeenCalled();
});

it('keeps series titles inside the temporary export directory', async () => {
  await shareBookCover('../A path: to / trust?', async () => 'file:///cover.png');
  expect(copyAsync).toHaveBeenCalledWith({ from: 'file:///cover.png', to: expect.stringContaining(`/${encodeURIComponent('..A path to  trust — Unfold.png')}`) });
});

it('encodes title characters that have special meaning in file URIs', async () => {
  await shareBookCover('Psalm #23', async () => 'file:///cover.png');
  expect(copyAsync).toHaveBeenCalledWith({ from: 'file:///cover.png', to: expect.stringContaining('/Psalm%20%2323%20%E2%80%94%20Unfold.png') });
});

it('uses a new export directory after a previous share finishes', async () => {
  const now = jest.spyOn(Date, 'now');
  now.mockReturnValueOnce(1_700_000_000_000).mockReturnValueOnce(1_700_000_000_250);
  try {
    await shareBookCover('First cover', async () => 'file:///first.png');
    await shareBookCover('Second cover', async () => 'file:///second.png');
  } finally {
    now.mockRestore();
  }
  const first = jest.mocked(copyAsync).mock.calls[0]?.[0].to as string;
  const second = jest.mocked(copyAsync).mock.calls[1]?.[0].to as string;
  expect(first).toContain('unfold-cover-1700000000000/');
  expect(second).toContain('unfold-cover-1700000000250/');
  expect(releaseCapture).toHaveBeenNthCalledWith(1, 'file:///first.png');
  expect(releaseCapture).toHaveBeenNthCalledWith(2, 'file:///second.png');
  expect(deleteAsync).toHaveBeenCalledTimes(2);
});

it('cleans both files if preparing the named image fails', async () => {
  jest.mocked(copyAsync).mockRejectedValue(new Error('storage full'));
  await expect(shareBookCover('A Quiet Beginning', async () => 'file:///cover.png')).rejects.toThrow('storage full');
  expect(share).not.toHaveBeenCalled();
  expect(releaseCapture).toHaveBeenCalledWith('file:///cover.png');
  expect(deleteAsync).toHaveBeenCalledTimes(1);
});
