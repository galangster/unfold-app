import {
  applyPulledDevotionalContent,
  applyPulledDevotionalMetadataToDevotionals,
} from '@/lib/devotional-pulled-content';
import type { PulledDevotionalContent } from '@/lib/devotional-sync-pull';
import type { Devotional, DevotionalDay } from '@/lib/store';

const dayTwo: DevotionalDay = {
  id: 'day-devotional-1-2',
  devotionalId: 'devotional-1',
  dayNumber: 2,
  title: 'The Fire That Speaks Your Name',
  scriptureReference: 'Exodus 3:13-15',
  scriptureText: 'God said to Moses, I AM WHO I AM.',
  bodyText: 'A devotional body from the server.',
  quotableLine: 'God meets you by name in the fire.',
  isRead: false,
  updatedAt: '2026-04-25T11:58:00.000Z',
};

const baseDevotional: Devotional = {
  id: 'devotional-1',
  title: 'The Names That Hold You',
  totalDays: 14,
  currentDay: 1,
  days: [],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-25T00:00:00.000Z',
  userContext: {
    name: 'Nick',
    aboutMe: '',
    currentSituation: '',
    emotionalState: '',
  },
  generationMode: 'progressive',
};

function pulledContent(overrides: Partial<PulledDevotionalContent> = {}): PulledDevotionalContent {
  return {
    timestamp: '2026-04-25T12:00:00.000Z',
    days: [dayTwo],
    devotional: {
      id: 'devotional-1',
      title: 'The Names That Hold You',
      totalDays: 14,
      currentDay: 2,
      updatedAt: '2026-04-25T13:29:48.574Z',
    },
    ...overrides,
  };
}

describe('pulled devotional content application', () => {
  it('applies pulled days and metadata through the shared callbacks', () => {
    const updateDevotionalDays = jest.fn();
    const updateDevotionals = jest.fn();
    const pulled = pulledContent();

    applyPulledDevotionalContent({
      devotionalId: 'devotional-1',
      pulled,
      updateDevotionalDays,
      updateDevotionals,
    });

    expect(updateDevotionalDays).toHaveBeenCalledWith(
      'devotional-1',
      [dayTwo],
      'The Names That Hold You',
    );
    expect(updateDevotionals).toHaveBeenCalledTimes(1);

    const updater = updateDevotionals.mock.calls[0][0] as (devotionals: Devotional[]) => Devotional[];
    expect(updater([baseDevotional])).toEqual([
      {
        ...baseDevotional,
        currentDay: 2,
        updatedAt: '2026-04-25T13:29:48.574Z',
      },
    ]);
  });

  it('skips writes when no pulled days or devotional metadata exist', () => {
    const updateDevotionalDays = jest.fn();
    const updateDevotionals = jest.fn();

    applyPulledDevotionalContent({
      devotionalId: 'devotional-1',
      pulled: pulledContent({ days: [], devotional: undefined }),
      updateDevotionalDays,
      updateDevotionals,
    });

    expect(updateDevotionalDays).not.toHaveBeenCalled();
    expect(updateDevotionals).not.toHaveBeenCalled();
  });

  it('returns the original devotional array when metadata does not change anything', () => {
    const devotionals = [baseDevotional];
    const result = applyPulledDevotionalMetadataToDevotionals(
      devotionals,
      'devotional-1',
      pulledContent({
        days: [],
        devotional: {
          id: 'devotional-1',
          title: baseDevotional.title,
          totalDays: baseDevotional.totalDays,
          currentDay: baseDevotional.currentDay,
        },
      }),
    );

    expect(result).toBe(devotionals);
  });
});
