import { companionReplyAnnouncement } from '../companion-announcements';

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
});
