import type { Devotional } from '@/lib/store';
import type { WordStudy } from '@/lib/word-study';
import { generateDevotionalHTML } from '@/lib/pdf-export';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  File: class MockFile {},
  Paths: { cache: 'file:///cache' },
}));

function makeDevotional(wordStudy: WordStudy): Devotional {
  return {
    id: 'devotional-1',
    title: 'A Safe Export',
    totalDays: 1,
    currentDay: 1,
    createdAt: '2026-07-21T00:00:00.000Z',
    generationMode: 'batch',
    userContext: {
      name: 'Reader',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    days: [{
      dayNumber: 1,
      title: 'Day One',
      scriptureReference: 'Matthew 11:28',
      scriptureText: 'Come to me, all who are weary.',
      bodyText: 'Rest is received.',
      quotableLine: 'Grace carries the load.',
      isRead: false,
      wordStudy,
    }],
  };
}

describe('PDF word-study rendering', () => {
  it('renders and escapes backend prose word studies', () => {
    const html = generateDevotionalHTML(
      makeDevotional('The <Greek> word & "burden\'s" meaning.'),
    );

    expect(html).toContain('<h4>Word Study</h4>');
    expect(html).toContain(
      'The &lt;Greek&gt; word &amp; &quot;burden&#39;s&quot; meaning.',
    );
    expect(html).not.toContain('The <Greek> word');
  });

  it('keeps legacy structured word studies readable', () => {
    const html = generateDevotionalHTML(makeDevotional({
      term: 'rest',
      original: 'anapausis',
      meaning: 'Relief and restoration.',
    }));

    expect(html).toContain('<strong>rest</strong> <em>(anapausis)</em>');
    expect(html).toContain('<p>Relief and restoration.</p>');
  });
});
