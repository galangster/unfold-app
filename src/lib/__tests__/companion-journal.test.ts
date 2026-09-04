import {
  appendJournalContent,
  buildCompanionJournalBlock,
  isReplyAlreadyInJournal,
} from '../companion-journal';

describe('companion journal helpers', () => {
  it('builds a journal block and truncates questions after 120 characters', () => {
    const question = `  ${'q'.repeat(121)}  `;

    expect(buildCompanionJournalBlock({ question, reply: '  A grounded reply.  ' })).toBe(
      `From the companion, in reply to "${'q'.repeat(120)}…":\nA grounded reply.`,
    );
  });

  it('drops the question clause when there is no question to quote', () => {
    expect(buildCompanionJournalBlock({ question: '  ', reply: 'A reply.' })).toBe(
      'From the companion:\nA reply.',
    );
  });

  it('uses the block as the full content when the existing entry is empty', () => {
    expect(appendJournalContent('  \n ', 'New block')).toBe('New block');
  });

  it('appends after one blank line when the entry already has content', () => {
    expect(appendJournalContent('Existing note.  \n', 'New block')).toBe(
      'Existing note.\n\nNew block',
    );
  });

  it('recognizes an existing trimmed reply so saving is idempotent', () => {
    expect(isReplyAlreadyInJournal('Header\nThe saved reply.\nFooter', '  The saved reply.  ')).toBe(true);
    expect(isReplyAlreadyInJournal('Header only', 'The saved reply.')).toBe(false);
  });
});
