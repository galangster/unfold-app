import type { DevotionalDay } from '@/lib/store';
import { buildReaderContents } from '../ReaderOutlineSheet';

const day = {
  dayNumber: 2,
  title: 'Strength for the Middle',
  scriptureReference: 'Isaiah 40:31',
  scriptureText: '',
  bodyText: '',
  quotableLine: '',
  isRead: false,
} as DevotionalDay;

describe('buildReaderContents', () => {
  it('always lists Scripture and Devotional, then only the sections the day has', () => {
    expect(buildReaderContents(day).map((r) => r.section)).toEqual(['scripture', 'devotional']);
    expect(
      buildReaderContents({ ...day, reflectionQuestions: ['Why?'], act: 'Call a friend.', closingPrayer: 'Amen.' }).map((r) => r.section),
    ).toEqual(['scripture', 'devotional', 'reflection', 'act', 'prayer']);
  });

  it('labels rows with the reference, title and question count', () => {
    const rows = buildReaderContents({ ...day, reflectionQuestions: ['a', 'b'] });
    expect(rows[0]).toMatchObject({ label: 'Scripture', detail: 'Isaiah 40:31' });
    expect(rows[1]).toMatchObject({ label: 'Devotional', detail: 'Strength for the Middle' });
    expect(rows[2]).toMatchObject({ label: 'For Reflection', detail: '2 questions' });
  });
});
