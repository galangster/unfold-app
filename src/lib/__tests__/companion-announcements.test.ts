import { companionReplyAnnouncement, ANNOUNCEMENT_MAX_CHARS } from '../companion-announcements';

describe('companionReplyAnnouncement (WR-20)', () => {
  it('passes plain replies through', () => {
    expect(companionReplyAnnouncement('God loves you deeply.')).toBe('God loves you deeply.');
  });

  it('strips markdown syntax the visual renderer formats', () => {
    expect(
      companionReplyAnnouncement('## Hope\n\n**Bold truth** and *gentle* words.\n\n- first\n- second\n\n---'),
    ).toBe('Hope Bold truth and gentle words. first second');
  });

  it('unwraps scripture reference brackets', () => {
    expect(companionReplyAnnouncement('Read [Romans 5:8] tonight.')).toBe('Read Romans 5:8 tonight.');
  });

  it('drops blockquote markers and collapses whitespace', () => {
    expect(companionReplyAnnouncement('> Be still.\n\n\nAnd   know.')).toBe('Be still. And know.');
  });

  it('returns null when nothing remains to announce', () => {
    expect(companionReplyAnnouncement('')).toBeNull();
    expect(companionReplyAnnouncement('   \n\n---\n')).toBeNull();
  });

  it('truncates long replies on a word boundary with an ellipsis', () => {
    const longReply = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const announced = companionReplyAnnouncement(longReply)!;
    expect(announced.length).toBeLessThanOrEqual(ANNOUNCEMENT_MAX_CHARS + 1);
    expect(announced.endsWith('…')).toBe(true);
    // Ends on a whole word from the source, not mid-word.
    const lastWord = announced.slice(0, -1).split(' ').pop()!;
    expect(longReply.split(' ')).toContain(lastWord);
  });

  it('does not truncate replies at or under the cap', () => {
    const short = 'a'.repeat(ANNOUNCEMENT_MAX_CHARS);
    expect(companionReplyAnnouncement(short)).toBe(short);
  });
});
