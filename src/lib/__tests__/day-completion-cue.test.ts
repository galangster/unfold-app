import { emitDayCompletionCueAfterSave } from '../day-completion-cue';
import { flushUnfoldStorePersistAsync } from '../store';
import { emitSuccessCue } from '../success-cues';

let mockIdentity = 'reader';
let mockRead = true;
jest.mock('../store', () => ({
  flushUnfoldStorePersistAsync: jest.fn(),
  useUnfoldStore: { getState: () => ({ devotionals: [{ id: 'series', days: [{ dayNumber: 2, isRead: mockRead }] }] }) },
}));
jest.mock('../mmkv-storage', () => ({ getDeviceId: () => mockIdentity }));
jest.mock('../success-cues', () => ({ emitSuccessCue: jest.fn() }));
jest.mock('../logger', () => ({ logger: { warn: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRead = true;
  mockIdentity = 'reader';
});

it('waits for the durable write before emitting', async () => {
  let finish!: (saved: boolean) => void;
  jest.mocked(flushUnfoldStorePersistAsync).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const work = emitDayCompletionCueAfterSave('series', 2, () => true);
  expect(emitSuccessCue).not.toHaveBeenCalled();
  finish(true);
  await work;
  expect(emitSuccessCue).toHaveBeenCalledWith({ type: 'day-completed', devotionalId: 'series', dayNumber: 2, eligible: true });
});

it('does not reward an unsuccessful save', async () => {
  jest.mocked(flushUnfoldStorePersistAsync).mockResolvedValue(false);
  await emitDayCompletionCueAfterSave('series', 2, () => true);
  expect(emitSuccessCue).not.toHaveBeenCalled();
});

it('does not emit across an identity reset', async () => {
  jest.mocked(flushUnfoldStorePersistAsync).mockImplementation(async () => { mockIdentity = 'new-reader'; return true; });
  await emitDayCompletionCueAfterSave('series', 2, () => true);
  expect(emitSuccessCue).not.toHaveBeenCalled();
});

it('consumes a durable completion silently after the reader leaves', async () => {
  jest.mocked(flushUnfoldStorePersistAsync).mockResolvedValue(true);
  await emitDayCompletionCueAfterSave('series', 2, () => false);
  expect(emitSuccessCue).toHaveBeenCalledWith(expect.objectContaining({ eligible: false }));
});

it('ignores a deleted or reset day', async () => {
  mockRead = false;
  jest.mocked(flushUnfoldStorePersistAsync).mockResolvedValue(true);
  await emitDayCompletionCueAfterSave('series', 2, () => true);
  expect(emitSuccessCue).not.toHaveBeenCalled();
});


it('waits for the outgoing music fade without delaying the save', async () => {
  let finishFade!: () => void;
  const ending = new Promise<void>((resolve) => { finishFade = resolve; });
  jest.mocked(flushUnfoldStorePersistAsync).mockResolvedValue(true);
  const work = emitDayCompletionCueAfterSave('series', 2, () => true, ending);
  await Promise.resolve();
  expect(flushUnfoldStorePersistAsync).toHaveBeenCalledTimes(1);
  expect(emitSuccessCue).not.toHaveBeenCalled();
  finishFade();
  await work;
  expect(emitSuccessCue).toHaveBeenCalledTimes(1);
});
