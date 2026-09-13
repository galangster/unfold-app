import type { Conversation } from '../companion-chat-store';
import {
  buildListItems,
  conversationMatchesTitleQuery,
  formatRelativeDate,
  getConversationTitle,
  startOfLocalDay,
  startOfLocalDayOffset,
} from '../companion-drawer-model';

function conversation(overrides: Partial<Conversation> & Pick<Conversation, 'id' | 'lastMessageAt'>): Conversation {
  return {
    messages: [{ id: `${overrides.id}-u`, role: 'user', content: 'Hello', timestamp: 1, status: 'sent' }],
    createdAt: 1,
    title: overrides.title ?? overrides.id,
    topicTags: [],
    archived: true,
    ...overrides,
  };
}

describe('formatRelativeDate', () => {
  const now = Date.parse('2026-09-13T15:00:00.000Z');

  it('shows minutes below one hour instead of 0h ago', () => {
    expect(formatRelativeDate(now - 25 * 60_000, now)).toBe('25m ago');
    expect(formatRelativeDate(now - 90_000, now)).toBe('1m ago');
  });
});

describe('buildListItems calendar grouping', () => {
  it('groups by latest activity on local calendar days, not createdAt', () => {
    const now = Date.parse('2026-09-13T18:00:00.000-07:00');
    const todayStart = startOfLocalDay(now);
    const weekActivity = todayStart - 2 * 24 * 60 * 60 * 1000;
    const earlierActivity = todayStart - 10 * 24 * 60 * 60 * 1000;

    const items = buildListItems([
      conversation({
        id: 'old-thread',
        title: 'Old thread used today',
        createdAt: earlierActivity,
        lastMessageAt: todayStart + 60_000,
      }),
      conversation({
        id: 'week-thread',
        title: 'This week',
        createdAt: earlierActivity,
        lastMessageAt: weekActivity,
      }),
      conversation({
        id: 'earlier-thread',
        title: 'Earlier',
        createdAt: earlierActivity,
        lastMessageAt: earlierActivity,
      }),
    ], now);

    const labels = items.filter((item) => item.type === 'header').map((item) => item.label);
    expect(labels).toEqual(['Today', 'This Week', 'Earlier']);
    expect(items.find((item) => item.type === 'conversation' && item.conversation.id === 'old-thread')).toBeTruthy();
    const todayHeader = items.findIndex((item) => item.type === 'header' && item.label === 'Today');
    const todayRow = items[todayHeader + 1];
    expect(todayRow.type === 'conversation' && todayRow.conversation.id).toBe('old-thread');
  });

  it('offsets this-week bounds by local calendar days, not a fixed millisecond span', () => {
    const now = new Date(2026, 10, 3, 15, 0, 0).getTime();
    const sixDaysAgo = new Date(2026, 9, 28, 8, 0, 0).getTime();
    const sevenDaysAgo = new Date(2026, 9, 27, 8, 0, 0).getTime();
    const weekStart = startOfLocalDayOffset(now, -6);

    expect(weekStart).toBe(new Date(2026, 10, 3 - 6).getTime());

    const items = buildListItems([
      conversation({ id: 'week-thread', title: 'Week', lastMessageAt: sixDaysAgo }),
      conversation({ id: 'earlier-thread', title: 'Earlier', lastMessageAt: sevenDaysAgo }),
    ], now);

    const weekHeader = items.findIndex((item) => item.type === 'header' && item.label === 'This Week');
    const earlierHeader = items.findIndex((item) => item.type === 'header' && item.label === 'Earlier');
    expect(weekHeader).toBeGreaterThanOrEqual(0);
    expect(earlierHeader).toBeGreaterThan(weekHeader);
    const weekRow = items[weekHeader + 1];
    const earlierRow = items[earlierHeader + 1];
    expect(weekRow.type === 'conversation' && weekRow.conversation.id).toBe('week-thread');
    expect(earlierRow.type === 'conversation' && earlierRow.conversation.id).toBe('earlier-thread');
  });
});

describe('conversationMatchesTitleQuery', () => {
  const prayer = conversation({
    id: 'p1',
    title: 'Prayer for patience',
    lastMessageAt: 1,
  });

  it('matches titles and reports a miss for the no-result state', () => {
    expect(conversationMatchesTitleQuery(prayer, 'patience')).toBe(true);
    expect(conversationMatchesTitleQuery(prayer, 'Elijah')).toBe(false);
  });

  it('searches the full title, not the 60-character display truncation', () => {
    const long = conversation({
      id: 'long',
      title: `${'A'.repeat(70)}hidden-suffix-token`,
      lastMessageAt: 1,
    });
    expect(getConversationTitle(long)).not.toContain('hidden-suffix-token');
    expect(conversationMatchesTitleQuery(long, 'hidden-suffix-token')).toBe(true);
    expect(conversationMatchesTitleQuery(long, 'missing-token')).toBe(false);
  });
});
