import { isStrictActiveSeriesWinner } from '../devotional-active-selection';

const at = (ms: number) => new Date(ms).toISOString();
const resumed = { id: 'series-a', generationMode: 'progressive', createdAt: at(100), archivedAt: null, archivedStateAt: at(300) };

describe('canonical active series proof', () => {
  it.each([
    { id: 'series-b', generationMode: 'progressive', createdAt: at(400), archivedAt: null },
    { id: 'series-b', generationMode: 'progressive', createdAt: at(100), archivedAt: null, archivedStateAt: at(400) },
    { id: 'series-b', createdAt: at(400), archivedAt: null },
  ])('refuses a newer eligible sibling: %j', (sibling) => {
    expect(isStrictActiveSeriesWinner('series-a', [resumed, sibling])).toBe(false);
  });

  it.each([
    { id: 'series-b', generationMode: 'batch', createdAt: at(400), archivedAt: null },
    { id: 'series-b', generationMode: 'progressive', createdAt: at(400), archivedAt: at(500) },
    { id: 'onboarding-sample-b', generationMode: 'progressive', createdAt: at(400), archivedAt: null },
  ])('ignores a sibling excluded by the backend callers: %j', (sibling) => {
    expect(isStrictActiveSeriesWinner('series-a', [resumed, sibling])).toBe(true);
  });

  it('fails closed on equal maximum clocks in either pull order', () => {
    const sibling = { id: 'series-b', generationMode: 'progressive', createdAt: at(300), archivedAt: null };
    for (const candidates of [[resumed, sibling], [sibling, resumed]]) {
      expect(isStrictActiveSeriesWinner('series-a', candidates)).toBe(false);
    }
  });

  it('requires the target to be present and eligible', () => {
    expect(isStrictActiveSeriesWinner('series-a', [])).toBe(false);
    expect(isStrictActiveSeriesWinner('series-a', [{ ...resumed, archivedAt: at(400) }])).toBe(false);
    expect(isStrictActiveSeriesWinner('series-a', [{ ...resumed, generationMode: 'batch' }])).toBe(false);
  });
});
