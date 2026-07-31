/**
 * Ending a series must reach the server.
 *
 * archiveCurrentDevotional used to be `set({ currentDevotionalId: null })` —
 * purely local. The backend kept treating the abandoned series as the user's
 * active one: still advancing it, still a valid generation target, and still
 * shown as "In Progress" forever. Two series then looked equally live.
 */
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true })),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

const mockEnqueue = jest.fn();

jest.mock('@/lib/personal-data-sync-records', () => {
  const actual = jest.requireActual('@/lib/personal-data-sync-records');
  return {
    ...actual,
    enqueuePersonalDataSyncChange: (...args: unknown[]) => mockEnqueue(...args),
  };
});

import { useUnfoldStore } from '@/lib/store';
import type { Devotional } from '@/lib/store';

function series(id: string, overrides: Partial<Devotional> = {}): Devotional {
  return {
    id,
    title: `Series ${id}`,
    totalDays: 30,
    currentDay: 2,
    days: [],
    createdAt: '2026-07-28T10:39:26.418Z',
    updatedAt: '2026-07-28T10:39:26.418Z',
    seriesStartDate: '2026-07-28T10:39:26.418Z',
    generationMode: 'progressive',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...overrides,
  } as Devotional;
}

describe('archiveCurrentDevotional', () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    useUnfoldStore.setState({
      devotionals: [series('a'), series('b')],
      currentDevotionalId: 'a',
    });
  });

  it('stamps archivedAt on the series being ended, and only that one', () => {
    useUnfoldStore.getState().archiveCurrentDevotional();

    const { devotionals } = useUnfoldStore.getState();
    expect(devotionals.find((d) => d.id === 'a')?.archivedAt).toEqual(expect.any(String));
    expect(devotionals.find((d) => d.id === 'b')?.archivedAt).toBeUndefined();
  });

  it('clears the current pointer', () => {
    useUnfoldStore.getState().archiveCurrentDevotional();
    expect(useUnfoldStore.getState().currentDevotionalId).toBeNull();
  });

  it('pushes the archive to the server', () => {
    useUnfoldStore.getState().archiveCurrentDevotional();

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [table, id, data] = mockEnqueue.mock.calls[0];
    expect(table).toBe('devotionals');
    expect(id).toBe('a');
    expect((data as { archivedAt?: string }).archivedAt).toEqual(expect.any(String));
  });

  it('is a no-op when there is no current series', () => {
    useUnfoldStore.setState({ currentDevotionalId: null });
    useUnfoldStore.getState().archiveCurrentDevotional();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not re-push an already-archived series', () => {
    useUnfoldStore.setState({
      devotionals: [series('a', { archivedAt: '2026-07-29T00:00:00.000Z' })],
      currentDevotionalId: 'a',
    });

    useUnfoldStore.getState().archiveCurrentDevotional();

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(useUnfoldStore.getState().devotionals[0].archivedAt).toBe('2026-07-29T00:00:00.000Z');
  });
});

/**
 * Creating a series is what ends the previous one — not tapping "Continue" on
 * the confirmation alert. Archiving at the alert bricked the old series if the
 * user then abandoned onboarding: it stopped being a generation target with
 * nothing created to replace it.
 */
describe('addDevotional enforces one active series', () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    useUnfoldStore.setState({ devotionals: [series('old')], currentDevotionalId: 'old' });
  });

  it('archives the previous series when a new one is created', () => {
    useUnfoldStore.getState().addDevotional(series('new'));

    const { devotionals, currentDevotionalId } = useUnfoldStore.getState();
    expect(currentDevotionalId).toBe('new');
    expect(devotionals.find((d) => d.id === 'new')?.archivedAt).toBeUndefined();
    expect(devotionals.find((d) => d.id === 'old')?.archivedAt).toEqual(expect.any(String));
  });

  it('pushes the archive of the previous series to the server', () => {
    useUnfoldStore.getState().addDevotional(series('new'));

    const archivePushes = mockEnqueue.mock.calls.filter(
      ([table, , data]) => table === 'devotionals' && (data as { archivedAt?: string }).archivedAt,
    );
    expect(archivePushes).toHaveLength(1);
    expect(archivePushes[0][1]).toBe('old');
  });

  it('leaves exactly one active series no matter how many existed', () => {
    useUnfoldStore.setState({
      devotionals: [series('a'), series('b'), series('c')],
      currentDevotionalId: 'a',
    });

    useUnfoldStore.getState().addDevotional(series('d'));

    const active = useUnfoldStore.getState().devotionals.filter((d) => !d.archivedAt);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('d');
  });

  it('does not re-archive or re-push an already-archived series', () => {
    useUnfoldStore.setState({
      devotionals: [series('old', { archivedAt: '2026-07-29T00:00:00.000Z' })],
      currentDevotionalId: null,
    });

    useUnfoldStore.getState().addDevotional(series('new'));

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(
      useUnfoldStore.getState().devotionals.find((d) => d.id === 'old')?.archivedAt,
    ).toBe('2026-07-29T00:00:00.000Z');
  });

  it('re-adding the same series does not archive it', () => {
    useUnfoldStore.getState().addDevotional(series('old'));
    expect(useUnfoldStore.getState().devotionals.find((d) => d.id === 'old')?.archivedAt)
      .toBeUndefined();
  });
});

describe('onboarding sample must not end a real series', () => {
  it('leaves the active series alone when archiveOthers is false', () => {
    // ReadDevotionalStep adds a one-day "Your First Devotional" preview on every
    // onboarding run. Production has users with up to 7 of these. Letting the
    // preview archive their real series would silently end the thing they were
    // actually reading.
    useUnfoldStore.setState({
      devotionals: [series('real')],
      currentDevotionalId: 'real',
    });

    useUnfoldStore
      .getState()
      .addDevotional(series('onboarding-sample'), { archiveOthers: false });

    const real = useUnfoldStore.getState().devotionals.find((d) => d.id === 'real');
    expect(real?.archivedAt).toBeUndefined();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('resumeDevotional', () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    useUnfoldStore.setState({
      devotionals: [
        series('ended', { archivedAt: '2026-07-29T00:00:00.000Z' }),
        series('active'),
      ],
      currentDevotionalId: 'active',
    });
  });

  it('clears archivedAt and makes the series current', () => {
    useUnfoldStore.getState().resumeDevotional('ended');
    const { devotionals, currentDevotionalId } = useUnfoldStore.getState();
    expect(currentDevotionalId).toBe('ended');
    expect(devotionals.find((d) => d.id === 'ended')?.archivedAt).toBeUndefined();
  });

  it('ends whatever was active, keeping exactly one', () => {
    useUnfoldStore.getState().resumeDevotional('ended');
    const active = useUnfoldStore.getState().devotionals.filter((d) => !d.archivedAt);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('ended');
  });

  it('pushes both sides of the swap', () => {
    useUnfoldStore.getState().resumeDevotional('ended');
    const byId = Object.fromEntries(
      mockEnqueue.mock.calls.map(([, id, data]) => [id, data as { archivedAt: string | null }]),
    );
    expect(byId['ended'].archivedAt).toBeNull();
    expect(byId['active'].archivedAt).toEqual(expect.any(String));
  });

  it('is a no-op for an unknown id', () => {
    useUnfoldStore.getState().resumeDevotional('nope');
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(useUnfoldStore.getState().currentDevotionalId).toBe('active');
  });
});

