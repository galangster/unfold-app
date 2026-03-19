import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Redirect shim for the old editor route.
 *
 * Previously this was the standalone editor screen; now `note-detail.tsx`
 * handles both reading and editing. Any navigation to this route (e.g.,
 * the "+" create button on the journal index) is forwarded to
 * `note-detail` with `startEditing: 'true'` so it opens in edit mode.
 */
export default function NoteRedirect() {
  const params = useLocalSearchParams<{
    noteId?: string;
    devotionalId?: string;
    dayNumber?: string;
    bookId?: string;
    chapter?: string;
    verse?: string;
    verseEnd?: string;
    verseText?: string;
    reference?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/(tabs)/(journal)/note-detail',
        params: { ...params, startEditing: 'true' },
      }}
    />
  );
}
