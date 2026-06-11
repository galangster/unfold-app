import {
  deriveConversationTitleFromText,
  sentenceCaseTitle,
} from '@/lib/companion-chat-store';

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

describe('deriveConversationTitleFromText', () => {
  it('produces sentence case, preserving the user’s own casing', () => {
    expect(deriveConversationTitleFromText('how do I trust God with my future')).toBe(
      'Trust God with my future',
    );
  });

  it('no longer machine-Title-Cases every word', () => {
    const title = deriveConversationTitleFromText('tell me about dealing with anxiety');
    expect(title).toBe('Tell me about dealing with anxiety');
  });
});

describe('sentenceCaseTitle', () => {
  it('de-slops machine Title Case from stored/AI titles', () => {
    expect(sentenceCaseTitle('Dealing With Anxiety And Fear')).toBe(
      'Dealing with anxiety and fear',
    );
  });

  it('keeps faith proper nouns and I', () => {
    expect(sentenceCaseTitle('Trusting God When I Doubt')).toBe('Trusting God when I doubt');
    expect(sentenceCaseTitle("Resting In God's Promises")).toBe("Resting in God's promises");
    expect(sentenceCaseTitle('Walking With Jesus Daily')).toBe('Walking with Jesus daily');
  });

  it('keeps Bible book names and verse-shaped words', () => {
    expect(sentenceCaseTitle('Understanding Psalm 23 Today')).toBe('Understanding Psalm 23 today');
    expect(sentenceCaseTitle('Questions About John 3:16')).toBe('Questions about John 3:16');
    expect(sentenceCaseTitle('Studying 1 Corinthians 13 Together')).toBe(
      'Studying 1 Corinthians 13 together',
    );
  });

  it('leaves acronyms and mixed-case words untouched', () => {
    expect(sentenceCaseTitle('Reading The NIV Translation')).toBe('Reading the NIV translation');
  });

  it('is a no-op on already-sentence-case titles', () => {
    const s = 'A quiet morning with scripture';
    expect(sentenceCaseTitle(s)).toBe(s);
  });
});
