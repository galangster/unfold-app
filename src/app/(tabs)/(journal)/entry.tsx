import { Redirect, useLocalSearchParams } from 'expo-router';

// Redirect to the journal screen in the today tab for now
// This will be enhanced in Phase 4 with the full journal entry view
export default function JournalEntryScreen() {
  const { devotionalId, dayNumber } = useLocalSearchParams<{
    devotionalId: string;
    dayNumber: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/(tabs)/(today)/journal',
        params: { devotionalId, dayNumber },
      }}
    />
  );
}
