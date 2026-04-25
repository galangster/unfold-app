import { buildNoteDraftDockPreview } from '@/lib/note-draft-dock';

describe('buildNoteDraftDockPreview', () => {
  it('uses the explicit title and normalized preview text', () => {
    expect(buildNoteDraftDockPreview({
      title: '  Prayer plan  ',
      plainText: ' Romans 8:28\n\n  remember this ',
    })).toEqual({
      title: 'Prayer plan',
      preview: 'Romans 8:28 remember this',
    });
  });

  it('falls back to body text when the title is empty', () => {
    expect(buildNoteDraftDockPreview({
      title: '',
      plainText: 'A long draft that should become the temporary dock title preview line.',
    }).title).toBe('A long draft that should become the tempor');
  });

  it('keeps empty drafts restorable', () => {
    expect(buildNoteDraftDockPreview({ title: ' ', plainText: ' ' })).toEqual({
      title: 'Untitled note',
      preview: 'Draft saved — tap to restore.',
    });
  });
});
